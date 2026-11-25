import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

import { normalizeError } from "../http/errors";
import { errorResponse } from "../http/responses";
import type { ApiEnv } from "../http/types";

const mockAuthenticate = mock(async () => ({
  id: "runner-1",
  workspaceId: "workspace-convex-id",
}));

const mockFindRepoConnectionByWorkspaceAndId = mock(async () => ({
  id: "kd778yncdd8bdppvd8ajknfh45863ta4",
  workspaceId: "workspace-convex-id",
  authType: "github_app_installation",
  connectionMetadata: {
    installationId: 12345,
  },
}));

const mockGetInstallationAccessToken = mock(async () => ({
  token: "ghs_installation_token",
  expires_at: "2026-05-04T17:00:00.000Z",
}));

mock.module("../services/runner-service", () => ({
  runnerService: {
    authenticate: mockAuthenticate,
  },
}));

mock.module("../repositories/repo-connection-repository", () => ({
  findRepoConnectionByWorkspaceAndId: mockFindRepoConnectionByWorkspaceAndId,
}));

mock.module("../services/github-app-service", () => ({
  githubAppService: {
    getInstallationAccessToken: mockGetInstallationAccessToken,
  },
}));

const { internalGitHubRoutes } = await import("../routes/internal/github");
mock.restore();

function createTestApp() {
  const app = new Hono<ApiEnv>();
  app.route("/internal/github", internalGitHubRoutes);
  app.onError((error, context) => errorResponse(context, normalizeError(error)));
  return app;
}

describe("internal GitHub routes", () => {
  beforeEach(() => {
    mockAuthenticate.mockClear();
    mockFindRepoConnectionByWorkspaceAndId.mockClear();
    mockGetInstallationAccessToken.mockClear();
  });

  test("accepts Convex repo connection ids for installation token lookup", async () => {
    const repoConnectionId = "kd778yncdd8bdppvd8ajknfh45863ta4";
    const response = await createTestApp().request(
      `/internal/github/repo-connections/${repoConnectionId}/installation-token`,
      {
        headers: {
          authorization: "Bearer acr_runner_token",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        data: {
          token: "ghs_installation_token",
          expiresAt: "2026-05-04T17:00:00.000Z",
        },
      }),
    );
    expect(mockAuthenticate).toHaveBeenCalledWith("acr_runner_token", {
      allowRevoked: true,
    });
    expect(mockFindRepoConnectionByWorkspaceAndId).toHaveBeenCalledWith(
      "workspace-convex-id",
      repoConnectionId,
    );
    expect(mockGetInstallationAccessToken).toHaveBeenCalledWith(12345);
  });

  test("refuses installation tokens for connections that are not GitHub App installations", async () => {
    mockFindRepoConnectionByWorkspaceAndId.mockImplementationOnce(async () => ({
      id: "kd778yncdd8bdppvd8ajknfh45863ta4",
      workspaceId: "workspace-convex-id",
      authType: "pat",
      connectionMetadata: {
        installationId: 12345,
      },
    }));

    const response = await createTestApp().request(
      "/internal/github/repo-connections/kd778yncdd8bdppvd8ajknfh45863ta4/installation-token",
      {
        headers: {
          authorization: "Bearer acr_runner_token",
        },
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: "repo_connection_not_installation_backed" }),
      }),
    );
    expect(mockGetInstallationAccessToken).not.toHaveBeenCalled();
  });
});
