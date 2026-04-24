import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { CREDENTIAL_PROVIDERS, CREDENTIAL_SOURCES } from "./constants";
import { metadataValidator, now, requireOwnedWorkspace } from "./lib";

export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  returns: v.array(
    v.object({
      _id: v.id("credentials"),
      _creationTime: v.number(),
      workspaceId: v.id("workspaces"),
      provider: v.union(...CREDENTIAL_PROVIDERS.map((value) => v.literal(value))),
      source: v.union(...CREDENTIAL_SOURCES.map((value) => v.literal(value))),
      profileEmail: v.optional(v.string()),
      profileName: v.optional(v.string()),
      metadata: v.optional(v.any()),
      hasSecret: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireOwnedWorkspace(ctx, args.workspaceId);
    const credentials = await ctx.db
      .query("credentials")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return credentials.map((credential) => ({
      _id: credential._id,
      _creationTime: credential._creationTime,
      workspaceId: credential.workspaceId,
      provider: credential.provider,
      source: credential.source,
      profileEmail: credential.profileEmail,
      profileName: credential.profileName,
      metadata: credential.metadata,
      hasSecret: credential.encryptedValue !== undefined || credential.secretRef !== undefined,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    }));
  },
});

export const upsert = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    provider: v.union(...CREDENTIAL_PROVIDERS.map((value) => v.literal(value))),
    source: v.union(...CREDENTIAL_SOURCES.map((value) => v.literal(value))),
    secretRef: v.optional(v.string()),
    encryptedValue: v.optional(v.string()),
    profileEmail: v.optional(v.string()),
    profileName: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
  },
  returns: v.id("credentials"),
  handler: async (ctx, args) => {
    await requireOwnedWorkspace(ctx, args.workspaceId);
    const timestamp = now();
    const existing = await ctx.db
      .query("credentials")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("provider"), args.provider))
      .unique();

    const values = {
      workspaceId: args.workspaceId,
      provider: args.provider,
      source: args.source,
      secretRef: args.secretRef,
      encryptedValue: args.encryptedValue,
      profileEmail: args.profileEmail,
      profileName: args.profileName,
      metadata: args.metadata,
      updatedAt: timestamp,
      createdAt: timestamp,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...values,
        createdAt: existing.createdAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("credentials", values);
  },
});
