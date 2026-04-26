import { describe, expect, mock, test } from "bun:test";

// Mock the claude-agent-sdk before importing the executor
const mockQueryInstance = {
  [Symbol.asyncIterator]: async function* () {
    yield {
      type: "system",
      subtype: "init",
      session_id: "test-session-123",
    };
    yield {
      type: "assistant",
      uuid: "msg-1",
      session_id: "test-session-123",
      message: {
        content: [
          { type: "text", text: "I'll create the file." },
          { type: "tool_use", name: "Write", id: "tool-1" },
        ],
        model: "claude-sonnet-4-5",
      },
    };
    yield {
      type: "assistant",
      uuid: "msg-2",
      session_id: "test-session-123",
      message: {
        content: [{ type: "text", text: "Done! The file has been created." }],
        model: "claude-sonnet-4-5",
      },
    };
    yield {
      type: "result",
      session_id: "test-session-123",
    };
  },
  interrupt: mock(() => Promise.resolve()),
  close: mock(() => {}),
};

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mock(() => mockQueryInstance),
}));

// Import after mocking
const { executeClaudeAgent, startClaudeAgent } =
  await import("../services/execution/claude-executor");

describe("claude-executor", () => {
  describe("executeClaudeAgent", () => {
    test("executes a prompt and returns success", async () => {
      const events: Array<{ type: string; message: string }> = [];

      const result = await executeClaudeAgent({
        cwd: "/tmp/test-workspace",
        model: "claude-sonnet-4-5",
        permissionMode: "yolo",
        prompt: "Create a test file",
        onEvent: async (event) => {
          events.push({ type: event.type, message: event.message });
        },
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe("test-session-123");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    test("emits session_started event", async () => {
      const events: Array<{ type: string; message: string }> = [];

      await executeClaudeAgent({
        cwd: "/tmp/test-workspace",
        permissionMode: "yolo",
        prompt: "test",
        onEvent: async (event) => {
          events.push({ type: event.type, message: event.message });
        },
      });

      const sessionEvent = events.find((e) => e.type === "session_started");
      expect(sessionEvent).toBeDefined();
      expect(sessionEvent!.message).toContain("test-session-123");
    });

    test("emits assistant_message events", async () => {
      const events: Array<{ type: string; message: string }> = [];

      await executeClaudeAgent({
        cwd: "/tmp/test-workspace",
        permissionMode: "yolo",
        prompt: "test",
        onEvent: async (event) => {
          events.push({ type: event.type, message: event.message });
        },
      });

      const assistantEvents = events.filter((e) => e.type === "assistant_message");
      expect(assistantEvents.length).toBeGreaterThanOrEqual(1);
      expect(assistantEvents[0]!.message).toContain("create the file");
    });

    test("emits tool_use events", async () => {
      const events: Array<{ type: string; message: string }> = [];

      await executeClaudeAgent({
        cwd: "/tmp/test-workspace",
        permissionMode: "yolo",
        prompt: "test",
        onEvent: async (event) => {
          events.push({ type: event.type, message: event.message });
        },
      });

      const toolEvents = events.filter((e) => e.type === "tool_use");
      expect(toolEvents.length).toBe(1);
      expect(toolEvents[0]!.message).toBe("Tool: Write");
    });

    test("emits result event", async () => {
      const events: Array<{ type: string; message: string }> = [];

      await executeClaudeAgent({
        cwd: "/tmp/test-workspace",
        permissionMode: "yolo",
        prompt: "test",
        onEvent: async (event) => {
          events.push({ type: event.type, message: event.message });
        },
      });

      const resultEvent = events.find((e) => e.type === "result");
      expect(resultEvent).toBeDefined();
      expect(resultEvent!.message).toBe("Claude session completed");
    });
  });

  describe("startClaudeAgent", () => {
    test("returns a handle with interrupt and close", () => {
      const handle = startClaudeAgent({
        cwd: "/tmp/test-workspace",
        permissionMode: "safe",
        prompt: "test",
        onEvent: async () => {},
      });

      expect(handle).toBeDefined();
      expect(typeof handle.interrupt).toBe("function");
      expect(typeof handle.close).toBe("function");
      expect(handle.result).toBeInstanceOf(Promise);
    });

    test("result promise resolves with execution result", async () => {
      const handle = startClaudeAgent({
        cwd: "/tmp/test-workspace",
        permissionMode: "safe",
        prompt: "test",
        onEvent: async () => {},
      });

      const result = await handle.result;
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe("test-session-123");
    });
  });
});
