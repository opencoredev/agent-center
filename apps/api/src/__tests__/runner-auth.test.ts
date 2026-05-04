import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

import type { ApiEnv } from "../http/types";

const mockAuthenticate = mock(async () => ({
  id: "runner-1",
  workspaceId: "workspace-1",
}));

mock.module("../services/runner-service", () => ({
  runnerService: {
    authenticate: mockAuthenticate,
  },
}));

const { runnerAuthMiddleware } = await import("../middleware/runner-auth");
mock.restore();

function createTestApp() {
  const app = new Hono<ApiEnv>();
  app.use("*", runnerAuthMiddleware);
  app.get("/internal/github/repo-connections/:repoConnectionId/installation-token", (context) =>
    context.json({
      runnerId: context.get("runnerId"),
      workspaceId: context.get("runnerWorkspaceId"),
    }),
  );
  app.get("/internal/credentials/claude/resolve", (context) =>
    context.json({
      runnerId: context.get("runnerId"),
      workspaceId: context.get("runnerWorkspaceId"),
    }),
  );
  return app;
}

describe("runnerAuthMiddleware", () => {
  beforeEach(() => {
    mockAuthenticate.mockClear();
  });

  test("allows revoked runner recovery only for GitHub installation token lookup", async () => {
    const response = await createTestApp().request(
      "/internal/github/repo-connections/11111111-1111-1111-1111-111111111111/installation-token",
      {
        headers: {
          authorization: "Bearer acr_stale",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(mockAuthenticate).toHaveBeenCalledWith("acr_stale", { allowRevoked: true });
  });

  test("does not allow revoked runner recovery on credential routes", async () => {
    const response = await createTestApp().request("/internal/credentials/claude/resolve", {
      headers: {
        authorization: "Bearer acr_stale",
      },
    });

    expect(response.status).toBe(200);
    expect(mockAuthenticate).toHaveBeenCalledWith("acr_stale", { allowRevoked: false });
  });
});
