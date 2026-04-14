export const TASK_STATUSES = ["pending", "queued", "running", "completed", "failed", "cancelled"] as const;
export const RUN_STATUSES = [
  "queued",
  "provisioning",
  "cloning",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;
export const SANDBOX_SIZES = ["small", "medium", "large"] as const;
export const PERMISSION_MODES = ["yolo", "safe", "custom"] as const;
export const AGENT_PROVIDERS = ["none", "claude", "codex"] as const;
export const RUNTIME_PROVIDER_KINDS = ["lightweight", "full_sandbox", "self_hosted"] as const;
export const MESSAGE_ROLES = ["system", "user", "assistant", "tool", "developer"] as const;
export const CREDENTIAL_PROVIDERS = ["openai", "claude", "github"] as const;
export const CREDENTIAL_SOURCES = ["api_key", "oauth", "env", "secret_ref"] as const;
export const SANDBOX_STATUSES = [
  "queued",
  "provisioning",
  "active",
  "sleeping",
  "failed",
  "terminated",
] as const;
