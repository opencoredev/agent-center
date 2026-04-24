import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
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
      .query("repoConnections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    projectId: v.optional(v.id("projects")),
    owner: v.string(),
    repo: v.string(),
    defaultBranch: v.optional(v.string()),
    connectionMetadata: v.optional(metadataValidator),
  },
  returns: v.id("repoConnections"),
  handler: async (ctx, args) => {
    await requireOwnedWorkspace(ctx, args.workspaceId);
    if (args.projectId !== undefined) {
      const project = await requireOwnedWorkspaceDocument(ctx, "projects", args.projectId);
      assertSameWorkspace(project.workspaceId, args.workspaceId);
    }

    const timestamp = now();
    return await ctx.db.insert("repoConnections", {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      provider: "github",
      owner: args.owner,
      repo: args.repo,
      defaultBranch: args.defaultBranch ?? "main",
      authType: "pat",
      connectionMetadata: args.connectionMetadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});
