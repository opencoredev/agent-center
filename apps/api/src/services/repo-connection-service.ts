import {
  GitHubApiError,
  GitHubAuthenticationError,
  GitHubProviderError,
  createGitHubProvider,
} from "../../../../packages/github/src/index.ts";
import type { GitRepository, RepoProvider } from "@agent-center/shared";

import { ApiError, notFoundError } from "../http/errors";
import {
  createRepoConnection,
  findRepoConnectionById,
  findRepoConnectionByWorkspaceAndId,
  listRepoConnections,
} from "../repositories/repo-connection-repository";
import { findWorkspaceById } from "../repositories/workspace-repository";
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
    const access = await this.#provider.testRepositoryAccess({
      owner: connection.owner,
      repo: connection.repo,
      authType: connection.authType,
      connectionMetadata: connection.connectionMetadata,
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
  async list(filters: { workspaceId?: string; projectId?: string; provider?: RepoProvider }) {
    const repoConnections = await listRepoConnections(filters);

    return repoConnections.map(serializeRepoConnection);
  },

  async create(input: {
    workspaceId: string;
    projectId: string | null;
    provider: RepoProvider;
    owner: string;
    repo: string;
    defaultBranch: string | null;
    authType: string;
    connectionMetadata: Record<string, unknown> | null;
  }) {
    const workspace = await findWorkspaceById(input.workspaceId);

    if (workspace === undefined) {
      throw notFoundError("workspace", input.workspaceId);
    }

    if (input.projectId !== null) {
      await projectService.assertWithinWorkspace(input.workspaceId, input.projectId);
    }

    const repoConnection = await createRepoConnection({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      provider: input.provider,
      owner: input.owner,
      repo: input.repo,
      defaultBranch: input.defaultBranch,
      authType: input.authType,
      connectionMetadata: input.connectionMetadata,
    });

    return serializeRepoConnection(repoConnection);
  },

  async getById(repoConnectionId: string) {
    const repoConnection = await findRepoConnectionById(repoConnectionId);

    if (repoConnection === undefined) {
      throw notFoundError("repo_connection", repoConnectionId);
    }

    return serializeRepoConnection(repoConnection);
  },

  async test(repoConnectionId: string) {
    const repoConnection = await findRepoConnectionById(repoConnectionId);

    if (repoConnection === undefined) {
      throw notFoundError("repo_connection", repoConnectionId);
    }

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
