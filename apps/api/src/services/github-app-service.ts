import {
  GitHubAppApiError,
  GitHubAppClient,
  GitHubAppConfigurationError,
  buildGitHubAppInstallUrl,
} from "@agent-center/github";

import { apiEnv } from "../env";
import { ApiError } from "../http/errors";
import { listRepoConnections } from "../repositories/repo-connection-repository";
import { findWorkspaceById } from "../repositories/workspace-repository";
import { listWorkspaces } from "../repositories/workspace-repository";

const REQUIRED_GITHUB_APP_FIELDS = ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY"] as const;
const GITHUB_API_VERSION = "2022-11-28";

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

  if (userId && workspace.ownerId !== userId) {
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

async function listScopedWorkspaceIds(input: { workspaceId?: string; userId?: string }) {
  if (input.workspaceId) {
    await assertWorkspaceScope(input.workspaceId, input.userId);
    return [input.workspaceId];
  }

  if (input.userId) {
    const workspaces = await listWorkspaces();
    return workspaces
      .filter((workspace) => workspace.ownerId === input.userId)
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

  async listInstallations(input: { workspaceId?: string; userId?: string } = {}) {
    if (!input.userId) {
      return createGitHubAppClient().listInstallations();
    }

    const scopedInstallationIds = await listScopedInstallationIds(input);

    if (scopedInstallationIds.size === 0) {
      return [];
    }

    const installations = await createGitHubAppClient().listInstallations();
    return installations.filter((installation) => scopedInstallationIds.has(installation.id));
  },

  async listInstallationRepositories(input: {
    installationId: number;
    workspaceId?: string;
    userId?: string;
    enforceLinkedScope?: boolean;
  }) {
    await assertWorkspaceScope(input.workspaceId, input.userId);

    if (input.userId && (input.enforceLinkedScope ?? true)) {
      const scopedInstallationIds = await listScopedInstallationIds(input);

      if (!scopedInstallationIds.has(input.installationId)) {
        throw new ApiError(
          403,
          "github_installation_forbidden",
          "The requested GitHub App installation is not linked to the selected workspace scope",
          {
            installationId: input.installationId,
            workspaceId: input.workspaceId ?? null,
          },
        );
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
      const response = await fetch(
        `https://api.github.com/users/${encodeURIComponent(login)}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
            "User-Agent": "@agent-center/github-app",
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        id?: unknown;
        login?: unknown;
      };
      const userId = typeof payload.id === "number" && Number.isFinite(payload.id) ? payload.id : null;
      const resolvedLogin = typeof payload.login === "string" && payload.login.trim().length > 0
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
      if (
        error instanceof GitHubAppConfigurationError ||
        error instanceof GitHubAppApiError
      ) {
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
