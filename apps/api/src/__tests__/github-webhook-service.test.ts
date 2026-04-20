import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";

const repoConnection = {
  id: "repo-connection-1",
  workspaceId: "11111111-1111-1111-1111-111111111111",
  projectId: "22222222-2222-2222-2222-222222222222",
  owner: "opencodedev",
  repo: "agent-center",
  defaultBranch: "main",
};

const project = {
  id: "22222222-2222-2222-2222-222222222222",
  defaultBranch: "main",
};

const createdTask = {
  id: "33333333-3333-3333-3333-333333333333",
};

const createdRun = {
  id: "44444444-4444-4444-4444-444444444444",
};

const mockFindTaskByGitHubDeliveryId = mock(async (): Promise<{ id: string } | undefined> => undefined);
const mockFindGitHubAppRepoConnectionByRepository = mock(async () => repoConnection);
const mockAssertWithinWorkspace = mock(async () => project);
const mockFindOrCreateRepositoryProject = mock(async () => project);
const mockCreateTask = mock(async () => createdTask);
const mockCreateRun = mock(async () => createdRun);
const mockCreateIssueComment = mock(async () => ({ id: 1 }));
const mockCreateMentionReaction = mock(async () => ({ id: 99, content: "eyes" }));

mock.module("../repositories/task-repository", () => ({
  findTaskByGitHubDeliveryId: mockFindTaskByGitHubDeliveryId,
}));

mock.module("../repositories/repo-connection-repository", () => ({
  findGitHubAppRepoConnectionByRepository: mockFindGitHubAppRepoConnectionByRepository,
}));

mock.module("../services/project-service", () => ({
  projectService: {
    assertWithinWorkspace: mockAssertWithinWorkspace,
    findOrCreateRepositoryProject: mockFindOrCreateRepositoryProject,
  },
}));

mock.module("../services/task-service", () => ({
  taskService: {
    create: mockCreateTask,
  },
}));

mock.module("../services/run-service", () => ({
  runService: {
    create: mockCreateRun,
  },
}));

mock.module("../services/github-app-service", () => ({
  githubAppService: {
    getWebhookMentionLogins: () => ["agent-center-dev", "agent-center-dev[bot]"],
    createIssueComment: mockCreateIssueComment,
    createMentionReaction: mockCreateMentionReaction,
  },
}));

const { apiEnv } = await import("../env");
const { githubWebhookService } = await import("../services/github-webhook-service");

const originalWebhookSecret = apiEnv.GITHUB_WEBHOOK_SECRET;
const originalSetupUrl = apiEnv.GITHUB_APP_SETUP_URL;
const originalServeFrontend = apiEnv.SERVE_FRONTEND;
const originalWebUrl = process.env.VITE_WEB_URL;

function sign(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function buildIssuesOpenedPayload(body = "@agent-center-dev fix this bug") {
  return JSON.stringify({
    action: "opened",
    installation: {
      id: 42,
    },
    issue: {
      number: 123,
      title: "Broken behavior",
      body,
      html_url: "https://github.com/opencodedev/agent-center/issues/123",
    },
    repository: {
      full_name: "opencodedev/agent-center",
      name: "agent-center",
      default_branch: "main",
      html_url: "https://github.com/opencodedev/agent-center",
      owner: {
        login: "opencodedev",
      },
    },
    sender: {
      login: "octocat",
    },
  });
}

function buildIssueCommentPayload(input: {
  body?: string;
  hasPullRequest?: boolean;
} = {}) {
  return JSON.stringify({
    action: "created",
    installation: {
      id: 42,
    },
    issue: {
      number: 123,
      title: "Broken behavior",
      body: "Base issue context",
      html_url: "https://github.com/opencodedev/agent-center/issues/123",
      ...(input.hasPullRequest
        ? {
            pull_request: {
              url: "https://api.github.com/repos/opencodedev/agent-center/pulls/123",
            },
          }
        : {}),
    },
    comment: {
      id: 999,
      body: input.body ?? "@agent-center-dev[bot] please investigate",
      html_url: "https://github.com/opencodedev/agent-center/issues/123#issuecomment-999",
    },
    repository: {
      full_name: "opencodedev/agent-center",
      name: "agent-center",
      default_branch: "main",
      html_url: "https://github.com/opencodedev/agent-center",
      owner: {
        login: "opencodedev",
      },
    },
    sender: {
      login: "octocat",
    },
  });
}

describe("github-webhook-service", () => {
  beforeEach(() => {
    mockFindTaskByGitHubDeliveryId.mockReset();
    mockFindTaskByGitHubDeliveryId.mockResolvedValue(undefined);
    mockFindGitHubAppRepoConnectionByRepository.mockReset();
    mockFindGitHubAppRepoConnectionByRepository.mockResolvedValue(repoConnection);
    mockAssertWithinWorkspace.mockReset();
    mockAssertWithinWorkspace.mockResolvedValue(project);
    mockFindOrCreateRepositoryProject.mockReset();
    mockFindOrCreateRepositoryProject.mockResolvedValue(project);
    mockCreateTask.mockReset();
    mockCreateTask.mockResolvedValue(createdTask);
    mockCreateRun.mockReset();
    mockCreateRun.mockResolvedValue(createdRun);
    mockCreateIssueComment.mockReset();
    mockCreateIssueComment.mockResolvedValue({ id: 1 });
    mockCreateMentionReaction.mockReset();
    mockCreateMentionReaction.mockResolvedValue({ id: 99, content: "eyes" });

    apiEnv.GITHUB_WEBHOOK_SECRET = "test-secret";
    apiEnv.GITHUB_APP_SETUP_URL = "https://app.agent-center.test/settings/repositories";
    apiEnv.SERVE_FRONTEND = false;
    process.env.VITE_WEB_URL = "";
  });

  test("creates a task and run for an issue body mention and posts an acknowledgement", async () => {
    const rawBody = buildIssuesOpenedPayload();
    const result = await githubWebhookService.handleSignedDelivery({
      deliveryId: "delivery-1",
      event: "issues",
      rawBody,
      requestOrigin: "https://api.agent-center.test",
      signature: sign(rawBody, "test-secret"),
    });

    expect(result).toEqual({
      deliveryId: "delivery-1",
      runId: createdRun.id,
      status: "created",
      taskId: createdTask.id,
      taskUrl: "https://app.agent-center.test/tasks/33333333-3333-3333-3333-333333333333",
    });
    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: repoConnection.workspaceId,
        projectId: repoConnection.projectId,
        repoConnectionId: repoConnection.id,
        title: "opencodedev/agent-center#123: Broken behavior",
        config: expect.objectContaining({
          agentProvider: "codex",
          agentModel: "gpt-5.4",
          agentReasoningEffort: "high",
          runtime: expect.objectContaining({
            provider: "legacy_local",
            target: "local",
          }),
        }),
        metadata: expect.objectContaining({
          github: expect.objectContaining({
            deliveryId: "delivery-1",
            event: "issues",
            installationId: 42,
            mention: expect.objectContaining({
              prompt: "fix this bug",
              trigger: "issue_body",
            }),
          }),
        }),
      }),
    );
    expect(mockCreateRun).toHaveBeenCalledWith({
      taskId: createdTask.id,
    });
    expect(mockCreateIssueComment).toHaveBeenCalledWith({
      installationId: 42,
      owner: "opencodedev",
      repo: "agent-center",
      issueNumber: 123,
      body: "Started a task for this mention: https://app.agent-center.test/tasks/33333333-3333-3333-3333-333333333333",
    });
    expect(mockCreateMentionReaction).toHaveBeenCalledWith({
      installationId: 42,
      owner: "opencodedev",
      repo: "agent-center",
      issueNumber: 123,
      commentId: null,
    });
  });

  test("ignores issue comments created on pull requests", async () => {
    const rawBody = buildIssueCommentPayload({
      hasPullRequest: true,
    });

    const result = await githubWebhookService.handleSignedDelivery({
      deliveryId: "delivery-2",
      event: "issue_comment",
      rawBody,
      signature: sign(rawBody, "test-secret"),
    });

    expect(result).toEqual({
      deliveryId: "delivery-2",
      status: "ignored",
      reason: "pull_request_comment",
    });
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  test("ignores deliveries without a bot mention", async () => {
    const rawBody = buildIssueCommentPayload({
      body: "please investigate",
    });

    const result = await githubWebhookService.handleSignedDelivery({
      deliveryId: "delivery-3",
      event: "issue_comment",
      rawBody,
      signature: sign(rawBody, "test-secret"),
    });

    expect(result).toEqual({
      deliveryId: "delivery-3",
      status: "ignored",
      reason: "no_bot_mention",
    });
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  test("dedupes by delivery id", async () => {
    mockFindTaskByGitHubDeliveryId.mockResolvedValueOnce({
      id: "existing-task",
    });

    const rawBody = buildIssuesOpenedPayload();
    const result = await githubWebhookService.handleSignedDelivery({
      deliveryId: "delivery-4",
      event: "issues",
      rawBody,
      signature: sign(rawBody, "test-secret"),
    });

    expect(result).toEqual({
      deliveryId: "delivery-4",
      status: "duplicate",
      taskId: "existing-task",
    });
    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  test("does not block task creation if the acknowledgement comment fails", async () => {
    mockCreateIssueComment.mockRejectedValueOnce(new Error("boom"));
    const warnSpy = spyOn(console, "warn").mockImplementation(() => undefined);

    const rawBody = buildIssuesOpenedPayload();
    const result = await githubWebhookService.handleSignedDelivery({
      deliveryId: "delivery-5",
      event: "issues",
      rawBody,
      signature: sign(rawBody, "test-secret"),
    });

    expect(result.status).toBe("created");
    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockCreateRun).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  test("does not block task creation if adding the mention reaction fails", async () => {
    mockCreateMentionReaction.mockRejectedValueOnce(new Error("boom"));
    const warnSpy = spyOn(console, "warn").mockImplementation(() => undefined);

    const rawBody = buildIssueCommentPayload({});
    const result = await githubWebhookService.handleSignedDelivery({
      deliveryId: "delivery-6",
      event: "issue_comment",
      rawBody,
      signature: sign(rawBody, "test-secret"),
    });

    expect(result.status).toBe("created");
    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockCreateRun).toHaveBeenCalledTimes(1);
    expect(mockCreateMentionReaction).toHaveBeenCalledWith({
      installationId: 42,
      owner: "opencodedev",
      repo: "agent-center",
      issueNumber: 123,
      commentId: 999,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  test("rejects invalid webhook signatures", async () => {
    const rawBody = buildIssuesOpenedPayload();

    await expect(
      githubWebhookService.handleSignedDelivery({
        deliveryId: "delivery-6",
        event: "issues",
        rawBody,
        signature: "sha256=bad",
      }),
    ).rejects.toMatchObject({
      code: "github_webhook_signature_invalid",
      status: 401,
    });
  });
});

afterEach(() => {
  apiEnv.GITHUB_WEBHOOK_SECRET = originalWebhookSecret;
  apiEnv.GITHUB_APP_SETUP_URL = originalSetupUrl;
  apiEnv.SERVE_FRONTEND = originalServeFrontend;
  process.env.VITE_WEB_URL = originalWebUrl;
});
