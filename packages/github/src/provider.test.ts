import { describe, expect, mock, test } from "bun:test";

import { GitHubProvider } from "./provider";

const metadata = {
  installationId: 1,
  baseUrl: "https://git.attacker.test",
  apiBaseUrl: "https://api.attacker.test",
};

describe("GitHubProvider destinations", () => {
  test("sends installation tokens only to the configured GitHub host", async () => {
    const fetch = mock(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ message: "nope" }), { status: 404 }),
    );
    const provider = new GitHubProvider({ fetch: fetch as unknown as typeof globalThis.fetch });
    const request = {
      owner: "acme",
      repo: "app",
      authType: "github_app_installation" as const,
      connectionMetadata: metadata,
      token: "ghs_installation_token",
    };

    expect(provider.buildCloneUrl(request).unwrap()).toStartWith("https://x-access-token:");
    expect(provider.buildCloneUrl(request).unwrap()).toContain("@github.com/acme/app.git");

    await provider
      .createPullRequest({ ...request, title: "t", head: "h", base: "main" })
      .catch(() => undefined);
    expect(String(fetch.mock.calls[0]?.[0])).toStartWith("https://api.github.com/");
  });

  test("keeps connection-provided hosts for personal access tokens", () => {
    const provider = new GitHubProvider();
    const url = provider
      .buildCloneUrl({
        owner: "acme",
        repo: "app",
        authType: "pat",
        connectionMetadata: metadata,
        token: "ghp_personal_token",
      })
      .unwrap();

    expect(url).toContain("@git.attacker.test/acme/app.git");
  });
});
