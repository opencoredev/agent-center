import { describe, expect, mock, test } from "bun:test";

process.env.CONVEX_URL ??= "https://convex.test";
process.env.AGENT_CENTER_CONVEX_SERVICE_TOKEN ??= "service-token";

mock.module("../../../../packages/github/src/index.ts", () => ({
  createGitHubProvider: () => ({
    buildCloneUrl: () => ({
      redactedUrl: "https://x-access-token:[REDACTED]@github.com/acme/app.git",
      usesAuthentication: true,
      unwrap: () => "https://x-access-token:ghs_secret_clone_token@github.com/acme/app.git",
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
    const overrides = Object.fromEntries(
      Array.from({ length: Number(clone.env.GIT_CONFIG_COUNT) }, (_, index) => [
        clone.env[`GIT_CONFIG_KEY_${index}`],
        clone.env[`GIT_CONFIG_VALUE_${index}`],
      ]),
    );
    expect(overrides).toMatchObject({
      "core.hooksPath": "/dev/null",
      "core.fsmonitor": "false",
      "core.askPass": "",
      "credential.helper": "",
      "protocol.allow": "never",
      "protocol.ext.allow": "never",
      "protocol.file.allow": "never",
      "protocol.https.allow": "always",
    });
    expect(find(executed, "fetch origin --prune").env).toEqual(clone.env);
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
    expect(setUrl).toBeLessThan(commands.findIndex((command) => command.includes("fetch origin")));
    expect(commands.some((command) => command.includes(" clone "))).toBe(false);
    expect(commands.join("\n")).not.toContain("ghs_secret_clone_token");
  });
});
