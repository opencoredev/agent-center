import {
  type GitHubAppInstallation,
  GitHubAppApiError,
  GitHubAppClient,
  GitHubAppConfigurationError,
  buildGitHubAppInstallUrl,
} from "@agent-center/github";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { apiEnv } from "../env";
import { ApiError } from "../http/errors";
import {
  consumeGitHubAppInstallState,
  createGitHubAppInstallState,
  listGitHubAppInstallations,
  upsertGitHubAppInstallation,
} from "../repositories/github-app-installation-repository";
import { listRepoConnections } from "../repositories/repo-connection-repository";
import { findWorkspaceById } from "../repositories/workspace-repository";
import { listWorkspaces } from "../repositories/workspace-repository";

const REQUIRED_GITHUB_APP_FIELDS = [
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_PRIVATE_KEY",
] as const;
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_INSTALL_STATE_TTL_MS = 10 * 60 * 1000;

interface GitHubInstallStatePayload {
  exp: number;
  nonce: string;
  purpose: "github_app_install";
  userId: string;
  workspaceId: string;
}

function getMissingFields() {
  return REQUIRED_GITHUB_APP_FIELDS.filter((field) => {
    const value = apiEnv[field];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

function getInstallUrl() {
  if (!apiEnv.GITHUB_APP_SLUG) {
    return null;
  }

  return buildGitHubAppInstallUrl({
    slug: apiEnv.GITHUB_APP_SLUG,
  });
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getInstallStateSecret() {
  const secret = apiEnv.CREDENTIAL_ENCRYPTION_KEY ?? apiEnv.GITHUB_APP_PRIVATE_KEY;
  if (!secret) {
    throw new ApiError(
      501,
      "github_app_install_state_not_configured",
      "GitHub App install state signing is not configured",
    );
  }

  return secret;
}

function signStatePayload(encodedPayload: string) {
  return createHmac("sha256", getInstallStateSecret()).update(encodedPayload).digest("base64url");
}

function hashInstallState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

function createInstallState(input: { userId: string; workspaceId: string }) {
  const payload: GitHubInstallStatePayload = {
    exp: Date.now() + GITHUB_INSTALL_STATE_TTL_MS,
    nonce: randomBytes(16).toString("base64url"),
    purpose: "github_app_install",
    userId: input.userId,
    workspaceId: input.workspaceId,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signStatePayload(encodedPayload)}`;
}

function verifyInstallState(state: string): GitHubInstallStatePayload {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new ApiError(403, "github_install_state_invalid", "Invalid GitHub App install state");
  }

  const expectedSignature = signStatePayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new ApiError(403, "github_install_state_invalid", "Invalid GitHub App install state");
  }

  let payload: GitHubInstallStatePayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as GitHubInstallStatePayload;
  } catch {
    throw new ApiError(403, "github_install_state_invalid", "Invalid GitHub App install state");
  }

  if (
    payload.purpose !== "github_app_install" ||
    typeof payload.userId !== "string" ||
    typeof payload.workspaceId !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp <= Date.now()
  ) {
    throw new ApiError(403, "github_install_state_invalid", "Invalid GitHub App install state");
  }

  return payload;
}

function buildBaseStatus() {
  return {
    appId: apiEnv.GITHUB_APP_ID ?? null,
    callbackUrl: apiEnv.GITHUB_APP_CALLBACK_URL ?? null,
    clientId: apiEnv.GITHUB_APP_CLIENT_ID ?? null,
    configured: getMissingFields().length === 0,
    installUrl: getInstallUrl(),
    setupUrl: apiEnv.GITHUB_APP_SETUP_URL ?? null,
    slug: apiEnv.GITHUB_APP_SLUG ?? null,
  };
}

function createGitHubAppClient() {
  const missingFields = getMissingFields();

  if (missingFields.length > 0) {
    throw new ApiError(501, "github_app_not_configured", "GitHub App is not configured", {
      missingFields,
    });
  }

  return new GitHubAppClient({
    appId: apiEnv.GITHUB_APP_ID!,
    slug: apiEnv.GITHUB_APP_SLUG!,
    privateKey: apiEnv.GITHUB_APP_PRIVATE_KEY!,
  });
}

function canUseOwnerlessWorkspace(userId?: string) {
  return process.env.NODE_ENV !== "production" && userId !== undefined;
}

function canBrowseUnlinkedInstallations(workspace: Record<string, any> | null, userId?: string) {
  return workspace?.ownerId === undefined && canUseOwnerlessWorkspace(userId);
}

async function assertWorkspaceScope(workspaceId: string | undefined, userId?: string) {
  if (userId && !workspaceId) {
    throw new ApiError(
      400,
      "github_workspace_scope_required",
      "workspaceId is required to access GitHub App installations in an authenticated workspace scope",
    );
  }

  if (!workspaceId) {
    return null;
  }

  const workspace = await findWorkspaceById(workspaceId);

  if (workspace === undefined) {
    throw new ApiError(404, "workspace_not_found", "workspace not found", {
      id: workspaceId,
    });
  }

  if (
    userId &&
    workspace.ownerId !== userId &&
    !(workspace.ownerId === undefined && canUseOwnerlessWorkspace(userId))
  ) {
    throw new ApiError(403, "workspace_forbidden", "You do not have access to this workspace", {
      workspaceId,
    });
  }

  return workspace;
}

function extractInstallationId(connectionMetadata: Record<string, unknown> | null | undefined) {
  const installationId = Number(connectionMetadata?.installationId);
  return Number.isInteger(installationId) && installationId > 0 ? installationId : null;
}

function getInstallationLinkValues(workspaceId: string, installation: GitHubAppInstallation) {
  return {
    workspaceId,
    installationId: installation.id,
    accountLogin: installation.accountLogin,
    accountType: installation.accountType,
    targetType: installation.targetType,
    repositorySelection: installation.repositorySelection,
    htmlUrl: installation.htmlUrl,
    appId: installation.appId,
  };
}

async function listScopedWorkspaceIds(input: { workspaceId?: string; userId?: string }) {
  if (input.workspaceId) {
    await assertWorkspaceScope(input.workspaceId, input.userId);
    return [input.workspaceId];
  }

  if (input.userId) {
    const workspaces = await listWorkspaces();
    return workspaces
      .filter(
        (workspace) =>
          workspace.ownerId === input.userId ||
          (workspace.ownerId === undefined && canUseOwnerlessWorkspace(input.userId)),
      )
      .map((workspace) => workspace.id);
  }

  const workspaces = await listWorkspaces();
  return workspaces.map((workspace) => workspace.id);
}

async function listScopedInstallationIds(input: { workspaceId?: string; userId?: string }) {
  const workspaceIds = await listScopedWorkspaceIds(input);

  if (workspaceIds.length === 0) {
    return new Set<number>();
  }

  const installationIds = new Set<number>();

  for (const workspaceId of workspaceIds) {
    const installationLinks = await listGitHubAppInstallations(workspaceId);

    for (const installationLink of installationLinks) {
      const installationId = Number(installationLink.installationId);
      if (Number.isInteger(installationId) && installationId > 0) {
        installationIds.add(installationId);
      }
    }

    const repoConnections = await listRepoConnections({
      workspaceId,
      provider: "github",
    });

    for (const repoConnection of repoConnections) {
      if (repoConnection.authType !== "github_app_installation") {
        continue;
      }

      const installationId = extractInstallationId(
        repoConnection.connectionMetadata as Record<string, unknown> | null,
      );

      if (installationId) {
        installationIds.add(installationId);
      }
    }
  }

  return installationIds;
}

async function findVisibleInstallation(installationId: number) {
  const installations = await createGitHubAppClient().listInstallations();
  return installations.find((installation) => installation.id === installationId) ?? null;
}

async function linkVisibleInstallationToWorkspace(input: {
  state: string;
  workspaceId: string;
  installationId: number;
  userId: string;
}) {
  const payload = verifyInstallState(input.state);
  if (payload.workspaceId !== input.workspaceId || payload.userId !== input.userId) {
    throw new ApiError(
      403,
      "github_install_state_forbidden",
      "GitHub App install state does not match this workspace",
      {
        installationId: input.installationId,
        workspaceId: input.workspaceId,
      },
    );
  }

  const installation = await findVisibleInstallation(input.installationId);

  if (!installation) {
    throw new ApiError(
      403,
      "github_installation_forbidden",
      "The requested GitHub App installation is not available to this app",
      {
        installationId: input.installationId,
        workspaceId: input.workspaceId,
      },
    );
  }

  const consumedState = await consumeGitHubAppInstallState({
    workspaceId: input.workspaceId,
    userId: input.userId,
    stateHash: hashInstallState(input.state),
  });
  if (!consumedState) {
    throw new ApiError(
      403,
      "github_install_state_invalid",
      "GitHub App install state is invalid, expired, or already used",
      {
        installationId: input.installationId,
        workspaceId: input.workspaceId,
      },
    );
  }

  await upsertGitHubAppInstallation(getInstallationLinkValues(input.workspaceId, installation));
}

export const githubAppService = {
  async getStatus() {
    const missingFields = getMissingFields();

    if (missingFields.length > 0) {
      return {
        ...buildBaseStatus(),
        healthy: false,
        missingFields,
        app: null,
        error: null,
      };
    }

    try {
      const client = createGitHubAppClient();

      return {
        ...buildBaseStatus(),
        healthy: true,
        missingFields,
        app: await client.getApp(),
        error: null,
      };
    } catch (error) {
      if (error instanceof GitHubAppConfigurationError || error instanceof GitHubAppApiError) {
        return {
          ...buildBaseStatus(),
          healthy: false,
          missingFields,
          app: null,
          error: error.message,
        };
      }

      throw error;
    }
  },

  async createWorkspaceInstallUrl(input: { workspaceId: string; userId: string }) {
    const missingFields = getMissingFields();
    if (missingFields.length > 0) {
      throw new ApiError(501, "github_app_not_configured", "GitHub App is not configured", {
        missingFields,
      });
    }

    await assertWorkspaceScope(input.workspaceId, input.userId);
    const state = createInstallState(input);
    await createGitHubAppInstallState({
      workspaceId: input.workspaceId,
      userId: input.userId,
      stateHash: hashInstallState(state),
      expiresAt: verifyInstallState(state).exp,
    });

    return {
      installUrl: buildGitHubAppInstallUrl({
        slug: apiEnv.GITHUB_APP_SLUG!,
        state,
      }),
    };
  },

  async listInstallations(
    input: {
      installationId?: number;
      state?: string;
      workspaceId?: string;
      userId?: string;
    } = {},
  ) {
    if (!input.userId) {
      return createGitHubAppClient().listInstallations();
    }

    if (!input.workspaceId) {
      return [];
    }

    const workspace = await assertWorkspaceScope(input.workspaceId, input.userId);
    const scopedInstallationIds = await listScopedInstallationIds(input);

    if (input.installationId && !scopedInstallationIds.has(input.installationId)) {
      if (!input.state) {
        throw new ApiError(
          403,
          "github_install_state_required",
          "GitHub App install state is required to link a new installation",
          {
            installationId: input.installationId,
            workspaceId: input.workspaceId,
          },
        );
      }
      await linkVisibleInstallationToWorkspace({
        workspaceId: input.workspaceId,
        installationId: input.installationId,
        userId: input.userId,
        state: input.state,
      });
      scopedInstallationIds.add(input.installationId);
    }

    if (scopedInstallationIds.size === 0) {
      return canBrowseUnlinkedInstallations(workspace, input.userId)
        ? createGitHubAppClient().listInstallations()
        : [];
    }

    const installations = await createGitHubAppClient().listInstallations();
    return installations.filter((installation) => scopedInstallationIds.has(installation.id));
  },

  async listInstallationRepositories(input: {
    installationId: number;
    state?: string;
    workspaceId?: string;
    userId?: string;
    enforceLinkedScope?: boolean;
  }) {
    if (input.userId && !input.workspaceId) {
      throw new ApiError(
        400,
        "github_workspace_scope_required",
        "workspaceId is required to access GitHub App installations in an authenticated workspace scope",
      );
    }

    const workspace = input.workspaceId
      ? await assertWorkspaceScope(input.workspaceId, input.userId)
      : null;

    if (input.userId && (input.enforceLinkedScope ?? true)) {
      const scopedInstallationIds = await listScopedInstallationIds(input);

      if (!scopedInstallationIds.has(input.installationId)) {
        if (
          input.workspaceId &&
          input.state &&
          !canBrowseUnlinkedInstallations(workspace, input.userId)
        ) {
          await linkVisibleInstallationToWorkspace({
            workspaceId: input.workspaceId,
            installationId: input.installationId,
            userId: input.userId,
            state: input.state,
          });
        } else if (!canBrowseUnlinkedInstallations(workspace, input.userId)) {
          throw new ApiError(
            403,
            "github_installation_unlinked",
            "Connect the GitHub App installation to this workspace before browsing repositories",
            {
              installationId: input.installationId,
              workspaceId: input.workspaceId ?? null,
            },
          );
        }
      }
    }

    return createGitHubAppClient().listInstallationRepositories(input.installationId);
  },

  async getCommitAuthorIdentity() {
    const slug = apiEnv.GITHUB_APP_SLUG?.trim();

    if (!slug) {
      return null;
    }

    const login = `${slug}[bot]`;

    try {
      const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          "User-Agent": "@agent-center/github-app",
        },
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        id?: unknown;
        login?: unknown;
      };
      const userId =
        typeof payload.id === "number" && Number.isFinite(payload.id) ? payload.id : null;
      const resolvedLogin =
        typeof payload.login === "string" && payload.login.trim().length > 0
          ? payload.login.trim()
          : login;

      if (!userId) {
        return null;
      }

      return {
        login: resolvedLogin,
        name: resolvedLogin,
        email: `${userId}+${resolvedLogin}@users.noreply.github.com`,
        userId,
      };
    } catch {
      return null;
    }
  },

  async getInstallationAccessToken(installationId: number) {
    return createGitHubAppClient().createInstallationAccessToken(installationId);
  },

  getWebhookMentionLogins() {
    const slug = apiEnv.GITHUB_APP_SLUG?.trim();

    if (!slug) {
      return [];
    }

    return [slug, `${slug}[bot]`];
  },

  async createIssueComment(input: {
    installationId: number;
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  }) {
    const client = createGitHubAppClient();
    const token = await client.createInstallationAccessToken(input.installationId);
    return client.createIssueComment({
      owner: input.owner,
      repo: input.repo,
      issueNumber: input.issueNumber,
      body: input.body,
      token: token.token,
    });
  },

  async updateIssueComment(input: {
    installationId: number;
    owner: string;
    repo: string;
    commentId: number;
    body: string;
  }) {
    const client = createGitHubAppClient();
    const token = await client.createInstallationAccessToken(input.installationId);
    return client.updateIssueComment({
      owner: input.owner,
      repo: input.repo,
      commentId: input.commentId,
      body: input.body,
      token: token.token,
    });
  },

  async createMentionReaction(input: {
    installationId: number;
    owner: string;
    repo: string;
    issueNumber: number;
    commentId?: number | null;
    content?: "eyes" | "+1";
  }) {
    const client = createGitHubAppClient();
    const token = await client.createInstallationAccessToken(input.installationId);
    const content = input.content ?? "eyes";

    if (input.commentId) {
      return client.createIssueCommentReaction({
        owner: input.owner,
        repo: input.repo,
        commentId: input.commentId,
        content,
        token: token.token,
      });
    }

    return client.createIssueReaction({
      owner: input.owner,
      repo: input.repo,
      issueNumber: input.issueNumber,
      content,
      token: token.token,
    });
  },

  async deleteMentionReaction(input: {
    installationId: number;
    owner: string;
    repo: string;
    issueNumber: number;
    reactionId: number;
    commentId?: number | null;
  }) {
    const client = createGitHubAppClient();
    const token = await client.createInstallationAccessToken(input.installationId);

    if (input.commentId) {
      return client.deleteIssueCommentReaction({
        owner: input.owner,
        repo: input.repo,
        commentId: input.commentId,
        reactionId: input.reactionId,
        token: token.token,
      });
    }

    return client.deleteIssueReaction({
      owner: input.owner,
      repo: input.repo,
      issueNumber: input.issueNumber,
      reactionId: input.reactionId,
      token: token.token,
    });
  },

  async resolveBotCommitAuthor(input: { installationId: number; token?: string }) {
    if (!apiEnv.GITHUB_APP_SLUG) {
      return {
        email: "automation@agent.center",
        id: null,
        login: null,
        name: "Agent Center",
        source: "fallback" as const,
      };
    }

    const botLogin = `${apiEnv.GITHUB_APP_SLUG}[bot]`;

    try {
      const client = createGitHubAppClient();
      const token =
        input.token ?? (await client.createInstallationAccessToken(input.installationId)).token;
      const botUser = await client.getUser(botLogin, token);

      return {
        email: `${botUser.id}+${botUser.login}@users.noreply.github.com`,
        id: botUser.id,
        login: botUser.login,
        name: botUser.login,
        source: "github_app_bot" as const,
      };
    } catch (error) {
      if (error instanceof GitHubAppConfigurationError || error instanceof GitHubAppApiError) {
        return {
          email: "automation@agent.center",
          id: null,
          login: null,
          name: "Agent Center",
          source: "fallback" as const,
        };
      }

      throw error;
    }
  },
};
