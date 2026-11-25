import { describe, expect, mock, test } from "bun:test";

process.env.CONVEX_URL ??= "https://convex.test";
process.env.AGENT_CENTER_CONVEX_SERVICE_TOKEN ??= "service-token";

let cloneUrl = "https://x-access-token:ghs_secret_clone_token@github.com/acme/app.git";

mock.module("../../../../packages/github/src/index.ts", () => ({
  createGitHubProvider: () => ({
    buildCloneUrl: () => ({
      redactedUrl: "https://x-access-token:[REDACTED]@github.com/acme/app.git",
      usesAuthentication: true,
      unwrap: () => cloneUrl,
    }),
  }),
}));

const { GitService } = await import("../services/git/git-service");

interface ExecutedCommand {
  command: string;
  env: Record<string, string>;
}

const target = {
  repoConnection: {
    id: "repo-1",
    provider: "github",
    authType: "pat",
    owner: "acme",
    repo: "app",
    defaultBranch: "main",
    connectionMetadata: null,
  },
  run: { baseBranch: "main", branchName: null },
  project: null,
};

async function prepare(hasRepo: boolean) {
  const executed: ExecutedCommand[] = [];
  const executor = {
    execute: async (request: { command: string; env?: Record<string, string> }) => {
      executed.push({ command: request.command, env: request.env ?? {} });
      const isRepoCheck = request.command.includes("rev-parse --is-inside-work-tree");
      return { durationMs: 0, exitCode: isRepoCheck && !hasRepo ? 1 : 0 };
    },
  };
  const context = {
    control: {},
    persistence: { appendEvent: async () => undefined, appendLog: async () => undefined },
    workspacePath: "/tmp/workspace",
  };
  // SAFETY: the test supplies only the fields GitService reads.
  await new GitService(executor as never).prepareBranch(target as never, context as never);
  return executed;
}

function configOverrides(env: Record<string, string>) {
  return Object.fromEntries(
    Array.from({ length: Number(env.GIT_CONFIG_COUNT) }, (_, index) => [
      env[`GIT_CONFIG_KEY_${index}`],
      env[`GIT_CONFIG_VALUE_${index}`],
    ]),
  );
}

function find(executed: ExecutedCommand[], fragment: string) {
  const match = executed.find(({ command }) => command.includes(fragment));
  if (!match) throw new Error(`No git command containing "${fragment}"`);
  return match;
}

describe("GitService credentials", () => {
  test("clones from the plain URL and sends the token only as a request header", async () => {
    const executed = await prepare(false);

    const clone = find(executed, " clone ");
    expect(clone.command).toContain("'https://github.com/acme/app.git'");
    expect(clone.env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraHeader");
    expect(clone.env.GIT_CONFIG_VALUE_0).toBe(
      `Authorization: Basic ${Buffer.from("x-access-token:ghs_secret_clone_token").toString("base64")}`,
    );
    expect(configOverrides(clone.env)).toMatchObject({
      "core.hooksPath": "/dev/null",
      "core.fsmonitor": "false",
      "core.alternateRefsCommand": "true",
      "core.askPass": "",
      "credential.helper": "",
      "protocol.allow": "never",
      "protocol.ext.allow": "never",
      "protocol.file.allow": "never",
      "protocol.http.allow": "never",
      "protocol.https.allow": "always",
    });
    const fetch = find(executed, " fetch ");
    expect(fetch.command).toContain(
      "fetch --prune 'https://github.com/acme/app.git' '+refs/heads/*:refs/remotes/origin/*'",
    );
    expect(fetch.env).toEqual(clone.env);
    expect(executed.map(({ command }) => command).join("\n")).not.toContain(
      "ghs_secret_clone_token",
    );
  });

  test("replaces a credentialed origin URL in an existing workspace before fetching", async () => {
    const executed = await prepare(true);
    const commands = executed.map(({ command }) => command);

    const setUrl = commands.findIndex((command) =>
      command.includes("remote set-url origin 'https://github.com/acme/app.git'"),
    );
    expect(setUrl).toBeGreaterThan(-1);
    expect(setUrl).toBeLessThan(commands.findIndex((command) => command.includes(" fetch ")));
    expect(commands.some((command) => command.includes(" clone "))).toBe(false);
    expect(commands.join("\n")).not.toContain("ghs_secret_clone_token");
  });

  test("keeps the transport of an http base URL", async () => {
    cloneUrl = "http://token:pat_secret_value@git.internal.example/acme/app.git";
    try {
      const executed = await prepare(false);
      const clone = find(executed, " clone ");

      expect(clone.command).toContain("'http://git.internal.example/acme/app.git'");
      expect(configOverrides(clone.env)).toMatchObject({
        "http.http://git.internal.example/.extraHeader": `Authorization: Basic ${Buffer.from("token:pat_secret_value").toString("base64")}`,
        "protocol.http.allow": "always",
        "protocol.https.allow": "never",
      });
    } finally {
      cloneUrl = "https://x-access-token:ghs_secret_clone_token@github.com/acme/app.git";
    }
  });
});
