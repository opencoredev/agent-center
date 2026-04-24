import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { SANDBOX_STATUSES } from "./constants";
import {
  assertSameWorkspace,
  metadataValidator,
  now,
  requireOwnedWorkspace,
  requireOwnedWorkspaceDocument,
} from "./lib";

export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireOwnedWorkspace(ctx, args.workspaceId);
    return await ctx.db
      .query("sandboxes")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    providerKey: v.string(),
    runtimeKind: v.union(v.literal("lightweight"), v.literal("full_sandbox"), v.literal("self_hosted")),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    runId: v.optional(v.id("runs")),
    leaseToken: v.optional(v.string()),
    endpoint: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
  },
  returns: v.id("sandboxes"),
  handler: async (ctx, args) => {
    await requireOwnedWorkspace(ctx, args.workspaceId);
    if (args.projectId !== undefined) {
      const project = await requireOwnedWorkspaceDocument(ctx, "projects", args.projectId);
      assertSameWorkspace(project.workspaceId, args.workspaceId);
    }
    if (args.taskId !== undefined) {
      const task = await requireOwnedWorkspaceDocument(ctx, "tasks", args.taskId);
      assertSameWorkspace(task.workspaceId, args.workspaceId);
    }
    if (args.runId !== undefined) {
      const run = await requireOwnedWorkspaceDocument(ctx, "runs", args.runId);
      assertSameWorkspace(run.workspaceId, args.workspaceId);
    }

    const timestamp = now();
    return await ctx.db.insert("sandboxes", {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      taskId: args.taskId,
      runId: args.runId,
      providerKey: args.providerKey,
      runtimeKind: args.runtimeKind,
      status: "queued",
      leaseToken: args.leaseToken,
      endpoint: args.endpoint,
      metadata: args.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const heartbeat = mutation({
  args: {
    sandboxId: v.id("sandboxes"),
    status: v.union(...SANDBOX_STATUSES.map((value) => v.literal(value))),
    leaseToken: v.optional(v.string()),
    endpoint: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedWorkspaceDocument(ctx, "sandboxes", args.sandboxId);
    await ctx.db.patch(args.sandboxId, {
      status: args.status,
      ...(args.leaseToken !== undefined ? { leaseToken: args.leaseToken } : {}),
      ...(args.endpoint !== undefined ? { endpoint: args.endpoint } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      lastHeartbeatAt: now(),
      updatedAt: now(),
    });
    return null;
  },
});
