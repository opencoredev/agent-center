import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { RUN_STATUSES } from "./constants";
import {
  executionConfigValidator,
  executionPolicyValidator,
  metadataValidator,
  now,
  permissionModeValidator,
  sandboxSizeValidator,
} from "./lib";

export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("runs")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    threadId: v.optional(v.id("threads")),
    sandboxId: v.optional(v.id("sandboxes")),
    providerKey: v.optional(v.string()),
    repoConnectionId: v.optional(v.id("repoConnections")),
    prompt: v.string(),
    baseBranch: v.optional(v.string()),
    branchName: v.optional(v.string()),
    sandboxSize: sandboxSizeValidator,
    permissionMode: permissionModeValidator,
    config: executionConfigValidator,
    policy: v.optional(executionPolicyValidator),
    metadata: v.optional(metadataValidator),
  },
  returns: v.id("runs"),
  handler: async (ctx, args) => {
    const timestamp = now();
    const existingRuns = await ctx.db
      .query("runs")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    return await ctx.db.insert("runs", {
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      threadId: args.threadId,
      sandboxId: args.sandboxId,
      providerKey: args.providerKey,
      repoConnectionId: args.repoConnectionId,
      status: "queued",
      attempt: existingRuns.length + 1,
      nextEventSequence: 1,
      prompt: args.prompt,
      baseBranch: args.baseBranch,
      branchName: args.branchName,
      sandboxSize: args.sandboxSize,
      permissionMode: args.permissionMode,
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
    runId: v.id("runs"),
    status: v.union(...RUN_STATUSES.map((value) => v.literal(value))),
    errorMessage: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.runId);
    if (!current) return null;

    const completedAt =
      args.status === "completed" || args.status === "failed" || args.status === "cancelled"
        ? now()
        : current.completedAt;

    await ctx.db.patch(args.runId, {
      status: args.status,
      errorMessage: args.errorMessage ?? current.errorMessage,
      metadata: args.metadata ?? current.metadata,
      completedAt,
      updatedAt: now(),
      startedAt: current.startedAt ?? (args.status === "running" ? now() : current.startedAt),
    });
    return null;
  },
});

export const appendEvent = mutation({
  args: {
    runId: v.id("runs"),
    eventType: v.string(),
    level: v.optional(v.string()),
    message: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      return 0;
    }

    const sequence = run.nextEventSequence ?? 1;

    await ctx.db.insert("runEvents", {
      runId: args.runId,
      sequence,
      eventType: args.eventType,
      level: args.level,
      message: args.message,
      payload: args.payload,
      createdAt: now(),
    });
    await ctx.db.patch(args.runId, {
      nextEventSequence: sequence + 1,
      updatedAt: now(),
    });
    return sequence;
  },
});

export const listEvents = query({
  args: {
    runId: v.id("runs"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("runEvents")
      .withIndex("by_run_sequence", (q) => q.eq("runId", args.runId))
      .collect();
  },
});
