import { beforeEach, describe, expect, mock, test } from "bun:test";

const taskRecord = {
  id: "task-real-id",
  _id: "task-real-id",
  _creationTime: 1,
  threadId: "thread-route-id",
  workspaceId: "workspace-1",
  projectId: undefined,
  repoConnectionId: undefined,
  automationId: undefined,
  title: "Production route regression",
  prompt: "Fix the production task route",
  status: "failed" as const,
  sandboxSize: "small" as const,
  permissionMode: "safe" as const,
  baseBranch: "main",
  branchName: "main",
  config: {
    commands: [],
  },
  policy: {},
  metadata: {},
  createdAt: 1,
  updatedAt: 1,
};

const mockConvexQuery = mock(async (_query: unknown, args?: Record<string, unknown>): Promise<
  unknown
> => {
  if (args && "taskId" in args) {
    return taskRecord;
  }

  return [];
});

mock.module("../services/convex-service-client", () => ({
  convexServiceClient: {
    query: mockConvexQuery,
    mutation: mock(async () => null),
    action: mock(async () => null),
  },
}));

const { findTaskById } = await import("../repositories/task-repository");
mock.restore();

describe("task repository", () => {
  beforeEach(() => {
    mockConvexQuery.mockClear();
    mockConvexQuery.mockImplementation(async (_query: unknown, args?: Record<string, unknown>) => {
      if (args && "taskId" in args) {
        return taskRecord;
      }

      return [];
    });
  });

  test("returns tasks by task id through the direct lookup", async () => {
    const task = await findTaskById(taskRecord.id);

    expect(task?.id).toBe(taskRecord.id);
    expect(String(task?.threadId)).toBe(taskRecord.threadId);
    expect(mockConvexQuery).toHaveBeenCalledTimes(1);
    expect(mockConvexQuery.mock.calls[0]?.[1]).toEqual({ taskId: taskRecord.id });
  });

  test("falls back to listTasks when a route id belongs to a thread", async () => {
    mockConvexQuery.mockImplementationOnce(async () => {
      throw new Error(
        'ArgumentValidationError: Found ID "thread-route-id" from table threads, which does not match v.id("tasks")',
      );
    });
    mockConvexQuery.mockImplementationOnce(async () => [taskRecord]);

    const task = await findTaskById(taskRecord.threadId);

    expect(task?.id).toBe(taskRecord.id);
    expect(String(task?.threadId)).toBe(taskRecord.threadId);
    expect(mockConvexQuery).toHaveBeenCalledTimes(2);
    expect(mockConvexQuery.mock.calls[0]?.[1]).toEqual({ taskId: taskRecord.threadId });
    expect(mockConvexQuery.mock.calls[1]?.[1]).toEqual({
      workspaceId: undefined,
      projectId: undefined,
      status: undefined,
    });
  });
});
