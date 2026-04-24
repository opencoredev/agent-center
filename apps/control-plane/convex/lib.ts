import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  AGENT_PROVIDERS,
  PERMISSION_MODES,
  REPO_AUTH_TYPES,
  REPO_PROVIDERS,
  RUN_STATUSES,
  SANDBOX_SIZES,
  TASK_STATUSES,
} from "./constants";

declare const process: {
  env: {
    AGENT_CENTER_CONVEX_SERVICE_TOKEN?: string;
  };
};

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
  agentReasoningEffort: v.optional(
    v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("xhigh"),
      v.literal("max"),
      v.literal("ultrathink"),
    ),
  ),
  agentThinkingEnabled: v.optional(v.boolean()),
  agentPrompt: v.optional(v.string()),
  runtime: v.optional(executionRuntimeValidator),
  workingDirectory: v.optional(v.string()),
  commitMessage: v.optional(v.string()),
  prTitle: v.optional(v.string()),
  prBody: v.optional(v.string()),
});
export const automationConfigValidator = v.object({
  commands: v.array(executionCommandValidator),
  agentProvider: v.optional(v.union(...AGENT_PROVIDERS.map((value) => v.literal(value)))),
  agentModel: v.optional(v.string()),
  agentReasoningEffort: v.optional(
    v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("xhigh"),
      v.literal("max"),
      v.literal("ultrathink"),
    ),
  ),
  agentThinkingEnabled: v.optional(v.boolean()),
  agentPrompt: v.optional(v.string()),
  runtime: v.optional(executionRuntimeValidator),
  workingDirectory: v.optional(v.string()),
  commitMessage: v.optional(v.string()),
  prTitle: v.optional(v.string()),
  prBody: v.optional(v.string()),
  branchPattern: v.optional(v.string()),
  targetBranchFormat: v.optional(v.string()),
});
export const sandboxSizeValidator = v.union(...SANDBOX_SIZES.map((value) => v.literal(value)));
export const permissionModeValidator = v.union(...PERMISSION_MODES.map((value) => v.literal(value)));
export const taskStatusValidator = v.union(...TASK_STATUSES.map((value) => v.literal(value)));
export const runStatusValidator = v.union(...RUN_STATUSES.map((value) => v.literal(value)));
export const repoProviderValidator = v.union(...REPO_PROVIDERS.map((value) => v.literal(value)));
export const repoAuthTypeValidator = v.union(...REPO_AUTH_TYPES.map((value) => v.literal(value)));

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

type AuthenticatedCtx = QueryCtx | MutationCtx;
type WorkspaceScopedTable =
  | "attachments"
  | "credentials"
  | "projects"
  | "repoConnections"
  | "runs"
  | "sandboxes"
  | "tasks"
  | "threads";

type WorkspaceScopedDoc<TableName extends WorkspaceScopedTable> = Doc<TableName> & {
  workspaceId: Id<"workspaces">;
};

export function authorizationError() {
  return new ConvexError("Authentication required");
}

export function workspaceAuthorizationError() {
  return new ConvexError("Not authorized for this workspace");
}

export function notFoundError(resource: string) {
  return new ConvexError(`${resource} not found`);
}

export function requireServiceToken(serviceToken: string) {
  const expectedToken = process.env.AGENT_CENTER_CONVEX_SERVICE_TOKEN;
  if (!expectedToken) {
    throw new ConvexError("Convex service token is not configured");
  }
  if (serviceToken !== expectedToken) {
    throw new ConvexError("Invalid Convex service token");
  }
}

export async function requireAuthenticatedIdentity(ctx: AuthenticatedCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw authorizationError();
  }
  return identity;
}

export async function requireOwnedWorkspace(
  ctx: AuthenticatedCtx,
  workspaceId: Id<"workspaces">,
) {
  const identity = await requireAuthenticatedIdentity(ctx);
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace || workspace.ownerIdentity !== identity.tokenIdentifier) {
    throw workspaceAuthorizationError();
  }
  return workspace;
}

export async function requireOwnedWorkspaceDocument<TableName extends WorkspaceScopedTable>(
  ctx: AuthenticatedCtx,
  tableName: TableName,
  id: Id<TableName>,
) {
  const document = await ctx.db.get(id);
  if (!document) {
    throw notFoundError(tableName);
  }

  const workspaceScopedDocument = document as WorkspaceScopedDoc<TableName>;
  await requireOwnedWorkspace(ctx, workspaceScopedDocument.workspaceId);
  return workspaceScopedDocument;
}

export function assertSameWorkspace(
  actualWorkspaceId: Id<"workspaces">,
  expectedWorkspaceId: Id<"workspaces">,
) {
  if (actualWorkspaceId !== expectedWorkspaceId) {
    throw workspaceAuthorizationError();
  }
}
