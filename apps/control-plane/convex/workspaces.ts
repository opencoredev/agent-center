import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { metadataValidator, now, normalizeSlug } from "./lib";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("workspaces"),
      _creationTime: v.number(),
      slug: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("workspaces").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
  },
  returns: v.id("workspaces"),
  handler: async (ctx, args) => {
    const baseSlug = args.slug ?? args.name;
    const slug = normalizeSlug(baseSlug);
    const timestamp = now();
    return await ctx.db.insert("workspaces", {
      slug,
      name: args.name,
      description: args.description,
      metadata: args.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) return null;

    await ctx.db.patch(args.workspaceId, {
      name: args.name ?? workspace.name,
      description: args.description ?? workspace.description,
      metadata: args.metadata ?? workspace.metadata,
      updatedAt: now(),
    });
    return null;
  },
});
