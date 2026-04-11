export const TASK_STATUSES = [
  "pending",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly [string, ...string[]];

export const RUN_STATUSES = [
  "queued",
  "provisioning",
  "cloning",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly [string, ...string[]];

export const SANDBOX_SIZES = ["small", "medium", "large"] as const satisfies readonly [
  string,
  ...string[],
];

export const RUNTIME_TARGETS = ["local", "cloud", "self_hosted"] as const satisfies readonly [
  string,
  ...string[],
];

export const RUNTIME_PROVIDERS = [
  "legacy_local",
  "convex_bash",
  "agent_os",
  "e2b",
  "self_hosted_runner",
] as const satisfies readonly [string, ...string[]];

export const SANDBOX_PROFILES = ["none", "lightweight", "full"] as const satisfies readonly [
  string,
  ...string[],
];

export const SANDBOX_IDLE_POLICIES = ["retain", "sleep", "terminate"] as const satisfies readonly [
  string,
  ...string[],
];

export const PERMISSION_MODES = ["yolo", "safe", "custom"] as const satisfies readonly [
  string,
  ...string[],
];

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type RunStatus = (typeof RUN_STATUSES)[number];
export type SandboxSize = (typeof SANDBOX_SIZES)[number];
export type RuntimeTarget = (typeof RUNTIME_TARGETS)[number];
export type RuntimeProvider = (typeof RUNTIME_PROVIDERS)[number];
export type SandboxProfile = (typeof SANDBOX_PROFILES)[number];
export type SandboxIdlePolicy = (typeof SANDBOX_IDLE_POLICIES)[number];
export const AGENT_PROVIDERS = ["none", "claude", "codex"] as const satisfies readonly [
  string,
  ...string[],
];

export type PermissionMode = (typeof PERMISSION_MODES)[number];
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];
