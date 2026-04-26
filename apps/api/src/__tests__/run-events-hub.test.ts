import { describe, expect, mock, test } from "bun:test";
import type { WSContext } from "hono/ws";

mock.module("../ws/run-events-repository", () => ({
  listRunEventsAfter: mock(async () => []),
}));

const { RunEventsHub } = await import("../ws/run-events-hub");
mock.restore();

function createSocket() {
  const messages: unknown[] = [];
  const socket = {
    raw: {},
    send: mock((message: string) => {
      messages.push(JSON.parse(message));
    }),
  } as unknown as WSContext;

  return {
    messages,
    socket,
  };
}

describe("RunEventsHub authorization", () => {
  test("rejects unauthorized run subscriptions before polling", async () => {
    const pollRunEvents = mock(async () => []);
    const authorizeRunSubscription = mock(async () => {
      throw new Error("forbidden");
    });
    const hub = new RunEventsHub(pollRunEvents, authorizeRunSubscription);
    const { messages, socket } = createSocket();

    hub.register(socket, "user-2");
    await hub.handleMessage(socket, JSON.stringify({ type: "subscribe_run", runId: "run-1" }));

    expect(authorizeRunSubscription).toHaveBeenCalledWith("run-1", "user-2");
    expect(pollRunEvents).not.toHaveBeenCalled();
    expect(messages).toEqual([
      {
        type: "error",
        message: "You do not have access to this run.",
      },
    ]);
  });

  test("rejects unauthorized task subscriptions without registering for notifications", async () => {
    const authorizeTaskSubscription = mock(async () => {
      throw new Error("forbidden");
    });
    const hub = new RunEventsHub(
      mock(async () => []),
      mock(async () => undefined),
      authorizeTaskSubscription,
    );
    const { messages, socket } = createSocket();

    hub.register(socket, "user-2");
    await hub.handleMessage(socket, JSON.stringify({ type: "subscribe_tasks" }));
    hub.notifyTasksChanged();

    expect(authorizeTaskSubscription).toHaveBeenCalledWith("user-2");
    expect(messages).toEqual([
      {
        type: "error",
        message: "You do not have access to task realtime updates.",
      },
    ]);
  });

  test("registers authorized run subscriptions and polls from the initial cursor", async () => {
    const pollRunEvents = mock(async () => []);
    const authorizeRunSubscription = mock(async () => undefined);
    const hub = new RunEventsHub(pollRunEvents, authorizeRunSubscription);
    const { messages, socket } = createSocket();

    hub.register(socket, "user-1");
    await hub.handleMessage(socket, JSON.stringify({ type: "subscribe_run", runId: "run-1" }));
    hub.unregister(socket);

    expect(authorizeRunSubscription).toHaveBeenCalledWith("run-1", "user-1");
    expect(messages).toEqual([
      {
        type: "subscribed",
        runId: "run-1",
      },
    ]);
    expect(pollRunEvents).toHaveBeenCalledWith("run-1", 0, 100);
  });
});
