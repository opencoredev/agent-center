import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { metadataValidator, now, normalizeSlug } from "./lib";

export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    defaultBranch: v.optional(v.string()),
    rootDirectory: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const timestamp = now();
    return await ctx.db.insert("projects", {
      workspaceId: args.workspaceId,
      slug: normalizeSlug(args.slug ?? args.name),
      name: args.name,
      description: args.description,
      defaultBranch: args.defaultBranch ?? "main",
      rootDirectory: args.rootDirectory,
      metadata: args.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

