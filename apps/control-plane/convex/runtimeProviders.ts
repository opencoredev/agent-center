import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { AGENT_PROVIDERS, SANDBOX_SIZES } from "./constants";
import { metadataValidator, now } from "./lib";

const DEFAULT_RUNTIME_PROVIDERS = [
  {
    key: "legacy_local",
    kind: "lightweight" as const,
    name: "Local Bash",
    description: "Cheap shell execution on a host-managed runner.",
    supportedSandboxSizes: ["small", "medium"],
    supportedAgentProviders: ["none", "claude", "codex", "opencode", "cursor"],
    capabilities: {
      persistentFs: false,
      sleepResume: false,
      gitClone: true,
      networkAccess: true,
    },
  },
  {
    key: "convex_bash",
    kind: "lightweight" as const,
    name: "Convex Bash",
    description: "Low-cost lightweight runtime for quick tasks and follow-ups.",
    supportedSandboxSizes: ["small", "medium"],
    supportedAgentProviders: ["claude", "codex", "opencode", "cursor"],
    capabilities: {
      persistentFs: true,
      sleepResume: true,
      gitClone: true,
      networkAccess: true,
    },
  },
  {
    key: "agent_os",
    kind: "full_sandbox" as const,
    name: "AgentOS Full Sandbox",
    description: "Ephemeral full sandbox with mountable workspace and idle resume support.",
    supportedSandboxSizes: ["small", "medium", "large"],
    supportedAgentProviders: ["claude", "codex", "opencode", "cursor"],
    capabilities: {
      persistentFs: true,
      sleepResume: true,
      gitClone: true,
      networkAccess: true,
    },
  },
  {
    key: "self_hosted_runner",
    kind: "self_hosted" as const,
    name: "Self-hosted Connector",
    description: "Customer-owned execution backend with the same control-plane contract.",
    supportedSandboxSizes: ["small", "medium", "large"],
    supportedAgentProviders: ["none", "claude", "codex", "opencode", "cursor"],
    capabilities: {
      persistentFs: true,
      sleepResume: true,
      gitClone: true,
      networkAccess: true,
      customerOwned: true,
    },
  },
] as const;

export const list = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const configured = await ctx.db.query("runtimeProviders").collect();

    if (configured.length > 0) {
      return configured;
    }

    const timestamp = now();
    return DEFAULT_RUNTIME_PROVIDERS.map((provider) => ({
      ...provider,
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: undefined,
    }));
  },
});

export const upsert = mutation({
  args: {
    key: v.string(),
    kind: v.union(v.literal("lightweight"), v.literal("full_sandbox"), v.literal("self_hosted")),
    name: v.string(),
    description: v.optional(v.string()),
    supportedSandboxSizes: v.array(v.union(...SANDBOX_SIZES.map((value) => v.literal(value)))),
    supportedAgentProviders: v.array(v.union(...AGENT_PROVIDERS.map((value) => v.literal(value)))),
    capabilities: v.optional(v.any()),
    metadata: v.optional(metadataValidator),
  },
  returns: v.id("runtimeProviders"),
  handler: async (ctx, args) => {
    const timestamp = now();
    const existing = await ctx.db
      .query("runtimeProviders")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    const values = {
      key: args.key,
      kind: args.kind,
      name: args.name,
      description: args.description,
      supportedSandboxSizes: args.supportedSandboxSizes,
      supportedAgentProviders: args.supportedAgentProviders,
      capabilities: args.capabilities,
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

    return await ctx.db.insert("runtimeProviders", values);
  },
});
