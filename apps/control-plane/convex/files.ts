import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { metadataValidator, now } from "./lib";

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveAttachment = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
    kind: v.union(v.literal("image"), v.literal("pdf"), v.literal("file")),
    threadId: v.optional(v.id("threads")),
    taskId: v.optional(v.id("tasks")),
    runId: v.optional(v.id("runs")),
    messageId: v.optional(v.id("messages")),
    metadata: v.optional(metadataValidator),
  },
  returns: v.object({
    attachmentId: v.id("attachments"),
    url: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const timestamp = now();
    const attachmentId = await ctx.db.insert("attachments", {
      workspaceId: args.workspaceId,
      threadId: args.threadId,
      taskId: args.taskId,
      runId: args.runId,
      messageId: args.messageId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      fileSize: args.fileSize,
      kind: args.kind,
      metadata: args.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return {
      attachmentId,
      url: await ctx.storage.getUrl(args.storageId),
    };
  },
});

export const getAttachment = query({
  args: {
    attachmentId: v.id("attachments"),
  },
  returns: v.union(
    v.object({
      _id: v.id("attachments"),
      workspaceId: v.id("workspaces"),
      threadId: v.optional(v.id("threads")),
      taskId: v.optional(v.id("tasks")),
      runId: v.optional(v.id("runs")),
      messageId: v.optional(v.id("messages")),
      storageId: v.id("_storage"),
      fileName: v.string(),
      contentType: v.string(),
      fileSize: v.number(),
      kind: v.union(v.literal("image"), v.literal("pdf"), v.literal("file")),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
      updatedAt: v.number(),
      url: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);

    if (!attachment) {
      return null;
    }

    const { _creationTime: _ignoredCreationTime, ...attachmentWithoutSystemFields } = attachment;

    return {
      ...attachmentWithoutSystemFields,
      url: await ctx.storage.getUrl(attachment.storageId),
    };
  },
});
