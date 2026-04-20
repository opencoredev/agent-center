import { beforeEach, describe, expect, mock, test } from "bun:test";

const ownedWorkspace = {
  id: "11111111-1111-1111-1111-111111111111",
  ownerId: "user-1",
};

const otherWorkspace = {
  id: "22222222-2222-2222-2222-222222222222",
  ownerId: "user-2",
};

const repoConnectionRecord = {
  id: "repo-connection-1",
  workspaceId: ownedWorkspace.id,
  projectId: null,
  provider: "github" as const,
  owner: "opencodedev",
  repo: "agent-center",
  defaultBranch: "main",
  authType: "github_app_installation",
  connectionMetadata: {
    installationId: 42,
  },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const installationRepositories = {
  totalCount: 1,
  repositories: [
    {
      id: 1,
      name: "agent-center",
      fullName: "opencodedev/agent-center",
      ownerLogin: "opencodedev",
      defaultBranch: "main",
      private: true,
      visibility: "private",
      htmlUrl: "https://github.com/opencodedev/agent-center",
      permissions: {},
    },
  ],
};

const mockFindWorkspaceById = mock(async (workspaceId: string) => {
  if (workspaceId === ownedWorkspace.id) {
    return ownedWorkspace;
  }

  if (workspaceId === otherWorkspace.id) {
    return otherWorkspace;
  }

  return undefined;
});

const mockListRepoConnections = mock(async () => []);
const mockCreateRepoConnection = mock(async (values: Record<string, unknown>) => ({
  ...repoConnectionRecord,
  ...values,
  createdAt: repoConnectionRecord.createdAt,
  updatedAt: repoConnectionRecord.updatedAt,
}));
const mockFindRepoConnectionById = mock(async (repoConnectionId: string) => {
  if (repoConnectionId === repoConnectionRecord.id) {
    return repoConnectionRecord;
  }

  return undefined;
});
const mockDeleteRepoConnection = mock(async () => repoConnectionRecord);
const mockFindRepoConnectionByWorkspaceAndId = mock(async () => repoConnectionRecord);

const mockAssertWithinWorkspace = mock(async () => undefined);
const mockListInstallationRepositories = mock(async () => installationRepositories);

mock.module("@agent-center/github", () => ({
  createGitHubProvider: () => ({
    testRepositoryAccess: async () => ({
      ok: true,
      status: 200,
      error: null,
      repository: {
        provider: "github",
        owner: "opencodedev",
        repo: "agent-center",
        defaultBranch: "main",
        visibility: "private",
        cloneUrl: "https://github.com/opencodedev/agent-center.git",
        htmlUrl: "https://github.com/opencodedev/agent-center",
      },
    }),
  }),
  GitHubApiError: class GitHubApiError extends Error {
    status = 500;
  },
  GitHubAuthenticationError: class GitHubAuthenticationError extends Error {
    status = 401;
  },
  GitHubProviderError: class GitHubProviderError extends Error {
    status = 500;
  },
}));

mock.module("../repositories/workspace-repository", () => ({
  findWorkspaceById: mockFindWorkspaceById,
}));

mock.module("../repositories/repo-connection-repository", () => ({
  createRepoConnection: mockCreateRepoConnection,
  deleteRepoConnection: mockDeleteRepoConnection,
  findRepoConnectionById: mockFindRepoConnectionById,
  findRepoConnectionByWorkspaceAndId: mockFindRepoConnectionByWorkspaceAndId,
  findRepoConnectionByWorkspaceAndRepo: mock(async () => undefined),
  listRepoConnections: mockListRepoConnections,
}));

mock.module("../services/serializers", () => ({
  serializeRepoConnection: (repoConnection: typeof repoConnectionRecord) => ({
    ...repoConnection,
    createdAt: repoConnection.createdAt.toISOString(),
    updatedAt: repoConnection.updatedAt.toISOString(),
  }),
}));

mock.module("../services/project-service", () => ({
  projectService: {
    assertWithinWorkspace: mockAssertWithinWorkspace,
  },
}));

mock.module("../services/github-app-service", () => ({
  githubAppService: {
    listInstallationRepositories: mockListInstallationRepositories,
    getInstallationAccessToken: mock(async () => ({
      token: "ghs_test",
      expires_at: new Date("2026-01-02T00:00:00.000Z").toISOString(),
    })),
  },
}));

const { repoConnectionService } = await import("../services/repo-connection-service");

describe("repo-connection-service", () => {
  beforeEach(() => {
    mockFindWorkspaceById.mockClear();
    mockListRepoConnections.mockClear();
    mockCreateRepoConnection.mockClear();
    mockFindRepoConnectionById.mockClear();
    mockDeleteRepoConnection.mockClear();
    mockFindRepoConnectionByWorkspaceAndId.mockClear();
    mockAssertWithinWorkspace.mockClear();
    mockListInstallationRepositories.mockClear();
  });

  test("rejects creating a repo connection in a workspace the caller does not own", async () => {
    await expect(
      repoConnectionService.create(
        {
          workspaceId: otherWorkspace.id,
          projectId: null,
          provider: "github",
          owner: "opencodedev",
          repo: "agent-center",
          defaultBranch: null,
          authType: "pat",
          connectionMetadata: null,
        },
        "user-1",
      ),
    ).rejects.toMatchObject({
      code: "workspace_forbidden",
      status: 403,
    });
  });

  test("rejects installation-backed connections without a valid installation id", async () => {
    await expect(
      repoConnectionService.create(
        {
          workspaceId: ownedWorkspace.id,
          projectId: null,
          provider: "github",
          owner: "opencodedev",
          repo: "agent-center",
          defaultBranch: null,
          authType: "github_app_installation",
          connectionMetadata: null,
        },
        "user-1",
      ),
    ).rejects.toMatchObject({
      code: "github_installation_required",
      status: 400,
    });
  });

  test("rejects installation-backed connections when the installation cannot access the repo", async () => {
    mockListInstallationRepositories.mockResolvedValueOnce({
      totalCount: 1,
      repositories: [
        {
          id: 2,
          name: "different-repo",
          fullName: "someone-else/different-repo",
          ownerLogin: "someone-else",
          defaultBranch: "main",
          private: true,
          visibility: "private",
          htmlUrl: "https://github.com/someone-else/different-repo",
          permissions: {},
        },
      ],
    });

    await expect(
      repoConnectionService.create(
        {
          workspaceId: ownedWorkspace.id,
          projectId: null,
          provider: "github",
          owner: "opencodedev",
          repo: "agent-center",
          defaultBranch: null,
          authType: "github_app_installation",
          connectionMetadata: {
            installationId: 42,
          },
        },
        "user-1",
      ),
    ).rejects.toMatchObject({
      code: "github_installation_repository_forbidden",
      status: 403,
    });
  });

  test("fills the default branch from the GitHub installation repository when missing", async () => {
    const result = await repoConnectionService.create(
      {
        workspaceId: ownedWorkspace.id,
        projectId: null,
        provider: "github",
        owner: "opencodedev",
        repo: "agent-center",
        defaultBranch: null,
        authType: "github_app_installation",
        connectionMetadata: {
          installationId: 42,
        },
      },
      "user-1",
    );

    expect(mockListInstallationRepositories).toHaveBeenCalledWith(42);
    expect(mockCreateRepoConnection).toHaveBeenCalled();
    expect(result.defaultBranch).toBe("main");
  });

  test("rejects reading a repo connection outside the caller workspace", async () => {
    mockFindRepoConnectionById.mockResolvedValueOnce({
      ...repoConnectionRecord,
      workspaceId: otherWorkspace.id,
    });

    await expect(repoConnectionService.getById(repoConnectionRecord.id, "user-1")).rejects.toMatchObject({
      code: "workspace_forbidden",
      status: 403,
    });
  });
});
