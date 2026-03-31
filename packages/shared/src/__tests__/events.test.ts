import { describe, expect, test } from "bun:test";

import { EVENT_TYPES, type EventType } from "../events";

describe("event types", () => {
  test("contains all required event types", () => {
    const required: EventType[] = [
      "task.created",
      "task.queued",
      "run.created",
      "run.status_changed",
      "run.log",
      "run.command.started",
      "run.command.finished",
      "repo.clone.started",
      "repo.clone.finished",
      "git.commit.created",
      "git.branch.pushed",
      "git.pr.opened",
      "run.completed",
      "run.failed",
      "automation.triggered",
    ];
    for (const eventType of required) {
      expect(EVENT_TYPES).toContain(eventType);
    }
  });

  test("event types are readonly strings", () => {
    expect(Array.isArray(EVENT_TYPES)).toBe(true);
    expect(EVENT_TYPES.length).toBeGreaterThan(0);
    for (const eventType of EVENT_TYPES) {
      expect(typeof eventType).toBe("string");
      expect(eventType.length).toBeGreaterThan(0);
    }
  });
});
