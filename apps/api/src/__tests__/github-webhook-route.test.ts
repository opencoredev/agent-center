import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockHandleSignedDelivery = mock(async () => ({
  status: "created" as const,
  taskId: "task-1",
  runId: "run-1",
  deliveryId: "delivery-1",
  taskUrl: "https://app.agent-center.test/tasks/task-1",
}));

const mockNotifyTasksChanged = mock(() => undefined);

mock.module("../services/github-webhook-service", () => ({
  githubWebhookService: {
    handleSignedDelivery: mockHandleSignedDelivery,
  },
}));

mock.module("../ws", () => ({
  runEventsHub: {
    notifyTasksChanged: mockNotifyTasksChanged,
  },
}));

const { githubRoutes } = await import("../routes/api/github");

describe("github webhook route", () => {
  beforeEach(() => {
    mockHandleSignedDelivery.mockReset();
    mockHandleSignedDelivery.mockResolvedValue({
      status: "created",
      taskId: "task-1",
      runId: "run-1",
      deliveryId: "delivery-1",
      taskUrl: "https://app.agent-center.test/tasks/task-1",
    });
    mockNotifyTasksChanged.mockReset();
  });

  test("accepts signed webhook POST requests on /webhook", async () => {
    const response = await githubRoutes.request("http://localhost/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Delivery": "delivery-1",
        "X-GitHub-Event": "issues",
        "X-Hub-Signature-256": "sha256=test",
      },
      body: JSON.stringify({
        hello: "world",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        data: {
          status: "created",
          taskId: "task-1",
          runId: "run-1",
          deliveryId: "delivery-1",
          taskUrl: "https://app.agent-center.test/tasks/task-1",
        },
      }),
    );
    expect(mockHandleSignedDelivery).toHaveBeenCalledWith({
      deliveryId: "delivery-1",
      event: "issues",
      rawBody: JSON.stringify({
        hello: "world",
      }),
      requestOrigin: "http://localhost",
      signature: "sha256=test",
    });
    expect(mockNotifyTasksChanged).toHaveBeenCalledTimes(1);
  });
});
