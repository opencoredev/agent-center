import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let originPath = "";
let workspacePath = "";
let sandboxRoot = "";

const mockCreatePullRequest = mock(async (input: Record<string, unknown>) => ({
  id: "pr-1",
  number: 17,
  state: "open",
  title: input.title as string,
  body: (input.body as string | null | undefined) ?? null,
  url: "https://api.github.com/repos/opencodedev/agent-center/pulls/17",
  htmlUrl: "https://github.com/opencodedev/agent-center/pull/17",
  draft: true,
  head: input.head as string,
  base: input.base as string,
}));

mock.module("@agent-center/github", () => ({
  createGitHubProvider: () => ({
    buildCloneUrl: () => ({
      redactedUrl: originPath,
      usesAuthentication: false,
      toJSON: () => originPath,
      toString: () => originPath,
      unwrap: () => originPath,
    }),
    buildBranchPushMetadata: ({ branchName }: { branchName: string }) => ({
      remoteName: "origin",
      branchName,
      remoteRef: `refs/heads/${branchName}`,
      refspec: `HEAD:refs/heads/${branchName}`,
      setUpstreamArgs: ["--set-upstream", "origin", branchName] as const,
    }),
    createPullRequest: mockCreatePullRequest,
  }),
}));

const runRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  taskId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  repoConnectionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  status: "completed" as const,
  attempt: 1,
  prompt: "Implement the requested backend fix",
  baseBranch: "main",
  branchName: "main",
  sandboxSize: "small" as const,
  permissionMode: "safe" as const,
  policy: {},
  config: {
    commands: [],
    commitMessage: "chore: publish Implement the requested backend fix",
    prTitle: "Implement the requested backend fix",
  },
  metadata: {},
  startedAt: null,
  completedAt: new Date("2026-04-20T12:00:00.000Z"),
  failedAt: null,
  errorMessage: null,
  workspacePath: "",
  createdAt: new Date("2026-04-20T11:00:00.000Z"),
  updatedAt: new Date("2026-04-20T12:00:00.000Z"),
};

const taskRecord = {
  id: runRecord.taskId,
  workspaceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  projectId: null,
  repoConnectionId: runRecord.repoConnectionId,
  automationId: null,
  title: "Fix publish flow",
  prompt: "Task prompt body",
  status: "completed" as const,
  sandboxSize: "small" as const,
  permissionMode: "safe" as const,
  baseBranch: "main",
  branchName: "main",
  policy: {},
  config: {
    commands: [],
    prBody: "Task prompt body",
  },
  metadata: {
    github: {
      issue: {
        number: 123,
      },
      repository: {
        owner: "opencodedev",
        name: "agent-center",
      },
    },
  },
  createdAt: new Date("2026-04-20T10:00:00.000Z"),
  updatedAt: new Date("2026-04-20T12:00:00.000Z"),
};

const repoConnectionRecord = {
  id: runRecord.repoConnectionId,
  workspaceId: taskRecord.workspaceId,
  projectId: null,
  provider: "github" as const,
  owner: "opencodedev",
  repo: "agent-center",
  defaultBranch: "main",
  authType: "github_app_installation",
  connectionMetadata: {
    installationId: 42,
  },
  createdAt: new Date("2026-04-20T09:00:00.000Z"),
  updatedAt: new Date("2026-04-20T09:00:00.000Z"),
};

const mockFindRunById = mock(async () => ({
  ...runRecord,
  workspacePath,
}));
const mockUpdateRun = mock(async (_runId: string, values: Record<string, unknown>) => ({
  ...runRecord,
  workspacePath,
  ...values,
}));
const mockAppendRunEvent = mock(async () => undefined);
const mockFindTaskById = mock(async () => ({
  ...taskRecord,
}));
const mockUpdateTask = mock(async (_taskId: string, values: Record<string, unknown>) => ({
  ...taskRecord,
  ...values,
}));
const mockFindWorkspaceById = mock(async () => ({
  id: taskRecord.workspaceId,
  ownerId: "user-1",
}));
const mockAssertWithinWorkspace = mock(async () => repoConnectionRecord);
const mockGetInstallationAccessToken = mock(async () => ({
  token: "ghs_installation_token",
  expires_at: "2026-04-20T13:00:00.000Z",
}));
const mockResolveBotCommitAuthor = mock(async (): Promise<{
  email: string;
  id: number | null;
  login: string | null;
  name: string;
  source: "fallback" | "github_app_bot";
}> => ({
  email: "123456+agent-center-dev[bot]@users.noreply.github.com",
  id: 123456,
  login: "agent-center-dev[bot]",
  name: "agent-center-dev[bot]",
  source: "github_app_bot",
}));
const mockCreateIssueComment = mock(async () => ({
  id: 501,
  body: "Draft pull request opened: https://github.com/opencodedev/agent-center/pull/17",
  htmlUrl: "https://github.com/opencodedev/agent-center/issues/123#issuecomment-501",
}));

mock.module("../repositories/run-repository", () => ({
  appendRunEvent: mockAppendRunEvent,
  createRunRecord: mock(async () => {
    throw new Error("not implemented");
  }),
  findLatestRunForTask: mock(async () => undefined),
  findRunById: mockFindRunById,
  listRunEvents: mock(async () => []),
  listRunLogEvents: mock(async () => []),
  listRunsForTask: mock(async () => []),
  updateRun: mockUpdateRun,
}));

mock.module("../repositories/task-repository", () => ({
  findTaskById: mockFindTaskById,
  updateTask: mockUpdateTask,
}));

mock.module("../repositories/workspace-repository", () => ({
  findWorkspaceById: mockFindWorkspaceById,
}));

mock.module("../services/repo-connection-service", () => ({
  repoConnectionService: {
    assertWithinWorkspace: mockAssertWithinWorkspace,
  },
}));

mock.module("../services/github-app-service", () => ({
  githubAppService: {
    getInstallationAccessToken: mockGetInstallationAccessToken,
    resolveBotCommitAuthor: mockResolveBotCommitAuthor,
    createIssueComment: mockCreateIssueComment,
  },
}));

mock.module("../services/serializers", () => ({
  serializePublicationState: (metadata: Record<string, unknown> | null | undefined) =>
    (metadata?.publication as Record<string, unknown> | undefined) ?? {
      status: "unpublished",
      pullRequest: null,
    },
  serializeRun: (run: Record<string, unknown>) => ({
    ...run,
    publication:
      ((run.metadata as Record<string, unknown> | undefined)?.publication as Record<string, unknown> | undefined) ??
      { status: "unpublished", pullRequest: null },
  }),
  serializeRunEvent: (event: Record<string, unknown>) => event,
  serializeTask: (task: Record<string, unknown>) => ({
    ...task,
    publication:
      ((task.metadata as Record<string, unknown> | undefined)?.publication as Record<string, unknown> | undefined) ??
      { status: "unpublished", pullRequest: null },
  }),
}));

const { runService } = await import("../services/run-service");

function runGit(args: string[], cwd: string) {
  const result = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${Buffer.from(result.stderr).toString().trim() || Buffer.from(result.stdout).toString().trim()}`,
    );
  }

  return Buffer.from(result.stdout).toString().trim();
}

function createSandboxRepository() {
  sandboxRoot = mkdtempSync(join(tmpdir(), "agent-center-run-publish-"));
  originPath = join(sandboxRoot, "origin.git");
  workspacePath = join(sandboxRoot, "workspace");

  runGit(["init", "--bare", originPath], sandboxRoot);
  runGit(["clone", originPath, workspacePath], sandboxRoot);
  runGit(["config", "user.name", "Test User"], workspacePath);
  runGit(["config", "user.email", "test@example.com"], workspacePath);
  writeFileSync(join(workspacePath, "README.md"), "hello\n");
  runGit(["add", "README.md"], workspacePath);
  runGit(["commit", "-m", "chore: initial"], workspacePath);
  runGit(["branch", "-M", "main"], workspacePath);
  runGit(["push", "origin", "main"], workspacePath);
  writeFileSync(join(workspacePath, "README.md"), "hello\npublished change\n");
}

describe("run-service publish", () => {
  beforeEach(() => {
    createSandboxRepository();
    mockCreatePullRequest.mockClear();
    mockFindRunById.mockClear();
    mockUpdateRun.mockClear();
    mockAppendRunEvent.mockClear();
    mockFindTaskById.mockClear();
    mockUpdateTask.mockClear();
    mockFindWorkspaceById.mockClear();
    mockAssertWithinWorkspace.mockClear();
    mockGetInstallationAccessToken.mockClear();
    mockResolveBotCommitAuthor.mockClear();
    mockCreateIssueComment.mockClear();
  });

  afterEach(() => {
    if (sandboxRoot) {
      rmSync(sandboxRoot, {
        force: true,
        recursive: true,
      });
    }
  });

  test("creates a deterministic publish branch, commits, pushes, and opens a draft PR", async () => {
    const result = await runService.publish(runRecord.id, "user-1");

    expect(mockCreatePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        head: expect.stringContaining("agent-center/fix-publish-flow"),
        base: "main",
        draft: true,
        title: "Update `README.md`",
        body: expect.stringContaining("## Summary"),
      }),
    );
    expect((mockCreatePullRequest.mock.calls[0]?.[0] as Record<string, unknown>).body).toContain(
      "Closes opencodedev/agent-center#123",
    );
    expect(mockGetInstallationAccessToken).toHaveBeenCalledWith(42);
    expect(mockResolveBotCommitAuthor).toHaveBeenCalledWith({
      installationId: 42,
      token: "ghs_installation_token",
    });
    expect(mockCreateIssueComment).toHaveBeenCalledWith({
      installationId: 42,
      owner: "opencodedev",
      repo: "agent-center",
      issueNumber: 123,
      body: "Draft pull request opened: https://github.com/opencodedev/agent-center/pull/17",
    });
    expect(result.publication.status).toBe("published");
    expect(result.publication.pullRequest).toMatchObject({
      number: 17,
      htmlUrl: "https://github.com/opencodedev/agent-center/pull/17",
    });
    expect((result.publication as Record<string, unknown>).commitMessage).toBe("chore: update `README.md`");
    expect((result.publication as Record<string, unknown>).commitAuthor).toMatchObject({
      email: "123456+agent-center-dev[bot]@users.noreply.github.com",
      login: "agent-center-dev[bot]",
      source: "github_app_bot",
    });
    expect(result.run.branchName).toContain("agent-center/fix-publish-flow");
    expect(
      runGit(["--git-dir", originPath, "rev-parse", `refs/heads/${result.run.branchName as string}`], sandboxRoot),
    ).toBeTruthy();
    expect(runGit(["log", "-1", "--pretty=%an <%ae>%n%s", result.run.branchName as string], workspacePath)).toBe(
      "agent-center-dev[bot] <123456+agent-center-dev[bot]@users.noreply.github.com>\nchore: update `README.md`",
    );
    expect((mockCreatePullRequest.mock.calls[0]?.[0] as Record<string, unknown>).body).toContain("<summary>Original task</summary>");
  });

  test("persists failed publication state after the branch has been pushed", async () => {
    mockCreatePullRequest.mockImplementationOnce(async () => {
      throw new Error("GitHub PR failed");
    });

    await expect(runService.publish(runRecord.id, "user-1")).rejects.toThrow("GitHub PR failed");

    const runUpdate = mockUpdateRun.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(runUpdate.branchName).toBeTruthy();
    expect((runUpdate.metadata as Record<string, unknown>).publication).toMatchObject({
      status: "failed",
      error: "GitHub PR failed",
    });
    expect(
      runGit(["--git-dir", originPath, "rev-parse", `refs/heads/${runUpdate.branchName as string}`], sandboxRoot),
    ).toBeTruthy();
  });

  test("falls back to the automation identity when the app bot cannot be resolved", async () => {
    mockResolveBotCommitAuthor.mockImplementationOnce(async () => ({
      email: "automation@agent.center",
      id: null,
      login: null,
      name: "Agent Center",
      source: "fallback" as const,
    }));

    const result = await runService.publish(runRecord.id, "user-1");

    expect((result.publication as Record<string, unknown>).commitAuthor).toMatchObject({
      email: "automation@agent.center",
      name: "Agent Center",
      source: "fallback",
    });
    expect(runGit(["log", "-1", "--pretty=%an <%ae>", result.run.branchName as string], workspacePath)).toBe(
      "Agent Center <automation@agent.center>",
    );
  });

  test("does not fail publication when commenting back on the issue fails", async () => {
    mockCreateIssueComment.mockRejectedValueOnce(new Error("comment failed"));

    const result = await runService.publish(runRecord.id, "user-1");

    expect(result.publication.status).toBe("published");
    expect(mockCreatePullRequest).toHaveBeenCalledTimes(1);
  });
});
