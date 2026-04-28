import { describe, expect, mock, test } from "bun:test";

const appendedEvents: Array<Record<string, unknown>> = [];
const metadataWrites: Array<Record<string, unknown>> = [];

mock.module("../repositories/run-repository", () => ({
  appendRunEvent: mock(async (_runId: string, values: Record<string, unknown>) => {
    appendedEvents.push(values);
  }),
  findRunById: mock(async () => ({ metadata: {} })),
  updateRun: mock(async (_runId: string, values: Record<string, unknown>) => values),
  updateRunMetadata: mock(
    async (
      _runId: string,
      updater: (metadata: Record<string, unknown>) => Record<string, unknown>,
    ) => {
      const next = updater({});
      metadataWrites.push(next);
      return next;
    },
  ),
  updateTask: mock(async (_taskId: string, values: Record<string, unknown>) => values),
}));

const { RunPersistence } = await import("../services/execution/persistence");

describe("RunPersistence redaction", () => {
  test("redacts persisted event messages, payloads, and metadata summaries", async () => {
    appendedEvents.length = 0;
    metadataWrites.length = 0;

    const persistence = new RunPersistence({ runId: "run-1", taskId: "task-1" });

    await persistence.appendLog("command leaked sk-test-secret1234567890", {
      aggregated_output: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
      eventType: "item.completed",
      item: {
        aggregated_output: "sess_abcdefghijklmnopqrstuvwxyz",
        command: "echo token=abcdefghijklmnopqrstuvwxyz",
        status: "completed",
        type: "command_execution",
      },
      stream: "stdout",
    });

    expect(appendedEvents[0]).toMatchObject({
      message: "command leaked [REDACTED]",
      payload: {
        aggregated_output: "Authorization: Bearer [REDACTED]",
        item: {
          aggregated_output: "[REDACTED]",
          command: "echo token=[REDACTED]",
        },
      },
    });
    expect(JSON.stringify(metadataWrites)).not.toContain("sk-test-secret");
    expect(JSON.stringify(metadataWrites)).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});
