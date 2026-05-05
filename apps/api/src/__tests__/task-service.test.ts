import { beforeEach, describe, expect, mock, test } from "bun:test";

const taskRecord = {
  id: "task-real-id",
  threadId: "thread-route-id",
  workspaceId: "workspace-1",
  projectId: null,
  repoConnectionId: "repo-connection-1",
  automationId: null,
  title: "Retry route regression",
  prompt: "Retry the task",
  status: "failed" as const,
  sandboxSize: "small" as const,
  permissionMode: "safe" as const,
  baseBranch: "main",
  branchName: "main",
  policy: {},
  config: {
    commands: [],
  },
  metadata: {},
  createdAt: new Date("2026-05-04T12:00:00.000Z"),
  updatedAt: new Date("2026-05-04T12:00:00.000Z"),
};

const mockFindTaskById = mock(async () => taskRecord);
const mockFindWorkspaceById = mock(async () => ({
  id: taskRecord.workspaceId,
  ownerId: "user-1",
}));
const mockFindLatestRunForTask = mock(async () => undefined);
const mockRunCreate = mock(async (input: Record<string, unknown>) => ({
  id: "run-1",
  ...input,
}));

mock.module("../repositories/task-repository", () => ({
  createTask: mock(async (values: Record<string, unknown>) => values),
  deleteTask: mock(async () => taskRecord),
  findTaskById: mockFindTaskById,
  listTasks: mock(async () => [taskRecord]),
  updateTask: mock(async (_taskId: string, values: Record<string, unknown>) => ({
    ...taskRecord,
    ...values,
  })),
}));

mock.module("../repositories/workspace-repository", () => ({
  findWorkspaceById: mockFindWorkspaceById,
}));

mock.module("../repositories/run-repository", () => ({
  appendRunEvent: mock(async () => undefined),
  createRunRecord: mock(async () => undefined),
  findLatestRunForTask: mockFindLatestRunForTask,
  findRunById: mock(async () => undefined),
  listRunEvents: mock(async () => []),
  listRunLogEvents: mock(async () => []),
  listRunsForTask: mock(async () => []),
  updateRun: mock(async () => undefined),
}));

mock.module("../repositories/automation-repository", () => ({
  findAutomationByWorkspaceAndId: mock(async () => undefined),
}));

mock.module("../services/project-service", () => ({
  projectService: {
    assertWithinWorkspace: mock(async () => undefined),
  },
}));

mock.module("../services/repo-connection-service", () => ({
  repoConnectionService: {
    assertWithinWorkspace: mock(async () => undefined),
  },
}));

mock.module("../services/run-service", () => ({
  runService: {
    create: mockRunCreate,
  },
}));

const { taskService } = await import("../services/task-service");
mock.restore();

describe("task service", () => {
  beforeEach(() => {
    mockFindTaskById.mockClear();
    mockFindWorkspaceById.mockClear();
    mockFindLatestRunForTask.mockClear();
    mockRunCreate.mockClear();
  });

  test("retries using the resolved task id when the route id is a thread id", async () => {
    await taskService.retry("thread-route-id", {}, "user-1");

    expect(mockFindTaskById).toHaveBeenCalledWith("thread-route-id");
    expect(mockFindLatestRunForTask).toHaveBeenCalledWith(taskRecord.id);
    expect(mockRunCreate).toHaveBeenCalledWith(
      {
        taskId: taskRecord.id,
      },
      "retry",
      "user-1",
    );
  });
});
