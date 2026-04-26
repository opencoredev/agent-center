import {
  GitHubApiError,
  GitHubAuthenticationError,
  GitHubProviderError,
  createGitHubProvider,
} from "@agent-center/github";
import type { GitRepository, RepoProvider } from "@agent-center/shared";

import { ApiError, notFoundError } from "../http/errors";
import { githubAppService } from "./github-app-service";
import {
  createRepoConnection,
  deleteRepoConnection,
  findRepoConnectionById,
  findRepoConnectionByWorkspaceAndId,
  listRepoConnections,
  updateRepoConnection,
} from "../repositories/repo-connection-repository";
import { findWorkspaceById, listWorkspaces } from "../repositories/workspace-repository";
import { projectService } from "./project-service";
import { serializeRepoConnection } from "./serializers";

interface RepoConnectionTestResult {
  checkedAt: string;
  error: string | null;
  ok: boolean;
  provider: RepoProvider;
  repository: GitRepository | null;
  status: number | null;
}

type RepoConnectionRecord = Exclude<Awaited<ReturnType<typeof findRepoConnectionById>>, undefined>;

interface RepoConnectionTester {
  test(connection: RepoConnectionRecord): Promise<RepoConnectionTestResult>;
}

class GitHubRepoConnectionTester implements RepoConnectionTester {
  #provider = createGitHubProvider();

  async test(connection: RepoConnectionRecord): Promise<RepoConnectionTestResult> {
    const installationId = Number(
      (connection.connectionMetadata as Record<string, unknown> | null)?.installationId,
    );
    const token =
      connection.authType === "github_app_installation" &&
      Number.isInteger(installationId) &&
      installationId > 0
        ? (await githubAppService.getInstallationAccessToken(installationId)).token
        : undefined;

    const access = await this.#provider.testRepositoryAccess({
      owner: connection.owner,
      repo: connection.repo,
      authType: connection.authType,
      connectionMetadata: connection.connectionMetadata,
      token,
    });

    return {
      checkedAt: new Date().toISOString(),
      error: access.error,
      ok: access.ok,
      provider: connection.provider,
      repository: access.repository,
      status: access.status,
    };
  }
}

const repoConnectionTesters: Record<RepoProvider, RepoConnectionTester> = {
  github: new GitHubRepoConnectionTester(),
};

function getRepoConnectionTester(provider: RepoProvider) {
  return repoConnectionTesters[provider];
}

function canUseOwnerlessWorkspace(userId?: string) {
  return process.env.NODE_ENV !== "production" && userId !== undefined;
}

async function assertWorkspaceAccess(workspaceId: string, userId?: string) {
  const workspace = await findWorkspaceById(workspaceId);

  if (workspace === undefined) {
    throw notFoundError("workspace", workspaceId);
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

async function resolveGitHubInstallationRepository(input: {
  workspaceId: string;
  userId?: string;
  authType: string;
  connectionMetadata: Record<string, unknown> | null;
  owner: string;
  repo: string;
}) {
  if (input.authType !== "github_app_installation") {
    return null;
  }

  const installationId = Number(input.connectionMetadata?.installationId);

  if (!Number.isInteger(installationId) || installationId <= 0) {
    throw new ApiError(
      400,
      "github_installation_required",
      "GitHub App connections must include a valid installationId",
    );
  }

  const repositories = await githubAppService.listInstallationRepositories({
    installationId,
    workspaceId: input.workspaceId,
    userId: input.userId,
  });
  const repository = repositories.repositories.find(
    (candidate) =>
      candidate.ownerLogin.toLowerCase() === input.owner.toLowerCase() &&
      candidate.name.toLowerCase() === input.repo.toLowerCase(),
  );

  if (!repository) {
    throw new ApiError(
      403,
      "github_installation_repository_forbidden",
      "The selected GitHub App installation does not have access to this repository",
      {
        installationId,
        owner: input.owner,
        repo: input.repo,
      },
    );
  }

  return repository;
}

function buildRepoConnectionTestError(result: RepoConnectionTestResult, repoConnectionId: string) {
  const status = result.status ?? 500;

  if (status === 401) {
    return new ApiError(
      401,
      "repo_connection_auth_failed",
      result.error ?? "GitHub authentication failed",
      {
        repoConnectionId,
        testResult: result,
      },
    );
  }

  if (status === 403) {
    return new ApiError(
      403,
      "repo_connection_access_forbidden",
      result.error ?? "GitHub access was forbidden",
      {
        repoConnectionId,
        testResult: result,
      },
    );
  }

  if (status === 404) {
    return new ApiError(
      404,
      "repo_connection_repository_not_found",
      result.error ?? "GitHub repository was not found",
      {
        repoConnectionId,
        testResult: result,
      },
    );
  }

  return new ApiError(
    status,
    "repo_connection_test_failed",
    result.error ?? "Repo connection test failed",
    {
      repoConnectionId,
      testResult: result,
    },
  );
}

function normalizeRepoConnectionTestError(error: unknown, repoConnectionId: string): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof GitHubAuthenticationError) {
    return new ApiError(401, "repo_connection_auth_failed", error.message, {
      repoConnectionId,
    });
  }

  if (error instanceof GitHubApiError) {
    return new ApiError(error.status ?? 500, "repo_connection_test_failed", error.message, {
      repoConnectionId,
    });
  }

  if (error instanceof GitHubProviderError) {
    return new ApiError(error.status ?? 500, "repo_connection_test_failed", error.message, {
      repoConnectionId,
    });
  }

  return new ApiError(500, "repo_connection_test_failed", "Repo connection test failed", {
    repoConnectionId,
  });
}

export const repoConnectionService = {
  async list(
    filters: { workspaceId?: string; projectId?: string; provider?: RepoProvider },
    userId?: string,
  ) {
    if (filters.workspaceId) {
      await assertWorkspaceAccess(filters.workspaceId, userId);
    }

    const repoConnections =
      userId && filters.workspaceId === undefined
        ? (
            await Promise.all(
              (
                await listWorkspaces()
              )
                .filter(
                  (workspace) =>
                    workspace.ownerId === userId ||
                    (workspace.ownerId === undefined && canUseOwnerlessWorkspace(userId)),
                )
                .map((workspace) =>
                  listRepoConnections({
                    ...filters,
                    workspaceId: workspace.id,
                  }),
                ),
            )
          ).flat()
        : await listRepoConnections(filters);
    const deduped = new Map<string, (typeof repoConnections)[number]>();

    for (const repoConnection of repoConnections) {
      const key = [
        repoConnection.workspaceId,
        repoConnection.provider,
        repoConnection.owner.toLowerCase(),
        repoConnection.repo.toLowerCase(),
      ].join(":");

      if (!deduped.has(key)) {
        deduped.set(key, repoConnection);
      }
    }

    return Array.from(deduped.values()).map(serializeRepoConnection);
  },

  async create(
    input: {
      workspaceId: string;
      projectId: string | null;
      provider: RepoProvider;
      owner: string;
      repo: string;
      defaultBranch: string | null;
      authType: string;
      connectionMetadata: Record<string, unknown> | null;
    },
    userId?: string,
  ) {
    await assertWorkspaceAccess(input.workspaceId, userId);

    if (input.projectId !== null) {
      await projectService.assertWithinWorkspace(input.workspaceId, input.projectId);
    }

    const installationRepository = await resolveGitHubInstallationRepository({
      ...input,
      userId,
    });

    const existing = (
      await listRepoConnections({
        workspaceId: input.workspaceId,
        provider: input.provider,
      })
    ).find(
      (repoConnection) =>
        repoConnection.owner.toLowerCase() === input.owner.toLowerCase() &&
        repoConnection.repo.toLowerCase() === input.repo.toLowerCase(),
    );

    const resolvedDefaultBranch =
      input.defaultBranch ?? installationRepository?.defaultBranch ?? null;
    const resolvedProject =
      input.projectId !== null
        ? await projectService.assertWithinWorkspace(input.workspaceId, input.projectId)
        : installationRepository
          ? await projectService.findOrCreateRepositoryProject({
              workspaceId: input.workspaceId,
              owner: input.owner,
              repo: input.repo,
              defaultBranch: resolvedDefaultBranch ?? "main",
            })
          : null;

    if (existing) {
      const nextProjectId = resolvedProject?.id ?? existing.projectId;
      const nextDefaultBranch = resolvedDefaultBranch ?? existing.defaultBranch;
      const nextAuthType = input.authType;
      const nextConnectionMetadata = input.connectionMetadata;
      const shouldUpdate =
        nextProjectId !== existing.projectId ||
        nextDefaultBranch !== existing.defaultBranch ||
        nextAuthType !== existing.authType ||
        JSON.stringify(nextConnectionMetadata ?? null) !==
          JSON.stringify((existing.connectionMetadata as Record<string, unknown> | null) ?? null);

      if (shouldUpdate) {
        const updated = await updateRepoConnection(existing.id, {
          projectId: nextProjectId,
          defaultBranch: nextDefaultBranch,
          authType: nextAuthType,
          connectionMetadata: nextConnectionMetadata,
          updatedAt: new Date(),
        });
        return serializeRepoConnection(updated);
      }

      return serializeRepoConnection(existing);
    }

    const repoConnection = await createRepoConnection({
      workspaceId: input.workspaceId,
      projectId: resolvedProject?.id ?? input.projectId,
      provider: input.provider,
      owner: input.owner,
      repo: input.repo,
      defaultBranch: resolvedDefaultBranch,
      authType: input.authType,
      connectionMetadata: input.connectionMetadata,
    });

    return serializeRepoConnection(repoConnection);
  },

  async getById(repoConnectionId: string, userId?: string) {
    const repoConnection = await findRepoConnectionById(repoConnectionId);

    if (repoConnection === undefined) {
      throw notFoundError("repo_connection", repoConnectionId);
    }

    await assertWorkspaceAccess(repoConnection.workspaceId, userId);

    return serializeRepoConnection(repoConnection);
  },

  async delete(repoConnectionId: string, userId?: string) {
    const repoConnection = await findRepoConnectionById(repoConnectionId);

    if (repoConnection === undefined) {
      throw notFoundError("repo_connection", repoConnectionId);
    }

    await assertWorkspaceAccess(repoConnection.workspaceId, userId);

    await deleteRepoConnection(repoConnectionId);

    return { deleted: true as const };
  },

  async test(repoConnectionId: string, userId?: string) {
    const repoConnection = await findRepoConnectionById(repoConnectionId);

    if (repoConnection === undefined) {
      throw notFoundError("repo_connection", repoConnectionId);
    }

    await assertWorkspaceAccess(repoConnection.workspaceId, userId);

    const tester = getRepoConnectionTester(repoConnection.provider);

    try {
      const result = await tester.test(repoConnection);

      if (!result.ok) {
        throw buildRepoConnectionTestError(result, repoConnectionId);
      }

      return {
        ...result,
        repoConnection: serializeRepoConnection(repoConnection),
      };
    } catch (error) {
      throw normalizeRepoConnectionTestError(error, repoConnectionId);
    }
  },

  async assertWithinWorkspace(
    workspaceId: string,
    repoConnectionId: string,
    projectId?: string | null,
  ) {
    const repoConnection = await findRepoConnectionByWorkspaceAndId(workspaceId, repoConnectionId);

    if (repoConnection === undefined) {
      throw notFoundError("repo_connection", repoConnectionId);
    }

    if (projectId !== undefined && repoConnection.projectId !== projectId) {
      throw new ApiError(
        409,
        "repo_connection_project_mismatch",
        "Repo connection does not belong to the requested project",
        {
          projectId,
          repoConnectionId,
        },
      );
    }

    return repoConnection;
  },
};
