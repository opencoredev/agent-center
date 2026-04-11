import { v } from "convex/values";
import {
  AGENT_PROVIDERS,
  PERMISSION_MODES,
  SANDBOX_SIZES,
} from "./constants";

export const metadataValidator = v.any();
export const executionCommandValidator = v.object({
  command: v.string(),
  cwd: v.optional(v.string()),
  env: v.optional(v.record(v.string(), v.string())),
  timeoutSeconds: v.optional(v.number()),
});
export const executionPolicyValidator = v.object({
  customPermissions: v.optional(v.array(v.string())),
  writablePaths: v.optional(v.array(v.string())),
  blockedCommands: v.optional(v.array(v.string())),
});
export const executionRuntimeValidator = v.object({
  target: v.union(v.literal("local"), v.literal("cloud"), v.literal("self_hosted")),
  provider: v.union(
    v.literal("legacy_local"),
    v.literal("convex_bash"),
    v.literal("agent_os"),
    v.literal("e2b"),
    v.literal("self_hosted_runner"),
  ),
  sandboxProfile: v.union(v.literal("none"), v.literal("lightweight"), v.literal("full")),
  idlePolicy: v.optional(v.union(v.literal("retain"), v.literal("sleep"), v.literal("terminate"))),
  resumeOnActivity: v.optional(v.boolean()),
  ttlSeconds: v.optional(v.number()),
});
export const executionConfigValidator = v.object({
  commands: v.array(executionCommandValidator),
  agentProvider: v.optional(v.union(...AGENT_PROVIDERS.map((value) => v.literal(value)))),
  agentModel: v.optional(v.string()),
  agentPrompt: v.optional(v.string()),
  runtime: v.optional(executionRuntimeValidator),
  workingDirectory: v.optional(v.string()),
  commitMessage: v.optional(v.string()),
  prTitle: v.optional(v.string()),
  prBody: v.optional(v.string()),
});
export const sandboxSizeValidator = v.union(...SANDBOX_SIZES.map((value) => v.literal(value)));
export const permissionModeValidator = v.union(...PERMISSION_MODES.map((value) => v.literal(value)));

export function now() {
  return Date.now();
}

export function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}

export function createHandle(base: string, suffix: string) {
  return `${normalizeSlug(base)}-${suffix}`.replace(/-+/g, "-").slice(0, 96);
}
