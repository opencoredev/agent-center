import { describe, expect, test } from "bun:test";

import {
  AGENT_PROVIDERS,
  PERMISSION_MODES,
  RUN_STATUSES,
  SANDBOX_SIZES,
  TASK_STATUSES,
  type AgentProvider,
  type PermissionMode,
  type RunStatus,
  type SandboxSize,
  type TaskStatus,
} from "../domain/enums";

describe("domain enums", () => {
  test("TASK_STATUSES contains required values", () => {
    const required: TaskStatus[] = ["pending", "queued", "running", "completed", "failed", "cancelled"];
    for (const status of required) {
      expect(TASK_STATUSES).toContain(status);
    }
  });

  test("RUN_STATUSES contains required values", () => {
    const required: RunStatus[] = [
      "queued",
      "provisioning",
      "cloning",
      "running",
      "paused",
      "completed",
      "failed",
      "cancelled",
    ];
    for (const status of required) {
      expect(RUN_STATUSES).toContain(status);
    }
  });

  test("SANDBOX_SIZES contains required values", () => {
    const required: SandboxSize[] = ["small", "medium", "large"];
    for (const size of required) {
      expect(SANDBOX_SIZES).toContain(size);
    }
  });

  test("PERMISSION_MODES contains required values", () => {
    const required: PermissionMode[] = ["yolo", "safe", "custom"];
    for (const mode of required) {
      expect(PERMISSION_MODES).toContain(mode);
    }
  });

  test("AGENT_PROVIDERS contains required values", () => {
    const required: AgentProvider[] = ["none", "claude", "codex"];
    for (const provider of required) {
      expect(AGENT_PROVIDERS).toContain(provider);
    }
  });

  test("AGENT_PROVIDERS defaults to none", () => {
    expect(AGENT_PROVIDERS[0]).toBe("none");
  });
});
