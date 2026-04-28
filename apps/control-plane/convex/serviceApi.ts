import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import {
  automationConfigValidator,
  executionConfigValidator,
  executionPolicyValidator,
  metadataValidator,
  permissionModeValidator,
  repoAuthTypeValidator,
  repoProviderValidator,
  requireServiceToken,
  runStatusValidator,
  sandboxSizeValidator,
  taskStatusValidator,
} from "./lib";

const serviceArgs = {
  serviceToken: v.string(),
};

function toApiRecord<TRecord extends { _id: string; _creationTime: number }>(record: TRecord) {
  const { _id, _creationTime, ...rest } = record;
  return {
    id: _id,
    _id,
    _creationTime,
    ...rest,
  };
}

function notExpired(expiresAt: number | undefined) {
  return expiresAt === undefined || expiresAt > Date.now();
}

function sortByCreatedAtDesc<TRecord extends { createdAt: number }>(records: TRecord[]) {
  return [...records].sort((left, right) => right.createdAt - left.createdAt);
}

function sortByAttemptDesc<TRecord extends { attempt: number }>(records: TRecord[]) {
  return [...records].sort((left, right) => right.attempt - left.attempt);
}

function toNullableField<TValue>(value: TValue | null | undefined) {
  return value === null ? undefined : value;
}

function getGitHubDeliveryId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const github = (metadata as { github?: unknown }).github;
  if (!github || typeof github !== "object" || Array.isArray(github)) {
    return undefined;
  }

  const deliveryId = (github as { deliveryId?: unknown }).deliveryId;
  return typeof deliveryId === "string" ? deliveryId : undefined;
}

function getInstallationId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const installationId = (metadata as { installationId?: unknown }).installationId;
  return typeof installationId === "number" ? installationId : undefined;
}

const nullableString = v.union(v.string(), v.null());
const optionalNullableString = v.optional(nullableString);
const optionalNullableProjectId = v.optional(v.union(v.id("projects"), v.null()));
const optionalNullableUserId = v.optional(v.union(v.id("users"), v.null()));
const defaultExecutionConfig = { commands: [] };
const defaultPolicy = {};
const defaultMetadata = {};

export const upsertGoogleUser = mutation({
  args: {
    ...serviceArgs,
    email: v.string(),
    googleId: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        authProvider: "google",
        authProviderId: args.googleId,
        name: args.name ?? existing.name,
        avatarUrl: args.avatarUrl ?? existing.avatarUrl,
        updatedAt: now,
      });

      return toApiRecord({
        ...existing,
        authProvider: "google",
        authProviderId: args.googleId,
        name: args.name ?? existing.name,
        avatarUrl: args.avatarUrl ?? existing.avatarUrl,
        updatedAt: now,
      });
    }

    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      authProvider: "google",
      authProviderId: args.googleId,
      createdAt: now,
      updatedAt: now,
    });

    const user = await ctx.db.get(userId);
    return user ? toApiRecord(user) : null;
  },
});

export const upsertGitHubOAuthUser = mutation({
  args: {
    ...serviceArgs,
    email: v.string(),
    githubId: v.string(),
    login: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (existing) {
      const linkedAuth =
        existing.authProvider === "github"
          ? {
              authProvider: "github",
              authProviderId: args.githubId,
            }
          : {};
      const patch = {
        ...linkedAuth,
        name: args.name ?? args.login,
        avatarUrl: args.avatarUrl ?? existing.avatarUrl,
        updatedAt: now,
      };

      await ctx.db.patch(existing._id, patch);

      return toApiRecord({
        ...existing,
        ...patch,
      });
    }

    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name ?? args.login,
      avatarUrl: args.avatarUrl,
      authProvider: "github",
      authProviderId: args.githubId,
      createdAt: now,
      updatedAt: now,
    });

    const user = await ctx.db.get(userId);
    return user ? toApiRecord(user) : null;
  },
});

export const upsertLocalBasicAuthUser = mutation({
  args: {
    ...serviceArgs,
    username: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authProvider_and_authProviderId", (q) =>
        q.eq("authProvider", "local-basic").eq("authProviderId", args.username),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.username,
        updatedAt: now,
      });

      return toApiRecord({
        ...existing,
        name: args.username,
        updatedAt: now,
      });
    }

    const userId = await ctx.db.insert("users", {
      email: `${args.username}@local.agent.center`,
      name: args.username,
      authProvider: "local-basic",
      authProviderId: args.username,
      createdAt: now,
      updatedAt: now,
    });

    const user = await ctx.db.get(userId);
    return user ? toApiRecord(user) : null;
  },
});

export const getLocalPasswordUser = query({
  args: {
    ...serviceArgs,
    username: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const user = await ctx.db
      .query("users")
      .withIndex("by_authProvider_and_authProviderId", (q) =>
        q.eq("authProvider", "local-password").eq("authProviderId", args.username),
      )
      .unique();

    return user ? toApiRecord(user) : null;
  },
});

export const createLocalPasswordUser = mutation({
  args: {
    ...serviceArgs,
    username: v.string(),
    email: v.optional(v.string()),
    passwordHash: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_authProvider_and_authProviderId", (q) =>
        q.eq("authProvider", "local-password").eq("authProviderId", args.username),
      )
      .unique();

    if (existing) {
      return null;
    }

    const existingEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email ?? args.username))
      .unique();

    if (existingEmail) {
      return null;
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email: args.email ?? `${args.username}@local.agent.center`,
      name: args.email ?? args.username,
      authProvider: "local-password",
      authProviderId: args.username,
      passwordHash: args.passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    const user = await ctx.db.get(userId);
    return user ? toApiRecord(user) : null;
  },
});

export const createSession = mutation({
  args: {
    ...serviceArgs,
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const sessionId = await ctx.db.insert("sessions", {
      userId: args.userId,
      token: args.tokenHash,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });

    const session = await ctx.db.get(sessionId);
    return session ? toApiRecord(session) : null;
  },
});

export const authenticateSessionToken = mutation({
  args: {
    ...serviceArgs,
    tokenHash: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.tokenHash))
      .unique();

    if (!session) {
      return null;
    }

    if (session.expiresAt < Date.now()) {
      await ctx.db.delete(session._id);
      return null;
    }

    return toApiRecord(session);
  },
});

export const deleteSession = mutation({
  args: {
    ...serviceArgs,
    sessionId: v.id("sessions"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    await ctx.db.delete(args.sessionId);
    return true;
  },
});

export const deleteSessionByTokenHash = mutation({
  args: {
    ...serviceArgs,
    tokenHash: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.tokenHash))
      .unique();

    if (!session) {
      return false;
    }

    await ctx.db.delete(session._id);
    return true;
  },
});

export const createApiKey = mutation({
  args: {
    ...serviceArgs,
    userId: v.id("users"),
    name: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const apiKeyId = await ctx.db.insert("apiKeys", {
      userId: args.userId,
      name: args.name,
      keyHash: args.keyHash,
      keyPrefix: args.keyPrefix,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });

    const apiKey = await ctx.db.get(apiKeyId);
    return apiKey ? toApiRecord(apiKey) : null;
  },
});

export const listApiKeysByUser = query({
  args: {
    ...serviceArgs,
    userId: v.id("users"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return keys.map(toApiRecord);
  },
});

export const authenticateApiKey = mutation({
  args: {
    ...serviceArgs,
    keyHash: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .unique();

    if (!apiKey || !notExpired(apiKey.expiresAt) || !apiKey.userId) {
      return null;
    }

    const lastUsedAt = Date.now();
    await ctx.db.patch(apiKey._id, { lastUsedAt });

    return toApiRecord({
      ...apiKey,
      lastUsedAt,
    });
  },
});

export const deleteApiKey = mutation({
  args: {
    ...serviceArgs,
    apiKeyId: v.id("apiKeys"),
    userId: v.id("users"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const apiKey = await ctx.db.get(args.apiKeyId);
    if (!apiKey || apiKey.userId !== args.userId) {
      return false;
    }

    await ctx.db.delete(args.apiKeyId);
    return true;
  },
});

export const getCredential = query({
  args: {
    ...serviceArgs,
    provider: v.string(),
    userId: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId ?? undefined).eq("provider", args.provider as any),
      )
      .first();

    return credential ? toApiRecord(credential) : null;
  },
});

export const upsertCredential = mutation({
  args: {
    ...serviceArgs,
    provider: v.string(),
    userId: v.optional(v.union(v.string(), v.null())),
    source: v.union(v.literal("api_key"), v.literal("oauth")),
    encryptedApiKey: optionalNullableString,
    encryptedAccessToken: optionalNullableString,
    encryptedRefreshToken: optionalNullableString,
    tokenExpiresAt: v.optional(v.union(v.number(), v.null())),
    profileEmail: optionalNullableString,
    subscriptionType: optionalNullableString,
    metadata: v.optional(metadataValidator),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const now = Date.now();
    const existing = await ctx.db
      .query("credentials")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId ?? undefined).eq("provider", args.provider as any),
      )
      .first();

    const values = {
      provider: args.provider as any,
      userId: args.userId ?? undefined,
      source: args.source,
      encryptedApiKey: toNullableField(args.encryptedApiKey),
      encryptedAccessToken: toNullableField(args.encryptedAccessToken),
      encryptedRefreshToken: toNullableField(args.encryptedRefreshToken),
      tokenExpiresAt: toNullableField(args.tokenExpiresAt),
      profileEmail: toNullableField(args.profileEmail),
      subscriptionType: toNullableField(args.subscriptionType),
      metadata: args.metadata ?? defaultMetadata,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, values);
      const credential = await ctx.db.get(existing._id);
      return credential ? toApiRecord(credential) : null;
    }

    const credentialId = await ctx.db.insert("credentials", {
      ...values,
      createdAt: now,
    });
    const credential = await ctx.db.get(credentialId);
    return credential ? toApiRecord(credential) : null;
  },
});

export const patchCredentialProfile = mutation({
  args: {
    ...serviceArgs,
    provider: v.string(),
    userId: v.string(),
    profileEmail: optionalNullableString,
    subscriptionType: optionalNullableString,
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider as any),
      )
      .first();
    if (!credential) return null;

    await ctx.db.patch(credential._id, {
      profileEmail: toNullableField(args.profileEmail),
      subscriptionType: toNullableField(args.subscriptionType),
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(credential._id);
    return updated ? toApiRecord(updated) : null;
  },
});

export const deleteCredential = mutation({
  args: {
    ...serviceArgs,
    provider: v.string(),
    userId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider as any),
      )
      .first();
    if (!credential) return false;

    await ctx.db.delete(credential._id);
    return true;
  },
});

export const listWorkspaces = query({
  args: serviceArgs,
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const workspaces = await ctx.db.query("workspaces").collect();
    return sortByCreatedAtDesc(workspaces).map(toApiRecord);
  },
});

export const getWorkspaceById = query({
  args: {
    ...serviceArgs,
    workspaceId: v.id("workspaces"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const workspace = await ctx.db.get(args.workspaceId);
    return workspace ? toApiRecord(workspace) : null;
  },
});

export const createWorkspace = mutation({
  args: {
    ...serviceArgs,
    slug: v.string(),
    name: v.string(),
    description: optionalNullableString,
    metadata: v.optional(metadataValidator),
    ownerId: optionalNullableUserId,
    ownerIdentity: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      slug: args.slug,
      name: args.name,
      ownerIdentity: args.ownerIdentity ?? args.slug,
      ownerId: toNullableField(args.ownerId),
      description: toNullableField(args.description),
      metadata: args.metadata ?? defaultMetadata,
      createdAt: now,
      updatedAt: now,
    });

    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error("Failed to create workspace");
    return toApiRecord(workspace);
  },
});

export const listProjects = query({
  args: {
    ...serviceArgs,
    workspaceId: v.optional(v.id("workspaces")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const workspaceId = args.workspaceId;
    const projects =
      workspaceId === undefined
        ? await ctx.db.query("projects").collect()
        : await ctx.db
            .query("projects")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .collect();

    return sortByCreatedAtDesc(projects).map(toApiRecord);
  },
});

export const getProjectById = query({
  args: {
    ...serviceArgs,
    projectId: v.id("projects"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const project = await ctx.db.get(args.projectId);
    return project ? toApiRecord(project) : null;
  },
});

export const getProjectByWorkspaceAndId = query({
  args: {
    ...serviceArgs,
    workspaceId: v.id("workspaces"),
    projectId: v.id("projects"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const project = await ctx.db.get(args.projectId);
    return project && project.workspaceId === args.workspaceId ? toApiRecord(project) : null;
  },
});

export const getProjectByWorkspaceAndSlug = query({
  args: {
    ...serviceArgs,
    workspaceId: v.id("workspaces"),
    slug: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const project = await ctx.db
      .query("projects")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("slug", args.slug),
      )
      .unique();

    return project ? toApiRecord(project) : null;
  },
});

export const createProject = mutation({
  args: {
    ...serviceArgs,
    workspaceId: v.id("workspaces"),
    slug: v.string(),
    name: v.string(),
    description: optionalNullableString,
    defaultBranch: v.string(),
    rootDirectory: optionalNullableString,
    metadata: v.optional(metadataValidator),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      workspaceId: args.workspaceId,
      slug: args.slug,
      name: args.name,
      description: toNullableField(args.description),
      defaultBranch: args.defaultBranch,
      rootDirectory: toNullableField(args.rootDirectory),
      metadata: args.metadata ?? defaultMetadata,
      createdAt: now,
      updatedAt: now,
    });

    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Failed to create project");
    return toApiRecord(project);
  },
});

export const listRepoConnections = query({
  args: {
    ...serviceArgs,
    workspaceId: v.optional(v.id("workspaces")),
    projectId: v.optional(v.id("projects")),
    provider: v.optional(repoProviderValidator),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const workspaceId = args.workspaceId;
    const repoConnections =
      workspaceId === undefined
        ? await ctx.db.query("repoConnections").collect()
        : await ctx.db
            .query("repoConnections")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .collect();

    return sortByCreatedAtDesc(
      repoConnections.filter(
        (repoConnection) =>
          (args.projectId === undefined || repoConnection.projectId === args.projectId) &&
          (args.provider === undefined || repoConnection.provider === args.provider),
      ),
    ).map(toApiRecord);
  },
});

export const getRepoConnectionById = query({
  args: {
    ...serviceArgs,
    repoConnectionId: v.id("repoConnections"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const repoConnection = await ctx.db.get(args.repoConnectionId);
    return repoConnection ? toApiRecord(repoConnection) : null;
  },
});

export const getRepoConnectionByWorkspaceAndId = query({
  args: {
    ...serviceArgs,
    workspaceId: v.id("workspaces"),
    repoConnectionId: v.id("repoConnections"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const repoConnection = await ctx.db.get(args.repoConnectionId);
    return repoConnection && repoConnection.workspaceId === args.workspaceId
      ? toApiRecord(repoConnection)
      : null;
  },
});

export const getGitHubAppRepoConnectionByRepository = query({
  args: {
    ...serviceArgs,
    owner: v.string(),
    repo: v.string(),
    installationId: v.number(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const repoConnections = await ctx.db
      .query("repoConnections")
      .withIndex("by_provider_owner_repo", (q) => q.eq("provider", "github"))
      .collect();
    const repoConnection = sortByCreatedAtDesc(repoConnections).find(
      (candidate) =>
        candidate.authType === "github_app_installation" &&
        candidate.owner.toLowerCase() === args.owner.toLowerCase() &&
        candidate.repo.toLowerCase() === args.repo.toLowerCase() &&
        getInstallationId(candidate.connectionMetadata) === args.installationId,
    );

    return repoConnection ? toApiRecord(repoConnection) : null;
  },
});

export const createRepoConnection = mutation({
  args: {
    ...serviceArgs,
    workspaceId: v.id("workspaces"),
    projectId: optionalNullableProjectId,
    provider: repoProviderValidator,
    owner: v.string(),
    repo: v.string(),
    defaultBranch: optionalNullableString,
    authType: repoAuthTypeValidator,
    connectionMetadata: v.optional(metadataValidator),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const now = Date.now();
    const repoConnectionId = await ctx.db.insert("repoConnections", {
      workspaceId: args.workspaceId,
      projectId: toNullableField(args.projectId),
      provider: args.provider,
      owner: args.owner,
      repo: args.repo,
      defaultBranch: toNullableField(args.defaultBranch),
      authType: args.authType,
      connectionMetadata: args.connectionMetadata ?? defaultMetadata,
      createdAt: now,
      updatedAt: now,
    });

    const repoConnection = await ctx.db.get(repoConnectionId);
    if (!repoConnection) throw new Error("Failed to create repo connection");
    return toApiRecord(repoConnection);
  },
});

export const updateRepoConnection = mutation({
  args: {
    ...serviceArgs,
    repoConnectionId: v.id("repoConnections"),
    projectId: optionalNullableProjectId,
    defaultBranch: optionalNullableString,
    authType: v.optional(repoAuthTypeValidator),
    connectionMetadata: v.optional(metadataValidator),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    await ctx.db.patch(args.repoConnectionId, {
      ...(args.projectId === undefined ? {} : { projectId: toNullableField(args.projectId) }),
      ...(args.defaultBranch === undefined
        ? {}
        : { defaultBranch: toNullableField(args.defaultBranch) }),
      ...(args.authType === undefined ? {} : { authType: args.authType }),
      ...(args.connectionMetadata === undefined
        ? {}
        : { connectionMetadata: args.connectionMetadata }),
      updatedAt: Date.now(),
    });

    const repoConnection = await ctx.db.get(args.repoConnectionId);
    return repoConnection ? toApiRecord(repoConnection) : null;
  },
});

export const deleteRepoConnection = mutation({
  args: {
    ...serviceArgs,
    repoConnectionId: v.id("repoConnections"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const repoConnection = await ctx.db.get(args.repoConnectionId);
    if (!repoConnection) return null;

    await ctx.db.delete(args.repoConnectionId);
    return toApiRecord(repoConnection);
  },
});

export const listAutomations = query({
  args: {
    ...serviceArgs,
    workspaceId: v.optional(v.id("workspaces")),
    projectId: v.optional(v.id("projects")),
    enabled: v.optional(v.boolean()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const workspaceId = args.workspaceId;
    const automations =
      workspaceId === undefined
        ? await ctx.db.query("automations").collect()
        : await ctx.db
            .query("automations")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .collect();

    return sortByCreatedAtDesc(
      automations.filter(
        (automation) =>
          (args.projectId === undefined || automation.projectId === args.projectId) &&
          (args.enabled === undefined || automation.enabled === args.enabled),
      ),
    ).map(toApiRecord);
  },
});

export const getAutomation = query({
  args: {
    ...serviceArgs,
    automationId: v.id("automations"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const automation = await ctx.db.get(args.automationId);
    return automation ? toApiRecord(automation) : null;
  },
});

export const getAutomationByWorkspaceAndId = query({
  args: {
    ...serviceArgs,
    workspaceId: v.id("workspaces"),
    automationId: v.id("automations"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const automation = await ctx.db.get(args.automationId);
    return automation && automation.workspaceId === args.workspaceId
      ? toApiRecord(automation)
      : null;
  },
});

export const createAutomation = mutation({
  args: {
    ...serviceArgs,
    workspaceId: v.id("workspaces"),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    repoConnectionId: v.optional(v.union(v.id("repoConnections"), v.null())),
    name: v.string(),
    enabled: v.optional(v.boolean()),
    cronExpression: v.string(),
    taskTemplateTitle: v.string(),
    taskTemplatePrompt: v.string(),
    sandboxSize: v.optional(sandboxSizeValidator),
    permissionMode: v.optional(permissionModeValidator),
    branchPrefix: optionalNullableString,
    policy: v.optional(executionPolicyValidator),
    config: v.optional(automationConfigValidator),
    metadata: v.optional(metadataValidator),
    lastRunAt: v.optional(v.union(v.number(), v.null())),
    nextRunAt: v.optional(v.union(v.number(), v.null())),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const timestamp = Date.now();
    const automationId = await ctx.db.insert("automations", {
      workspaceId: args.workspaceId,
      projectId: toNullableField(args.projectId),
      repoConnectionId: toNullableField(args.repoConnectionId),
      name: args.name,
      enabled: args.enabled ?? true,
      cronExpression: args.cronExpression,
      taskTemplateTitle: args.taskTemplateTitle,
      taskTemplatePrompt: args.taskTemplatePrompt,
      sandboxSize: args.sandboxSize ?? "medium",
      permissionMode: args.permissionMode ?? "safe",
      branchPrefix: toNullableField(args.branchPrefix),
      policy: args.policy ?? defaultPolicy,
      config: args.config ?? defaultExecutionConfig,
      metadata: args.metadata ?? defaultMetadata,
      lastRunAt: toNullableField(args.lastRunAt),
      nextRunAt: toNullableField(args.nextRunAt),
      createdAt: args.createdAt ?? timestamp,
      updatedAt: args.updatedAt ?? timestamp,
    });

    const automation = await ctx.db.get(automationId);
    if (!automation) {
      throw new Error("Failed to create automation");
    }

    return toApiRecord(automation);
  },
});

export const updateAutomation = mutation({
  args: {
    ...serviceArgs,
    automationId: v.id("automations"),
    workspaceId: v.optional(v.id("workspaces")),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    repoConnectionId: v.optional(v.union(v.id("repoConnections"), v.null())),
    name: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    cronExpression: v.optional(v.string()),
    taskTemplateTitle: v.optional(v.string()),
    taskTemplatePrompt: v.optional(v.string()),
    sandboxSize: v.optional(sandboxSizeValidator),
    permissionMode: v.optional(permissionModeValidator),
    branchPrefix: optionalNullableString,
    policy: v.optional(executionPolicyValidator),
    config: v.optional(automationConfigValidator),
    metadata: v.optional(metadataValidator),
    lastRunAt: v.optional(v.union(v.number(), v.null())),
    nextRunAt: v.optional(v.union(v.number(), v.null())),
    updatedAt: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const existing = await ctx.db.get(args.automationId);
    if (!existing) {
      throw new Error(`Failed to update automation ${args.automationId}`);
    }

    const patch: Record<string, unknown> = {};
    if (args.workspaceId !== undefined) patch.workspaceId = args.workspaceId;
    if (args.projectId !== undefined) patch.projectId = toNullableField(args.projectId);
    if (args.repoConnectionId !== undefined) {
      patch.repoConnectionId = toNullableField(args.repoConnectionId);
    }
    if (args.name !== undefined) patch.name = args.name;
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.cronExpression !== undefined) patch.cronExpression = args.cronExpression;
    if (args.taskTemplateTitle !== undefined) patch.taskTemplateTitle = args.taskTemplateTitle;
    if (args.taskTemplatePrompt !== undefined) patch.taskTemplatePrompt = args.taskTemplatePrompt;
    if (args.sandboxSize !== undefined) patch.sandboxSize = args.sandboxSize;
    if (args.permissionMode !== undefined) patch.permissionMode = args.permissionMode;
    if (args.branchPrefix !== undefined) patch.branchPrefix = toNullableField(args.branchPrefix);
    if (args.policy !== undefined) patch.policy = args.policy;
    if (args.config !== undefined) patch.config = args.config;
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    if (args.lastRunAt !== undefined) patch.lastRunAt = toNullableField(args.lastRunAt);
    if (args.nextRunAt !== undefined) patch.nextRunAt = toNullableField(args.nextRunAt);
    if (args.updatedAt !== undefined) patch.updatedAt = args.updatedAt;

    await ctx.db.patch(args.automationId, patch);
    const automation = await ctx.db.get(args.automationId);
    return toApiRecord(automation ?? existing);
  },
});

export const listTasks = query({
  args: {
    ...serviceArgs,
    workspaceId: v.optional(v.id("workspaces")),
    projectId: v.optional(v.id("projects")),
    status: v.optional(taskStatusValidator),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const workspaceId = args.workspaceId;
    const tasks =
      workspaceId === undefined
        ? await ctx.db.query("tasks").collect()
        : await ctx.db
            .query("tasks")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .collect();

    return sortByCreatedAtDesc(
      tasks.filter(
        (task) =>
          (args.projectId === undefined || task.projectId === args.projectId) &&
          (args.status === undefined || task.status === args.status),
      ),
    ).map(toApiRecord);
  },
});

export const getTask = query({
  args: {
    ...serviceArgs,
    taskId: v.id("tasks"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const task = await ctx.db.get(args.taskId);
    return task ? toApiRecord(task) : null;
  },
});

export const getTaskByGitHubDeliveryId = query({
  args: {
    ...serviceArgs,
    deliveryId: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const tasks = await ctx.db.query("tasks").withIndex("by_createdAt").order("desc").collect();
    const task = tasks.find(
      (candidate) => getGitHubDeliveryId(candidate.metadata) === args.deliveryId,
    );
    return task ? toApiRecord(task) : null;
  },
});

export const createTask = mutation({
  args: {
    ...serviceArgs,
    workspaceId: v.id("workspaces"),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    repoConnectionId: v.optional(v.union(v.id("repoConnections"), v.null())),
    automationId: v.optional(v.union(v.id("automations"), v.null())),
    threadId: v.optional(v.union(v.id("threads"), v.null())),
    title: v.string(),
    prompt: v.string(),
    status: v.optional(taskStatusValidator),
    sandboxSize: v.optional(sandboxSizeValidator),
    permissionMode: v.optional(permissionModeValidator),
    baseBranch: optionalNullableString,
    branchName: optionalNullableString,
    config: v.optional(executionConfigValidator),
    policy: v.optional(executionPolicyValidator),
    metadata: v.optional(metadataValidator),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const timestamp = Date.now();
    const taskId = await ctx.db.insert("tasks", {
      workspaceId: args.workspaceId,
      projectId: toNullableField(args.projectId),
      repoConnectionId: toNullableField(args.repoConnectionId),
      automationId: toNullableField(args.automationId),
      threadId: toNullableField(args.threadId),
      title: args.title,
      prompt: args.prompt,
      status: args.status ?? "pending",
      sandboxSize: args.sandboxSize ?? "medium",
      permissionMode: args.permissionMode ?? "safe",
      baseBranch: toNullableField(args.baseBranch),
      branchName: toNullableField(args.branchName),
      config: args.config ?? defaultExecutionConfig,
      policy: args.policy ?? defaultPolicy,
      metadata: args.metadata ?? defaultMetadata,
      createdAt: args.createdAt ?? timestamp,
      updatedAt: args.updatedAt ?? timestamp,
    });

    const task = await ctx.db.get(taskId);
    if (!task) {
      throw new Error("Failed to create task");
    }

    return toApiRecord(task);
  },
});

export const updateTask = mutation({
  args: {
    ...serviceArgs,
    taskId: v.id("tasks"),
    workspaceId: v.optional(v.id("workspaces")),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    repoConnectionId: v.optional(v.union(v.id("repoConnections"), v.null())),
    automationId: v.optional(v.union(v.id("automations"), v.null())),
    threadId: v.optional(v.union(v.id("threads"), v.null())),
    title: v.optional(v.string()),
    prompt: v.optional(v.string()),
    status: v.optional(taskStatusValidator),
    sandboxSize: v.optional(sandboxSizeValidator),
    permissionMode: v.optional(permissionModeValidator),
    baseBranch: optionalNullableString,
    branchName: optionalNullableString,
    config: v.optional(executionConfigValidator),
    policy: v.optional(executionPolicyValidator),
    metadata: v.optional(metadataValidator),
    updatedAt: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const existing = await ctx.db.get(args.taskId);
    if (!existing) {
      throw new Error(`Failed to update task ${args.taskId}`);
    }

    const patch: Record<string, unknown> = {};
    if (args.workspaceId !== undefined) patch.workspaceId = args.workspaceId;
    if (args.projectId !== undefined) patch.projectId = toNullableField(args.projectId);
    if (args.repoConnectionId !== undefined) {
      patch.repoConnectionId = toNullableField(args.repoConnectionId);
    }
    if (args.automationId !== undefined) patch.automationId = toNullableField(args.automationId);
    if (args.threadId !== undefined) patch.threadId = toNullableField(args.threadId);
    if (args.title !== undefined) patch.title = args.title;
    if (args.prompt !== undefined) patch.prompt = args.prompt;
    if (args.status !== undefined) patch.status = args.status;
    if (args.sandboxSize !== undefined) patch.sandboxSize = args.sandboxSize;
    if (args.permissionMode !== undefined) patch.permissionMode = args.permissionMode;
    if (args.baseBranch !== undefined) patch.baseBranch = toNullableField(args.baseBranch);
    if (args.branchName !== undefined) patch.branchName = toNullableField(args.branchName);
    if (args.config !== undefined) patch.config = args.config;
    if (args.policy !== undefined) patch.policy = args.policy;
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    if (args.updatedAt !== undefined) patch.updatedAt = args.updatedAt;

    await ctx.db.patch(args.taskId, patch);
    const task = await ctx.db.get(args.taskId);
    return toApiRecord(task ?? existing);
  },
});

export const deleteTask = mutation({
  args: {
    ...serviceArgs,
    taskId: v.id("tasks"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error(`Failed to delete task ${args.taskId}`);
    }

    await ctx.db.delete(args.taskId);
    return toApiRecord(task);
  },
});

export const getRun = query({
  args: {
    ...serviceArgs,
    runId: v.id("runs"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const run = await ctx.db.get(args.runId);
    return run ? toApiRecord(run) : null;
  },
});

export const getLatestRunForTask = query({
  args: {
    ...serviceArgs,
    taskId: v.id("tasks"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const run = sortByAttemptDesc(runs)[0];

    return run ? toApiRecord(run) : null;
  },
});

export const listRunsForTask = query({
  args: {
    ...serviceArgs,
    taskId: v.id("tasks"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    return sortByAttemptDesc(runs).map(toApiRecord);
  },
});

export const listRunEvents = query({
  args: {
    ...serviceArgs,
    runId: v.id("runs"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const events = await ctx.db
      .query("runEvents")
      .withIndex("by_run_sequence", (q) => q.eq("runId", args.runId))
      .collect();

    return events.map(toApiRecord);
  },
});

export const listRunLogEvents = query({
  args: {
    ...serviceArgs,
    runId: v.id("runs"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const logEventTypes = new Set(["run.log", "run.command.started", "run.command.finished"]);
    const events = await ctx.db
      .query("runEvents")
      .withIndex("by_run_sequence", (q) => q.eq("runId", args.runId))
      .collect();

    return events.filter((event) => logEventTypes.has(event.eventType)).map(toApiRecord);
  },
});

export const createRunRecord = mutation({
  args: {
    ...serviceArgs,
    taskId: v.id("tasks"),
    repoConnectionId: v.optional(v.union(v.id("repoConnections"), v.null())),
    prompt: v.string(),
    baseBranch: optionalNullableString,
    branchName: optionalNullableString,
    sandboxSize: sandboxSizeValidator,
    permissionMode: permissionModeValidator,
    policy: executionPolicyValidator,
    config: executionConfigValidator,
    metadata: metadataValidator,
    workspacePath: optionalNullableString,
    source: v.union(v.literal("api"), v.literal("retry")),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error(`Task ${args.taskId} was not found while creating run`);
    }

    const latestRuns = await ctx.db
      .query("runs")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    const latestRun = sortByAttemptDesc(latestRuns)[0];
    const attempt = latestRun === undefined ? 1 : latestRun.attempt + 1;
    const timestamp = Date.now();

    const runId = await ctx.db.insert("runs", {
      workspaceId: task.workspaceId,
      taskId: args.taskId,
      threadId: task.threadId,
      repoConnectionId: toNullableField(args.repoConnectionId),
      status: "queued",
      attempt,
      nextEventSequence: 2,
      prompt: args.prompt,
      baseBranch: toNullableField(args.baseBranch),
      branchName: toNullableField(args.branchName),
      sandboxSize: args.sandboxSize,
      permissionMode: args.permissionMode,
      policy: args.policy,
      config: args.config,
      metadata: args.metadata,
      workspacePath: toNullableField(args.workspacePath),
      createdAt: args.createdAt ?? timestamp,
      updatedAt: args.updatedAt ?? timestamp,
    });

    await ctx.db.patch(args.taskId, {
      status: "queued",
      updatedAt: timestamp,
    });

    await ctx.db.insert("runEvents", {
      runId,
      sequence: 1,
      eventType: "run.created",
      message: args.source === "retry" ? "Run queued via task retry" : "Run queued via API",
      payload: {
        attempt,
        source: args.source,
        taskId: args.taskId,
      },
      createdAt: timestamp,
    });

    const run = await ctx.db.get(runId);
    if (!run) {
      throw new Error("Failed to create run");
    }

    return toApiRecord(run);
  },
});

export const appendRunEvent = mutation({
  args: {
    ...serviceArgs,
    runId: v.id("runs"),
    eventType: v.string(),
    level: optionalNullableString,
    message: optionalNullableString,
    payload: v.optional(metadataValidator),
    createdAt: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error(`Failed to append run event for ${args.runId}`);
    }

    const sequence = run.nextEventSequence ?? 1;
    const eventId = await ctx.db.insert("runEvents", {
      runId: args.runId,
      sequence,
      eventType: args.eventType,
      level: toNullableField(args.level),
      message: toNullableField(args.message),
      payload: args.payload,
      createdAt: args.createdAt ?? Date.now(),
    });

    await ctx.db.patch(args.runId, {
      nextEventSequence: sequence + 1,
      updatedAt: Date.now(),
    });

    const event = await ctx.db.get(eventId);
    if (!event) {
      throw new Error(`Failed to append run event for ${args.runId}`);
    }

    return toApiRecord(event);
  },
});

export const updateRun = mutation({
  args: {
    ...serviceArgs,
    runId: v.id("runs"),
    workspaceId: v.optional(v.id("workspaces")),
    taskId: v.optional(v.id("tasks")),
    threadId: v.optional(v.union(v.id("threads"), v.null())),
    sandboxId: v.optional(v.union(v.id("sandboxes"), v.null())),
    providerKey: optionalNullableString,
    repoConnectionId: v.optional(v.union(v.id("repoConnections"), v.null())),
    status: v.optional(runStatusValidator),
    attempt: v.optional(v.number()),
    nextEventSequence: v.optional(v.number()),
    prompt: v.optional(v.string()),
    startedAt: v.optional(v.union(v.number(), v.null())),
    completedAt: v.optional(v.union(v.number(), v.null())),
    failedAt: v.optional(v.union(v.number(), v.null())),
    errorMessage: optionalNullableString,
    workspacePath: optionalNullableString,
    baseBranch: optionalNullableString,
    branchName: optionalNullableString,
    sandboxSize: v.optional(sandboxSizeValidator),
    permissionMode: v.optional(permissionModeValidator),
    config: v.optional(executionConfigValidator),
    policy: v.optional(executionPolicyValidator),
    metadata: v.optional(metadataValidator),
    updatedAt: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const existing = await ctx.db.get(args.runId);
    if (!existing) {
      throw new Error(`Failed to update run ${args.runId}`);
    }

    const patch: Record<string, unknown> = {};
    if (args.workspaceId !== undefined) patch.workspaceId = args.workspaceId;
    if (args.taskId !== undefined) patch.taskId = args.taskId;
    if (args.threadId !== undefined) patch.threadId = toNullableField(args.threadId);
    if (args.sandboxId !== undefined) patch.sandboxId = toNullableField(args.sandboxId);
    if (args.providerKey !== undefined) patch.providerKey = toNullableField(args.providerKey);
    if (args.repoConnectionId !== undefined) {
      patch.repoConnectionId = toNullableField(args.repoConnectionId);
    }
    if (args.status !== undefined) patch.status = args.status;
    if (args.attempt !== undefined) patch.attempt = args.attempt;
    if (args.nextEventSequence !== undefined) patch.nextEventSequence = args.nextEventSequence;
    if (args.prompt !== undefined) patch.prompt = args.prompt;
    if (args.startedAt !== undefined) patch.startedAt = toNullableField(args.startedAt);
    if (args.completedAt !== undefined) patch.completedAt = toNullableField(args.completedAt);
    if (args.failedAt !== undefined) patch.failedAt = toNullableField(args.failedAt);
    if (args.errorMessage !== undefined) patch.errorMessage = toNullableField(args.errorMessage);
    if (args.workspacePath !== undefined) patch.workspacePath = toNullableField(args.workspacePath);
    if (args.baseBranch !== undefined) patch.baseBranch = toNullableField(args.baseBranch);
    if (args.branchName !== undefined) patch.branchName = toNullableField(args.branchName);
    if (args.sandboxSize !== undefined) patch.sandboxSize = args.sandboxSize;
    if (args.permissionMode !== undefined) patch.permissionMode = args.permissionMode;
    if (args.config !== undefined) patch.config = args.config;
    if (args.policy !== undefined) patch.policy = args.policy;
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    if (args.updatedAt !== undefined) patch.updatedAt = args.updatedAt;

    await ctx.db.patch(args.runId, patch);
    const run = await ctx.db.get(args.runId);
    return toApiRecord(run ?? existing);
  },
});

export const listRunners = query({
  args: {
    ...serviceArgs,
    workspaceId: v.optional(v.id("workspaces")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const workspaceId = args.workspaceId;
    const runners =
      workspaceId === undefined
        ? await ctx.db.query("runners").collect()
        : await ctx.db
            .query("runners")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .collect();

    return sortByCreatedAtDesc(runners.filter((runner) => runner.revokedAt === undefined)).map(
      toApiRecord,
    );
  },
});

export const getRunner = query({
  args: {
    ...serviceArgs,
    runnerId: v.id("runners"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const runner = await ctx.db.get(args.runnerId);
    return runner ? toApiRecord(runner) : null;
  },
});

export const getRunnerByAuthKeyHash = query({
  args: {
    ...serviceArgs,
    authKeyHash: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const runner = await ctx.db
      .query("runners")
      .withIndex("by_authKeyHash", (q) => q.eq("authKeyHash", args.authKeyHash))
      .unique();

    return runner ? toApiRecord(runner) : null;
  },
});

export const updateRunner = mutation({
  args: {
    ...serviceArgs,
    runnerId: v.id("runners"),
    workspaceId: v.optional(v.id("workspaces")),
    name: v.optional(v.string()),
    authKeyHash: v.optional(v.string()),
    authKeyPrefix: v.optional(v.string()),
    lastSeenAt: v.optional(v.union(v.number(), v.null())),
    revokedAt: v.optional(v.union(v.number(), v.null())),
    createdByUserId: v.optional(v.union(v.id("users"), v.null())),
    updatedAt: v.optional(v.number()),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const existing = await ctx.db.get(args.runnerId);
    if (!existing) {
      return null;
    }

    const patch: Record<string, unknown> = {};
    if (args.workspaceId !== undefined) patch.workspaceId = args.workspaceId;
    if (args.name !== undefined) patch.name = args.name;
    if (args.authKeyHash !== undefined) patch.authKeyHash = args.authKeyHash;
    if (args.authKeyPrefix !== undefined) patch.authKeyPrefix = args.authKeyPrefix;
    if (args.lastSeenAt !== undefined) patch.lastSeenAt = toNullableField(args.lastSeenAt);
    if (args.revokedAt !== undefined) patch.revokedAt = toNullableField(args.revokedAt);
    if (args.createdByUserId !== undefined) {
      patch.createdByUserId = toNullableField(args.createdByUserId);
    }
    if (args.updatedAt !== undefined) patch.updatedAt = args.updatedAt;

    await ctx.db.patch(args.runnerId, patch);
    const runner = await ctx.db.get(args.runnerId);
    return runner ? toApiRecord(runner) : null;
  },
});

export const listRunnerRegistrationTokens = query({
  args: {
    ...serviceArgs,
    workspaceId: v.optional(v.id("workspaces")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const workspaceId = args.workspaceId;
    const registrationTokens =
      workspaceId === undefined
        ? await ctx.db.query("runnerRegistrationTokens").collect()
        : await ctx.db
            .query("runnerRegistrationTokens")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .collect();

    return sortByCreatedAtDesc(registrationTokens).map(toApiRecord);
  },
});

export const getRunnerRegistrationToken = query({
  args: {
    ...serviceArgs,
    registrationTokenId: v.id("runnerRegistrationTokens"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const registrationToken = await ctx.db.get(args.registrationTokenId);
    return registrationToken ? toApiRecord(registrationToken) : null;
  },
});

export const getActiveRunnerRegistrationTokenByHash = query({
  args: {
    ...serviceArgs,
    tokenHash: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const registrationToken = await ctx.db
      .query("runnerRegistrationTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();

    if (
      !registrationToken ||
      registrationToken.revokedAt !== undefined ||
      registrationToken.consumedAt !== undefined ||
      registrationToken.expiresAt <= Date.now()
    ) {
      return null;
    }

    return toApiRecord(registrationToken);
  },
});

export const createRunnerRegistrationToken = mutation({
  args: {
    ...serviceArgs,
    workspaceId: v.id("workspaces"),
    name: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.union(v.number(), v.null())),
    revokedAt: v.optional(v.union(v.number(), v.null())),
    createdByUserId: v.optional(v.union(v.id("users"), v.null())),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const timestamp = Date.now();
    const registrationTokenId = await ctx.db.insert("runnerRegistrationTokens", {
      workspaceId: args.workspaceId,
      name: args.name,
      tokenHash: args.tokenHash,
      tokenPrefix: args.tokenPrefix,
      expiresAt: args.expiresAt,
      consumedAt: toNullableField(args.consumedAt),
      revokedAt: toNullableField(args.revokedAt),
      createdByUserId: toNullableField(args.createdByUserId),
      createdAt: args.createdAt ?? timestamp,
      updatedAt: args.updatedAt ?? timestamp,
    });

    const registrationToken = await ctx.db.get(registrationTokenId);
    if (!registrationToken) {
      throw new Error("Failed to create runner registration token");
    }

    return toApiRecord(registrationToken);
  },
});

export const updateRunnerRegistrationToken = mutation({
  args: {
    ...serviceArgs,
    registrationTokenId: v.id("runnerRegistrationTokens"),
    workspaceId: v.optional(v.id("workspaces")),
    name: v.optional(v.string()),
    tokenHash: v.optional(v.string()),
    tokenPrefix: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    consumedAt: v.optional(v.union(v.number(), v.null())),
    revokedAt: v.optional(v.union(v.number(), v.null())),
    createdByUserId: v.optional(v.union(v.id("users"), v.null())),
    updatedAt: v.optional(v.number()),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const existing = await ctx.db.get(args.registrationTokenId);
    if (!existing) {
      return null;
    }

    const patch: Record<string, unknown> = {};
    if (args.workspaceId !== undefined) patch.workspaceId = args.workspaceId;
    if (args.name !== undefined) patch.name = args.name;
    if (args.tokenHash !== undefined) patch.tokenHash = args.tokenHash;
    if (args.tokenPrefix !== undefined) patch.tokenPrefix = args.tokenPrefix;
    if (args.expiresAt !== undefined) patch.expiresAt = args.expiresAt;
    if (args.consumedAt !== undefined) patch.consumedAt = toNullableField(args.consumedAt);
    if (args.revokedAt !== undefined) patch.revokedAt = toNullableField(args.revokedAt);
    if (args.createdByUserId !== undefined) {
      patch.createdByUserId = toNullableField(args.createdByUserId);
    }
    if (args.updatedAt !== undefined) patch.updatedAt = args.updatedAt;

    await ctx.db.patch(args.registrationTokenId, patch);
    const registrationToken = await ctx.db.get(args.registrationTokenId);
    return registrationToken ? toApiRecord(registrationToken) : null;
  },
});

export const registerRunnerWithToken = mutation({
  args: {
    ...serviceArgs,
    tokenHash: v.string(),
    authKeyHash: v.string(),
    authKeyPrefix: v.string(),
    lastSeenAt: v.optional(v.number()),
  },
  returns: v.object({
    status: v.union(v.literal("registered"), v.literal("invalid"), v.literal("already_used")),
    runner: v.union(v.any(), v.null()),
    registrationToken: v.union(v.any(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const registrationToken = await ctx.db
      .query("runnerRegistrationTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    const timestamp = Date.now();

    if (
      !registrationToken ||
      registrationToken.revokedAt !== undefined ||
      registrationToken.expiresAt <= timestamp
    ) {
      return {
        status: "invalid" as const,
        runner: null,
        registrationToken: registrationToken ? toApiRecord(registrationToken) : null,
      };
    }

    if (registrationToken.consumedAt !== undefined) {
      return {
        status: "already_used" as const,
        runner: null,
        registrationToken: toApiRecord(registrationToken),
      };
    }

    await ctx.db.patch(registrationToken._id, {
      consumedAt: timestamp,
      updatedAt: timestamp,
    });

    const runnerId = await ctx.db.insert("runners", {
      workspaceId: registrationToken.workspaceId,
      name: registrationToken.name,
      authKeyHash: args.authKeyHash,
      authKeyPrefix: args.authKeyPrefix,
      createdByUserId: registrationToken.createdByUserId,
      lastSeenAt: args.lastSeenAt ?? timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const runner = await ctx.db.get(runnerId);
    const consumedToken = await ctx.db.get(registrationToken._id);
    if (!runner || !consumedToken) {
      throw new Error("Failed to create runner");
    }

    return {
      status: "registered" as const,
      runner: toApiRecord(runner),
      registrationToken: toApiRecord(consumedToken),
    };
  },
});

export const hasWorkspaceForUser = query({
  args: {
    ...serviceArgs,
    userId: v.id("users"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.userId))
      .first();

    return workspace !== null;
  },
});

export const listRunEventsAfter = query({
  args: {
    ...serviceArgs,
    runId: v.id("runs"),
    afterSequence: v.number(),
    limit: v.number(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const events = await ctx.db
      .query("runEvents")
      .withIndex("by_run_sequence", (q) =>
        q.eq("runId", args.runId).gt("sequence", args.afterSequence),
      )
      .take(args.limit);

    return events.map(toApiRecord);
  },
});

export const claimNextQueuedRun = mutation({
  args: {
    ...serviceArgs,
    workerId: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const queuedRuns = await ctx.db
      .query("runs")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "queued"))
      .take(20);
    const candidate = queuedRuns.sort((left, right) => left.createdAt - right.createdAt)[0];
    if (!candidate) return null;

    const timestamp = Date.now();
    const existingMetadata = candidate.metadata ?? {};
    const existingDispatch = (candidate.metadata as any)?.dispatch ?? {};
    const metadata = {
      ...existingMetadata,
      dispatch: {
        ...existingDispatch,
        claimedAt: new Date(timestamp).toISOString(),
        claimedBy: args.workerId,
        state: "claimed",
      },
    };

    await ctx.db.patch(candidate._id, {
      status: "provisioning",
      startedAt: candidate.startedAt ?? timestamp,
      metadata,
      updatedAt: timestamp,
    });
    await ctx.db.patch(candidate.taskId, {
      status: "running",
      updatedAt: timestamp,
    });

    const sequence = candidate.nextEventSequence ?? 1;
    await ctx.db.insert("runEvents", {
      runId: candidate._id,
      sequence,
      eventType: "run.status_changed",
      level: "info",
      message: "Run claimed by worker and marked provisioning",
      payload: {
        claimedAt: new Date(timestamp).toISOString(),
        previousStatus: "queued",
        status: "provisioning",
        workerId: args.workerId,
      },
      createdAt: timestamp,
    });
    await ctx.db.patch(candidate._id, { nextEventSequence: sequence + 1 });

    const run = await ctx.db.get(candidate._id);
    return run ? toApiRecord(run) : null;
  },
});

export const markRunDispatchAccepted = mutation({
  args: {
    ...serviceArgs,
    endpoint: v.string(),
    responseStatus: v.number(),
    runId: v.id("runs"),
    workerId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error(`Run ${args.runId} no longer exists`);

    const timestamp = Date.now();
    const existingMetadata = run.metadata ?? {};
    const existingDispatch = (run.metadata as any)?.dispatch ?? {};
    await ctx.db.patch(args.runId, {
      metadata: {
        ...existingMetadata,
        dispatch: {
          ...existingDispatch,
          dispatchedAt: new Date(timestamp).toISOString(),
          endpoint: args.endpoint,
          responseStatus: args.responseStatus,
          state: "dispatched",
          workerId: args.workerId,
        },
      },
      updatedAt: timestamp,
    });

    await ctx.db.insert("runEvents", {
      runId: args.runId,
      sequence: run.nextEventSequence ?? 1,
      eventType: "run.log",
      level: "info",
      message: "Run dispatch accepted by runner",
      payload: {
        dispatchedAt: new Date(timestamp).toISOString(),
        endpoint: args.endpoint,
        responseStatus: args.responseStatus,
        workerId: args.workerId,
      },
      createdAt: timestamp,
    });
    await ctx.db.patch(args.runId, { nextEventSequence: (run.nextEventSequence ?? 1) + 1 });
    return true;
  },
});

export const markRunDispatchFailed = mutation({
  args: {
    ...serviceArgs,
    errorMessage: v.string(),
    runId: v.id("runs"),
    workerId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error(`Run ${args.runId} no longer exists`);

    const timestamp = Date.now();
    const failedAt = new Date(timestamp).toISOString();
    const existingMetadata = run.metadata ?? {};
    const existingDispatch = (run.metadata as any)?.dispatch ?? {};
    await ctx.db.patch(args.runId, {
      status: "failed",
      errorMessage: args.errorMessage,
      failedAt: timestamp,
      metadata: {
        ...existingMetadata,
        dispatch: {
          ...existingDispatch,
          failedAt,
          failureReason: args.errorMessage,
          state: "dispatch_failed",
          workerId: args.workerId,
        },
      },
      updatedAt: timestamp,
    });
    await ctx.db.patch(run.taskId, {
      status: "failed",
      updatedAt: timestamp,
    });

    let sequence = run.nextEventSequence ?? 1;
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      sequence,
      eventType: "run.status_changed",
      level: "error",
      message: "Run failed before execution because dispatch to runner failed",
      payload: {
        failedAt,
        previousStatus: run.status,
        reason: args.errorMessage,
        status: "failed",
        workerId: args.workerId,
      },
      createdAt: timestamp,
    });
    sequence += 1;
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      sequence,
      eventType: "run.failed",
      level: "error",
      message: args.errorMessage,
      payload: {
        failedAt,
        phase: "dispatch",
        workerId: args.workerId,
      },
      createdAt: timestamp,
    });
    await ctx.db.patch(args.runId, { nextEventSequence: sequence + 1 });
    return true;
  },
});

export const getDueAutomationCandidate = query({
  args: {
    ...serviceArgs,
    now: v.number(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const automations = await ctx.db
      .query("automations")
      .filter((q) => q.eq(q.field("enabled"), true))
      .collect();
    const candidate = automations
      .filter(
        (automation) => automation.nextRunAt === undefined || automation.nextRunAt <= args.now,
      )
      .sort(
        (left, right) =>
          (left.nextRunAt ?? 0) - (right.nextRunAt ?? 0) || left.createdAt - right.createdAt,
      )[0];
    if (!candidate) return null;

    const project = candidate.projectId ? await ctx.db.get(candidate.projectId) : null;
    const repoConnection = candidate.repoConnectionId
      ? await ctx.db.get(candidate.repoConnectionId)
      : null;
    return {
      ...toApiRecord(candidate),
      project: project ? toApiRecord(project) : null,
      repoConnection: repoConnection ? toApiRecord(repoConnection) : null,
    };
  },
});

export const claimAutomationAndCreateRun = mutation({
  args: {
    ...serviceArgs,
    automationId: v.id("automations"),
    expectedNextRunAt: v.optional(v.union(v.number(), v.null())),
    nextRunAt: v.number(),
    workerId: v.string(),
    taskMetadata: metadataValidator,
    branchName: optionalNullableString,
    now: v.number(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const automation = await ctx.db.get(args.automationId);
    if (!automation || !automation.enabled) return null;
    if ((automation.nextRunAt ?? null) !== (args.expectedNextRunAt ?? null)) return null;

    await ctx.db.patch(args.automationId, {
      lastRunAt: automation.nextRunAt === undefined ? automation.lastRunAt : args.now,
      nextRunAt: args.nextRunAt,
      updatedAt: args.now,
    });

    if (automation.nextRunAt === undefined) {
      const initialized = await ctx.db.get(args.automationId);
      return initialized
        ? { kind: "initialized", automation: toApiRecord(initialized), run: null, task: null }
        : null;
    }

    const project = automation.projectId ? await ctx.db.get(automation.projectId) : null;
    const repoConnection = automation.repoConnectionId
      ? await ctx.db.get(automation.repoConnectionId)
      : null;
    const taskAutomationId = automation.projectId === undefined ? undefined : automation._id;
    const taskId = await ctx.db.insert("tasks", {
      workspaceId: automation.workspaceId,
      projectId: automation.projectId,
      repoConnectionId: automation.repoConnectionId,
      automationId: taskAutomationId,
      title: automation.taskTemplateTitle,
      prompt: automation.taskTemplatePrompt,
      status: "queued",
      sandboxSize: automation.sandboxSize,
      permissionMode: automation.permissionMode,
      baseBranch: repoConnection?.defaultBranch ?? project?.defaultBranch,
      branchName: toNullableField(args.branchName),
      policy: automation.policy,
      config: automation.config,
      metadata: args.taskMetadata,
      createdAt: args.now,
      updatedAt: args.now,
    });
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error(`Failed to create task for automation ${args.automationId}`);

    const runId = await ctx.db.insert("runs", {
      workspaceId: automation.workspaceId,
      taskId,
      repoConnectionId: task.repoConnectionId,
      status: "queued",
      attempt: 1,
      nextEventSequence: 3,
      prompt: task.prompt,
      baseBranch: task.baseBranch,
      branchName: task.branchName,
      sandboxSize: task.sandboxSize,
      permissionMode: task.permissionMode,
      policy: task.policy,
      config: task.config,
      metadata: task.metadata,
      createdAt: args.now,
      updatedAt: args.now,
    });
    const run = await ctx.db.get(runId);
    if (!run) throw new Error(`Failed to create run for automation ${args.automationId}`);

    await ctx.db.insert("runEvents", {
      runId,
      sequence: 1,
      eventType: "run.created",
      message: "Run queued via automation",
      payload: {
        attempt: run.attempt,
        automationId: automation._id,
        source: "automation",
        taskId,
      },
      createdAt: args.now,
    });
    await ctx.db.insert("runEvents", {
      runId,
      sequence: 2,
      eventType: "automation.triggered",
      level: "info",
      message: `Automation "${automation.name}" triggered a task and run`,
      payload: {
        automationId: automation._id,
        nextRunAt: new Date(args.nextRunAt).toISOString(),
        taskId,
        triggeredAt: new Date(args.now).toISOString(),
        workerId: args.workerId,
      },
      createdAt: args.now,
    });

    const updatedAutomation = await ctx.db.get(args.automationId);
    return {
      kind: "triggered",
      automation: updatedAutomation ? toApiRecord(updatedAutomation) : null,
      run: toApiRecord(run),
      task: toApiRecord(task),
    };
  },
});

export const getRunTarget = query({
  args: {
    ...serviceArgs,
    runId: v.id("runs"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);

    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const task = await ctx.db.get(run.taskId);
    if (!task) return null;
    const workspace = await ctx.db.get(task.workspaceId);
    if (!workspace) return null;
    const project = task.projectId ? await ctx.db.get(task.projectId) : null;
    const repoConnection = run.repoConnectionId
      ? await ctx.db.get(run.repoConnectionId)
      : task.repoConnectionId
        ? await ctx.db.get(task.repoConnectionId)
        : null;

    return {
      run: toApiRecord(run),
      task: toApiRecord(task),
      workspace: toApiRecord(workspace),
      project: project ? toApiRecord(project) : null,
      repoConnection: repoConnection ? toApiRecord(repoConnection) : null,
    };
  },
});
