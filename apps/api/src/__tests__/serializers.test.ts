import { describe, expect, test } from "bun:test";

import { serializeRepoConnection } from "../services/serializers";

const connection = {
  id: "repo-1",
  workspaceId: "workspace-1",
  projectId: null,
  provider: "github",
  owner: "acme",
  repo: "app",
  defaultBranch: "main",
  authType: "pat",
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
};

describe("serializeRepoConnection", () => {
  test("leaves stored tokens and URL credentials out of connection metadata", () => {
    const serialized = serializeRepoConnection({
      ...connection,
      connectionMetadata: {
        installationId: 42,
        baseUrl: "https://x-access-token:ghp_url_token@github.example.com",
        apiBaseUrl: "https://api.github.example.com",
        token: "ghp_token",
        accessToken: "gho_token",
        pat: "ghp_pat",
        personalAccessToken: "github_pat_token",
      },
    });

    expect(serialized.connectionMetadata).toEqual({
      installationId: 42,
      baseUrl: "https://github.example.com/",
      apiBaseUrl: "https://api.github.example.com",
    });
    expect(JSON.stringify(serialized)).not.toContain("ghp_");
  });

  test("keeps empty metadata empty", () => {
    expect(
      serializeRepoConnection({ ...connection, connectionMetadata: null }).connectionMetadata,
    ).toBe(null);
  });
});
