import { describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";

import { GitHubAppClient, buildGitHubAppInstallUrl } from "./app-client";

function createPrivateKeyPem() {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      format: "pem",
      type: "pkcs8",
    },
    publicKeyEncoding: {
      format: "pem",
      type: "spki",
    },
  });

  return privateKey;
}

describe("github app client", () => {
  test("builds the default install URL", () => {
    expect(
      buildGitHubAppInstallUrl({
        slug: "agent-center-dev",
      }),
    ).toBe("https://github.com/apps/agent-center-dev/installations/new");
  });

  test("lists installations with an app JWT", async () => {
    const fetchMock = mock(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.github.com/app/installations");
      expect(init?.headers).toMatchObject({
        Accept: "application/vnd.github+json",
        Authorization: expect.stringContaining("Bearer "),
      });

      return new Response(
        JSON.stringify([
          {
            id: 42,
            target_type: "Organization",
            repository_selection: "selected",
            html_url: "https://github.com/organizations/opencoded/settings/installations/42",
            app_id: 3332050,
            account: {
              login: "opencoded",
              type: "Organization",
            },
          },
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const client = new GitHubAppClient({
      appId: "3332050",
      slug: "agent-center-dev",
      privateKey: createPrivateKeyPem(),
      fetch: fetchMock as unknown as typeof fetch,
    });

    const installations = await client.listInstallations();

    expect(installations).toEqual([
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
  });

  test("creates an installation token before listing installation repositories", async () => {
    const fetchMock = mock(async (url: string, init?: RequestInit) => {
      if (url === "https://api.github.com/app/installations/42/access_tokens") {
        expect(init?.method).toBe("POST");

        return new Response(JSON.stringify({ token: "ghs_installation_token" }), {
          headers: {
            "content-type": "application/json",
          },
        });
      }

      if (url === "https://api.github.com/installation/repositories?per_page=100&page=1") {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer ghs_installation_token",
        });

        return new Response(
          JSON.stringify({
            total_count: 1,
            repositories: [
              {
                id: 7,
                name: "agent.center",
                full_name: "opencoded/agent.center",
                default_branch: "main",
                private: true,
                visibility: "private",
                html_url: "https://github.com/opencoded/agent.center",
                owner: {
                  login: "opencoded",
                },
                permissions: {
                  contents: true,
                  pull_requests: true,
                },
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    const client = new GitHubAppClient({
      appId: "3332050",
      slug: "agent-center-dev",
      privateKey: createPrivateKeyPem(),
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.listInstallationRepositories(42);

    expect(result).toEqual({
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
            pull_requests: true,
          },
        },
      ],
    });
  });

  test("creates issue and issue comment eyes reactions with an installation token", async () => {
    const fetchMock = mock(async (url: string, init?: RequestInit) => {
      if (url === "https://api.github.com/repos/opencoded/agent.center/issues/123/reactions") {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer ghs_installation_token",
        });
        expect(init?.body).toBe(JSON.stringify({ content: "eyes" }));

        return new Response(JSON.stringify({ id: 501, content: "eyes" }), {
          headers: {
            "content-type": "application/json",
          },
          status: 201,
        });
      }

      if (url === "https://api.github.com/repos/opencoded/agent.center/issues/comments/999/reactions") {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer ghs_installation_token",
        });
        expect(init?.body).toBe(JSON.stringify({ content: "eyes" }));

        return new Response(JSON.stringify({ id: 502, content: "eyes" }), {
          headers: {
            "content-type": "application/json",
          },
          status: 201,
        });
      }

      throw new Error(`unexpected fetch url: ${url}`);
    });

    const client = new GitHubAppClient({
      appId: "3332050",
      slug: "agent-center-dev",
      privateKey: createPrivateKeyPem(),
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.createIssueReaction({
        owner: "opencoded",
        repo: "agent.center",
        issueNumber: 123,
        content: "eyes",
        token: "ghs_installation_token",
      }),
    ).resolves.toEqual({
      id: 501,
      content: "eyes",
    });

    await expect(
      client.createIssueCommentReaction({
        owner: "opencoded",
        repo: "agent.center",
        commentId: 999,
        content: "eyes",
        token: "ghs_installation_token",
      }),
    ).resolves.toEqual({
      id: 502,
      content: "eyes",
    });
  });
});
