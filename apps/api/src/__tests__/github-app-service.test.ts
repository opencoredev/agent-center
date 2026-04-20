import { beforeEach, describe, expect, mock, test } from "bun:test";

const ownedWorkspace = {
  id: "11111111-1111-1111-1111-111111111111",
  ownerId: "user-1",
};

const otherWorkspace = {
  id: "22222222-2222-2222-2222-222222222222",
  ownerId: "user-2",
};

const mockGetApp = mock(async () => ({
  id: 3332050,
  slug: "agent-center-dev",
  name: "Agent Center DEV",
  description: null,
  externalUrl: null,
  htmlUrl: "https://github.com/apps/agent-center-dev",
  ownerLogin: "opencoded",
}));

const mockListInstallations = mock(async () => [
  {
    id: 42,
    accountLogin: "opencoded",
    accountType: "Organization",
    targetType: "Organization",
    repositorySelection: "selected",
    htmlUrl: "https://github.com/organizations/opencoded/settings/installations/42",
    appId: 3332050,
  },
]);

const mockListInstallationRepositories = mock(async () => ({
  totalCount: 1,
  repositories: [
    {
      id: 7,
      name: "agent.center",
      fullName: "opencoded/agent.center",
      ownerLogin: "opencoded",
      defaultBranch: "main",
      private: true,
      visibility: "private",
      htmlUrl: "https://github.com/opencoded/agent.center",
      permissions: {
        contents: true,
      },
    },
  ],
}));

const mockCreateInstallationAccessToken = mock(async () => ({
  token: "ghs_installation_token",
}));
const mockGetUser = mock(async (login: string) => ({
  id: 123456,
  login,
  type: "Bot",
  htmlUrl: `https://github.com/${login}`,
  avatarUrl: "https://avatars.githubusercontent.com/u/123456?v=4",
}));
const mockCreateIssueComment = mock(async () => ({
  id: 77,
  body: "hello",
  htmlUrl: "https://github.com/opencoded/agent.center/issues/1#issuecomment-77",
}));
const mockUpdateIssueComment = mock(async () => ({
  id: 77,
  body: "updated body",
  htmlUrl: "https://github.com/opencoded/agent.center/issues/1#issuecomment-77",
}));
const mockCreateIssueReaction = mock(async () => ({
  id: 88,
  content: "eyes",
}));
const mockCreateIssueCommentReaction = mock(async () => ({
  id: 89,
  content: "eyes",
}));

const mockFindWorkspaceById = mock(async (workspaceId: string) => {
  if (workspaceId === ownedWorkspace.id) {
    return ownedWorkspace;
  }

  if (workspaceId === otherWorkspace.id) {
    return otherWorkspace;
  }

  return undefined;
});

const mockListWorkspaces = mock(async () => [ownedWorkspace, otherWorkspace]);
const mockListRepoConnections = mock(async ({ workspaceId }: { workspaceId?: string }) => {
  if (workspaceId === ownedWorkspace.id) {
    return [
      {
        authType: "github_app_installation",
        connectionMetadata: {
          installationId: 42,
        },
      },
    ];
  }

  return [];
});

mock.module("@agent-center/github", () => ({
  GitHubApiError: class GitHubApiError extends Error {
    status = 500;
  },
  GitHubAppApiError: class GitHubAppApiError extends Error {},
  GitHubAppConfigurationError: class GitHubAppConfigurationError extends Error {},
  GitHubAuthenticationError: class GitHubAuthenticationError extends Error {
    status = 401;
  },
  GitHubAppClient: class GitHubAppClient {
    getApp = mockGetApp;
    listInstallations = mockListInstallations;
    listInstallationRepositories = mockListInstallationRepositories;
    createInstallationAccessToken = mockCreateInstallationAccessToken;
    getUser = mockGetUser;
    createIssueComment = mockCreateIssueComment;
    updateIssueComment = mockUpdateIssueComment;
    createIssueReaction = mockCreateIssueReaction;
    createIssueCommentReaction = mockCreateIssueCommentReaction;
  },
  GitHubProviderError: class GitHubProviderError extends Error {
    status = 500;
  },
  buildGitHubAppInstallUrl: ({ slug }: { slug: string }) =>
    `https://github.com/apps/${slug}/installations/new`,
  createGitHubProvider: () => ({
    testRepositoryAccess: async () => ({
      ok: true,
      status: 200,
      error: null,
      repository: null,
    }),
  }),
}));

mock.module("../repositories/workspace-repository", () => ({
  findWorkspaceById: mockFindWorkspaceById,
  listWorkspaces: mockListWorkspaces,
}));

mock.module("../repositories/repo-connection-repository", () => ({
  createRepoConnection: mock(async () => undefined),
  deleteRepoConnection: mock(async () => undefined),
  findRepoConnectionById: mock(async () => undefined),
  findRepoConnectionByWorkspaceAndId: mock(async () => undefined),
  listRepoConnections: mockListRepoConnections,
  updateRepoConnection: mock(async () => undefined),
}));

const { apiEnv } = await import("../env");
const { githubAppService } = await import("../services/github-app-service");

const originalApiEnv = {
  GITHUB_APP_ID: apiEnv.GITHUB_APP_ID,
  GITHUB_APP_SLUG: apiEnv.GITHUB_APP_SLUG,
  GITHUB_APP_CLIENT_ID: apiEnv.GITHUB_APP_CLIENT_ID,
  GITHUB_APP_PRIVATE_KEY: apiEnv.GITHUB_APP_PRIVATE_KEY,
  GITHUB_APP_CALLBACK_URL: apiEnv.GITHUB_APP_CALLBACK_URL,
  GITHUB_APP_SETUP_URL: apiEnv.GITHUB_APP_SETUP_URL,
};

describe("github-app-service", () => {
  beforeEach(() => {
    mockGetApp.mockClear();
    mockListInstallations.mockClear();
    mockListInstallationRepositories.mockClear();
    mockCreateInstallationAccessToken.mockClear();
    mockGetUser.mockClear();
    mockCreateIssueComment.mockClear();
    mockUpdateIssueComment.mockClear();
    mockCreateIssueReaction.mockClear();
    mockCreateIssueCommentReaction.mockClear();
    mockFindWorkspaceById.mockClear();
    mockListWorkspaces.mockClear();
    mockListRepoConnections.mockClear();

    Object.assign(apiEnv, originalApiEnv);
  });

  test("returns a healthy status when the app is configured", async () => {
    Object.assign(apiEnv, {
      GITHUB_APP_ID: "3332050",
      GITHUB_APP_SLUG: "agent-center-dev",
      GITHUB_APP_CLIENT_ID: "Iv23example",
      GITHUB_APP_PRIVATE_KEY: "/tmp/agent-center-dev.pem",
      GITHUB_APP_CALLBACK_URL: "http://api.agent-center.localhost:1355/api/auth/github/callback",
      GITHUB_APP_SETUP_URL: "http://agent-center.localhost:1355/settings/repositories",
    });

    const result = await githubAppService.getStatus();

    expect(result).toMatchObject({
      configured: true,
      healthy: true,
      slug: "agent-center-dev",
      installUrl: "https://github.com/apps/agent-center-dev/installations/new",
    });
    expect(mockGetApp).toHaveBeenCalledTimes(1);
  });

  test("returns missing fields when the app is not configured", async () => {
    Object.assign(apiEnv, {
      GITHUB_APP_ID: undefined,
      GITHUB_APP_SLUG: undefined,
      GITHUB_APP_PRIVATE_KEY: undefined,
      GITHUB_APP_CLIENT_ID: undefined,
      GITHUB_APP_CALLBACK_URL: undefined,
      GITHUB_APP_SETUP_URL: undefined,
    });

    const result = await githubAppService.getStatus();

    expect(result.configured).toBe(false);
    expect(result.healthy).toBe(false);
    expect(result.missingFields).toEqual([
      "GITHUB_APP_ID",
      "GITHUB_APP_SLUG",
      "GITHUB_APP_PRIVATE_KEY",
    ]);
  });

  test("scopes authenticated installation listings to linked installations", async () => {
    const result = await githubAppService.listInstallations({ userId: "user-1" });

    expect(result).toEqual([
      expect.objectContaining({
        id: 42,
      }),
    ]);
  });

  test("rejects repository listings outside the caller workspace", async () => {
    await expect(
      githubAppService.listInstallationRepositories({
        installationId: 42,
        workspaceId: otherWorkspace.id,
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "workspace_forbidden",
      status: 403,
    });
  });

  test("allows workspace-scoped repository listings for owned workspaces", async () => {
    const result = await githubAppService.listInstallationRepositories({
      installationId: 42,
      workspaceId: ownedWorkspace.id,
      userId: "user-1",
    });

    expect(mockFindWorkspaceById).toHaveBeenCalledWith(ownedWorkspace.id);
    expect(mockListInstallationRepositories).toHaveBeenCalledWith(42);
    expect(result.totalCount).toBe(1);
  });

  test("filters installation listings down to linked workspace installations", async () => {
    const result = await githubAppService.listInstallations({
      workspaceId: ownedWorkspace.id,
      userId: "user-1",
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: 42,
      }),
    ]);
    expect(result).toHaveLength(1);
  });

  test("resolves the GitHub App bot commit author when the bot account is available", async () => {
    Object.assign(apiEnv, {
      GITHUB_APP_ID: "3332050",
      GITHUB_APP_SLUG: "agent-center-dev",
      GITHUB_APP_PRIVATE_KEY: "/tmp/agent-center-dev.pem",
    });

    const result = await githubAppService.resolveBotCommitAuthor({
      installationId: 42,
      token: "ghs_installation_token",
    });

    expect(mockGetUser).toHaveBeenCalledWith("agent-center-dev[bot]", "ghs_installation_token");
    expect(result).toEqual({
      email: "123456+agent-center-dev[bot]@users.noreply.github.com",
      id: 123456,
      login: "agent-center-dev[bot]",
      name: "agent-center-dev[bot]",
      source: "github_app_bot",
    });
  });

  test("creates an issue comment with an installation token", async () => {
    Object.assign(apiEnv, {
      GITHUB_APP_ID: "3332050",
      GITHUB_APP_SLUG: "agent-center-dev",
      GITHUB_APP_PRIVATE_KEY: "/tmp/agent-center-dev.pem",
    });

    await githubAppService.createIssueComment({
      installationId: 42,
      owner: "opencoded",
      repo: "agent.center",
      issueNumber: 123,
      body: "hello",
    });

    expect(mockCreateInstallationAccessToken).toHaveBeenCalledWith(42);
    expect(mockCreateIssueComment).toHaveBeenCalledWith({
      owner: "opencoded",
      repo: "agent.center",
      issueNumber: 123,
      body: "hello",
      token: "ghs_installation_token",
    });
  });

  test("updates an issue comment with an installation token", async () => {
    Object.assign(apiEnv, {
      GITHUB_APP_ID: "3332050",
      GITHUB_APP_SLUG: "agent-center-dev",
      GITHUB_APP_PRIVATE_KEY: "/tmp/agent-center-dev.pem",
    });

    await githubAppService.updateIssueComment({
      installationId: 42,
      owner: "opencoded",
      repo: "agent.center",
      commentId: 77,
      body: "updated body",
    });

    expect(mockCreateInstallationAccessToken).toHaveBeenCalledWith(42);
    expect(mockUpdateIssueComment).toHaveBeenCalledWith({
      owner: "opencoded",
      repo: "agent.center",
      commentId: 77,
      body: "updated body",
      token: "ghs_installation_token",
    });
  });

  test("adds an eyes reaction to an issue comment when a comment id is provided", async () => {
    Object.assign(apiEnv, {
      GITHUB_APP_ID: "3332050",
      GITHUB_APP_SLUG: "agent-center-dev",
      GITHUB_APP_PRIVATE_KEY: "/tmp/agent-center-dev.pem",
    });

    await githubAppService.createMentionReaction({
      installationId: 42,
      owner: "opencoded",
      repo: "agent.center",
      issueNumber: 123,
      commentId: 999,
    });

    expect(mockCreateInstallationAccessToken).toHaveBeenCalledWith(42);
    expect(mockCreateIssueCommentReaction).toHaveBeenCalledWith({
      owner: "opencoded",
      repo: "agent.center",
      commentId: 999,
      content: "eyes",
      token: "ghs_installation_token",
    });
    expect(mockCreateIssueReaction).not.toHaveBeenCalled();
  });
});
