import { describe, expect, test } from "bun:test";

import { parseCodexJsonLine } from "../services/execution/codex-executor";

describe("codex-executor", () => {
  test("marks completed agent messages as replace deltas", () => {
    const event = parseCodexJsonLine(
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item_0",
          type: "agent_message",
          text: "Hello from Codex.",
        },
      }),
    );

    expect(event).not.toBeNull();
    expect(event?.type).toBe("assistant_message_delta");
    expect(event?.message).toBe("Hello from Codex.");
    expect(event?.payload?.assistantDelta).toEqual({
      mode: "replace",
      text: "Hello from Codex.",
    });
  });

  test("marks raw deltas as append deltas", () => {
    const event = parseCodexJsonLine(
      JSON.stringify({
        type: "assistant.delta",
        delta: " world",
      }),
    );

    expect(event).not.toBeNull();
    expect(event?.type).toBe("assistant_message_delta");
    expect(event?.message).toBe(" world");
    expect(event?.payload?.assistantDelta).toEqual({
      mode: "append",
      text: " world",
    });
  });
});
