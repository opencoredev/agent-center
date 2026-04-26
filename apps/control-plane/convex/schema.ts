import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  AGENT_PROVIDERS,
  CREDENTIAL_PROVIDERS,
  CREDENTIAL_SOURCES,
  MESSAGE_ROLES,
  PERMISSION_MODES,
  REPO_AUTH_TYPES,
  REPO_PROVIDERS,
  RUNTIME_PROVIDER_KINDS,
  RUN_STATUSES,
  SANDBOX_SIZES,
  SANDBOX_STATUSES,
  TASK_STATUSES,
} from "./constants";
import {
  automationConfigValidator,
  executionConfigValidator,
  executionPolicyValidator,
} from "./lib";

const schema = defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    authProvider: v.string(),
    authProviderId: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_authProvider_and_authProviderId", ["authProvider", "authProviderId"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  apiKeys: defineTable({
    name: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    userId: v.optional(v.id("users")),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.optional(v.number()),
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_user", ["userId"]),

  credentials: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    userId: v.optional(v.string()),
    provider: v.union(...CREDENTIAL_PROVIDERS.map((value) => v.literal(value))),
    source: v.union(...CREDENTIAL_SOURCES.map((value) => v.literal(value))),
    secretRef: v.optional(v.string()),
    encryptedValue: v.optional(v.string()),
    encryptedApiKey: v.optional(v.string()),
    encryptedAccessToken: v.optional(v.string()),
    encryptedRefreshToken: v.optional(v.string()),
    profileEmail: v.optional(v.string()),
    profileName: v.optional(v.string()),
    subscriptionType: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace_provider", ["workspaceId", "provider"])
    .index("by_user_provider", ["userId", "provider"]),

  workspaces: defineTable({
    ownerId: v.optional(v.id("users")),
    slug: v.string(),
    name: v.string(),
    ownerIdentity: v.optional(v.string()),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_ownerIdentity", ["ownerIdentity"])
    .index("by_ownerId", ["ownerId"]),

  projects: defineTable({
    workspaceId: v.id("workspaces"),
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    defaultBranch: v.string(),
    rootDirectory: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace_slug", ["workspaceId", "slug"])
    .index("by_workspace", ["workspaceId"]),

  repoConnections: defineTable({
    workspaceId: v.id("workspaces"),
    projectId: v.optional(v.id("projects")),
    provider: v.union(...REPO_PROVIDERS.map((value) => v.literal(value))),
    owner: v.string(),
    repo: v.string(),
    defaultBranch: v.optional(v.string()),
    authType: v.union(...REPO_AUTH_TYPES.map((value) => v.literal(value))),
    connectionMetadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_project", ["projectId"])
    .index("by_workspace_provider_owner_repo", ["workspaceId", "provider", "owner", "repo"])
    .index("by_provider_owner_repo", ["provider", "owner", "repo"]),

  runtimeProviders: defineTable({
    key: v.string(),
    kind: v.union(...RUNTIME_PROVIDER_KINDS.map((value) => v.literal(value))),
    name: v.string(),
    description: v.optional(v.string()),
    supportedSandboxSizes: v.array(v.union(...SANDBOX_SIZES.map((value) => v.literal(value)))),
    supportedAgentProviders: v.array(v.union(...AGENT_PROVIDERS.map((value) => v.literal(value)))),
    capabilities: v.optional(v.any()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_kind", ["kind"])
    .index("by_key", ["key"]),

  sandboxes: defineTable({
    workspaceId: v.id("workspaces"),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    runId: v.optional(v.id("runs")),
    providerKey: v.string(),
    runtimeKind: v.union(...RUNTIME_PROVIDER_KINDS.map((value) => v.literal(value))),
    status: v.union(...SANDBOX_STATUSES.map((value) => v.literal(value))),
    leaseToken: v.optional(v.string()),
    endpoint: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  tasks: defineTable({
    workspaceId: v.id("workspaces"),
    projectId: v.optional(v.id("projects")),
    repoConnectionId: v.optional(v.id("repoConnections")),
    automationId: v.optional(v.id("automations")),
    threadId: v.optional(v.id("threads")),
    title: v.string(),
    prompt: v.string(),
    status: v.union(...TASK_STATUSES.map((value) => v.literal(value))),
    sandboxSize: v.union(...SANDBOX_SIZES.map((value) => v.literal(value))),
    permissionMode: v.union(...PERMISSION_MODES.map((value) => v.literal(value))),
    baseBranch: v.optional(v.string()),
    branchName: v.optional(v.string()),
    config: executionConfigValidator,
    policy: v.optional(executionPolicyValidator),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_thread", ["threadId"])
    .index("by_status", ["status"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_project_and_status", ["projectId", "status"])
    .index("by_repoConnection", ["repoConnectionId"])
    .index("by_automation", ["automationId"])
    .index("by_createdAt", ["createdAt"]),

  automations: defineTable({
    workspaceId: v.id("workspaces"),
    projectId: v.optional(v.id("projects")),
    repoConnectionId: v.optional(v.id("repoConnections")),
    name: v.string(),
    enabled: v.boolean(),
    cronExpression: v.string(),
    taskTemplateTitle: v.string(),
    taskTemplatePrompt: v.string(),
    sandboxSize: v.union(...SANDBOX_SIZES.map((value) => v.literal(value))),
    permissionMode: v.union(...PERMISSION_MODES.map((value) => v.literal(value))),
    branchPrefix: v.optional(v.string()),
    policy: executionPolicyValidator,
    config: automationConfigValidator,
    metadata: v.optional(v.any()),
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_project", ["projectId"])
    .index("by_repoConnection", ["repoConnectionId"])
    .index("by_enabled_and_nextRunAt", ["enabled", "nextRunAt"])
    .index("by_workspace_and_name", ["workspaceId", "name"]),

  threads: defineTable({
    workspaceId: v.id("workspaces"),
    taskId: v.optional(v.id("tasks")),
    runId: v.optional(v.id("runs")),
    title: v.string(),
    status: v.literal("open"),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_run", ["runId"]),

  messages: defineTable({
    threadId: v.id("threads"),
    runId: v.optional(v.id("runs")),
    role: v.union(...MESSAGE_ROLES.map((value) => v.literal(value))),
    content: v.string(),
    parts: v.optional(v.any()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_run", ["runId"]),

  attachments: defineTable({
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
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_task", ["taskId"])
    .index("by_thread", ["threadId"])
    .index("by_run", ["runId"]),

  runs: defineTable({
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    threadId: v.optional(v.id("threads")),
    sandboxId: v.optional(v.id("sandboxes")),
    providerKey: v.optional(v.string()),
    repoConnectionId: v.optional(v.id("repoConnections")),
    status: v.union(...RUN_STATUSES.map((value) => v.literal(value))),
    attempt: v.number(),
    nextEventSequence: v.number(),
    prompt: v.string(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    workspacePath: v.optional(v.string()),
    baseBranch: v.optional(v.string()),
    branchName: v.optional(v.string()),
    sandboxSize: v.union(...SANDBOX_SIZES.map((value) => v.literal(value))),
    permissionMode: v.union(...PERMISSION_MODES.map((value) => v.literal(value))),
    config: executionConfigValidator,
    policy: v.optional(executionPolicyValidator),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_thread", ["threadId"])
    .index("by_status", ["status"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_repoConnection", ["repoConnectionId"])
    .index("by_createdAt", ["createdAt"]),

  runEvents: defineTable({
    runId: v.id("runs"),
    sequence: v.number(),
    eventType: v.string(),
    level: v.optional(v.string()),
    message: v.optional(v.string()),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_sequence", ["runId", "sequence"])
    .index("by_run_and_createdAt", ["runId", "createdAt"])
    .index("by_eventType", ["eventType"]),

  runnerRegistrationTokens: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_tokenHash", ["tokenHash"]),

  runners: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    authKeyHash: v.string(),
    authKeyPrefix: v.string(),
    lastSeenAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_authKeyHash", ["authKeyHash"]),
});

export default schema;
