import { beforeEach, describe, expect, mock, test } from "bun:test";

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
});
