import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { MESSAGE_ROLES } from "./constants";
import {
  assertSameWorkspace,
  metadataValidator,
  now,
  requireOwnedWorkspace,
  requireOwnedWorkspaceDocument,
} from "./lib";

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskId: v.optional(v.id("tasks")),
    runId: v.optional(v.id("runs")),
    title: v.string(),
    metadata: v.optional(metadataValidator),
  },
  returns: v.id("threads"),
  handler: async (ctx, args) => {
    await requireOwnedWorkspace(ctx, args.workspaceId);
    if (args.taskId !== undefined) {
      const task = await requireOwnedWorkspaceDocument(ctx, "tasks", args.taskId);
      assertSameWorkspace(task.workspaceId, args.workspaceId);
    }
    if (args.runId !== undefined) {
      const run = await requireOwnedWorkspaceDocument(ctx, "runs", args.runId);
      assertSameWorkspace(run.workspaceId, args.workspaceId);
    }

    const timestamp = now();
    return await ctx.db.insert("threads", {
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      runId: args.runId,
      title: args.title,
      status: "open",
      metadata: args.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const listMessages = query({
  args: {
    threadId: v.id("threads"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireOwnedWorkspaceDocument(ctx, "threads", args.threadId);
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

export const postMessage = mutation({
  args: {
    threadId: v.id("threads"),
    role: v.union(...MESSAGE_ROLES.map((value) => v.literal(value))),
    content: v.string(),
    runId: v.optional(v.id("runs")),
    parts: v.optional(v.any()),
    metadata: v.optional(metadataValidator),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const thread = await requireOwnedWorkspaceDocument(ctx, "threads", args.threadId);
    if (args.runId !== undefined) {
      const run = await requireOwnedWorkspaceDocument(ctx, "runs", args.runId);
      assertSameWorkspace(run.workspaceId, thread.workspaceId);
    }

    return await ctx.db.insert("messages", {
      threadId: args.threadId,
      runId: args.runId,
      role: args.role,
      content: args.content,
      parts: args.parts,
      metadata: args.metadata,
      createdAt: now(),
    });
  },
});
