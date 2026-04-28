import { describe, expect, test } from "bun:test";

import {
  AGENT_PROVIDERS,
  PERMISSION_MODES,
  RUNTIME_PROVIDERS,
  RUNTIME_TARGETS,
  RUN_STATUSES,
  SANDBOX_IDLE_POLICIES,
  SANDBOX_PROFILES,
  SANDBOX_SIZES,
  TASK_STATUSES,
  type AgentProvider,
  type PermissionMode,
  type RuntimeProvider,
  type RuntimeTarget,
  type RunStatus,
  type SandboxIdlePolicy,
  type SandboxProfile,
  type SandboxSize,
  type TaskStatus,
} from "../domain/enums";

describe("domain enums", () => {
  test("TASK_STATUSES contains required values", () => {
    const required: TaskStatus[] = [
      "pending",
      "queued",
      "running",
      "completed",
      "failed",
      "cancelled",
    ];
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

  test("RUNTIME_TARGETS contains required values", () => {
    const required: RuntimeTarget[] = ["local", "cloud", "self_hosted"];
    for (const target of required) {
      expect(RUNTIME_TARGETS).toContain(target);
    }
  });

  test("RUNTIME_PROVIDERS contains required values", () => {
    const required: RuntimeProvider[] = [
      "legacy_local",
      "convex_bash",
      "agent_os",
      "e2b",
      "self_hosted_runner",
    ];
    for (const provider of required) {
      expect(RUNTIME_PROVIDERS).toContain(provider);
    }
  });

  test("SANDBOX_PROFILES contains required values", () => {
    const required: SandboxProfile[] = ["none", "lightweight", "full"];
    for (const profile of required) {
      expect(SANDBOX_PROFILES).toContain(profile);
    }
  });

  test("SANDBOX_IDLE_POLICIES contains required values", () => {
    const required: SandboxIdlePolicy[] = ["retain", "sleep", "terminate"];
    for (const policy of required) {
      expect(SANDBOX_IDLE_POLICIES).toContain(policy);
    }
  });

  test("PERMISSION_MODES contains required values", () => {
    const required: PermissionMode[] = ["yolo", "safe", "custom"];
    for (const mode of required) {
      expect(PERMISSION_MODES).toContain(mode);
    }
  });

  test("AGENT_PROVIDERS contains required values", () => {
    const required: AgentProvider[] = ["none", "claude", "codex", "opencode", "cursor"];
    for (const provider of required) {
      expect(AGENT_PROVIDERS).toContain(provider);
    }
  });

  test("AGENT_PROVIDERS defaults to none", () => {
    expect(AGENT_PROVIDERS[0]).toBe("none");
  });
});
