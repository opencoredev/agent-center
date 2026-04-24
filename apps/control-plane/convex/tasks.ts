import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { TASK_STATUSES } from "./constants";
import {
  assertSameWorkspace,
  executionConfigValidator,
  executionPolicyValidator,
  metadataValidator,
  now,
  permissionModeValidator,
  requireOwnedWorkspace,
  requireOwnedWorkspaceDocument,
  sandboxSizeValidator,
} from "./lib";

export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireOwnedWorkspace(ctx, args.workspaceId);
    return await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    projectId: v.optional(v.id("projects")),
    repoConnectionId: v.optional(v.id("repoConnections")),
    threadId: v.optional(v.id("threads")),
    title: v.string(),
    prompt: v.string(),
    sandboxSize: sandboxSizeValidator,
    permissionMode: permissionModeValidator,
    baseBranch: v.optional(v.string()),
    branchName: v.optional(v.string()),
    config: executionConfigValidator,
    policy: v.optional(executionPolicyValidator),
    metadata: v.optional(metadataValidator),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    await requireOwnedWorkspace(ctx, args.workspaceId);
    if (args.projectId !== undefined) {
      const project = await requireOwnedWorkspaceDocument(ctx, "projects", args.projectId);
      assertSameWorkspace(project.workspaceId, args.workspaceId);
    }
    if (args.repoConnectionId !== undefined) {
      const repoConnection = await requireOwnedWorkspaceDocument(
        ctx,
        "repoConnections",
        args.repoConnectionId,
      );
      assertSameWorkspace(repoConnection.workspaceId, args.workspaceId);
    }
    if (args.threadId !== undefined) {
      const thread = await requireOwnedWorkspaceDocument(ctx, "threads", args.threadId);
      assertSameWorkspace(thread.workspaceId, args.workspaceId);
    }

    const timestamp = now();
    return await ctx.db.insert("tasks", {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      repoConnectionId: args.repoConnectionId,
      threadId: args.threadId,
      title: args.title,
      prompt: args.prompt,
      status: "pending",
      sandboxSize: args.sandboxSize,
      permissionMode: args.permissionMode,
      baseBranch: args.baseBranch,
      branchName: args.branchName,
      config: args.config,
      policy: args.policy,
      metadata: args.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const updateStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    status: v.union(...TASK_STATUSES.map((value) => v.literal(value))),
    metadata: v.optional(metadataValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedWorkspaceDocument(ctx, "tasks", args.taskId);
    await ctx.db.patch(args.taskId, {
      status: args.status,
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      updatedAt: now(),
    });
    return null;
  },
});
