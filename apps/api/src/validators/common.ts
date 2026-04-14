import {
  AGENT_PROVIDERS,
  PERMISSION_MODES,
  REPO_PROVIDERS,
  RUNTIME_PROVIDERS,
  RUNTIME_TARGETS,
  RUN_STATUSES,
  SANDBOX_IDLE_POLICIES,
  SANDBOX_PROFILES,
  SANDBOX_SIZES,
  TASK_STATUSES,
} from "@agent-center/shared";
import { z } from "zod";

export const uuidSchema = z.uuid();
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must use lowercase letters, numbers, and hyphens only");
export const requiredTextSchema = z.string().trim().min(1);
export const nullableTextSchema = z.union([requiredTextSchema, z.null()]).default(null);
export const optionalNullableTextSchema = z.union([requiredTextSchema, z.null()]).optional();
export const metadataSchema = z.record(z.string(), z.unknown()).default({});
export const sandboxSizeSchema = z.enum(SANDBOX_SIZES);
export const permissionModeSchema = z.enum(PERMISSION_MODES);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const runStatusSchema = z.enum(RUN_STATUSES);
export const repoProviderSchema = z.enum(REPO_PROVIDERS);
export const emptyBodySchema = z.object({}).strict();

export const executionCommandSchema = z
  .object({
    command: requiredTextSchema,
    cwd: requiredTextSchema.optional(),
    env: z.record(z.string(), z.string()).optional(),
    timeoutSeconds: z.coerce.number().int().positive().optional(),
  })
  .strict();

export const executionPolicySchema = z
  .object({
    customPermissions: z.array(requiredTextSchema).optional(),
    writablePaths: z.array(requiredTextSchema).optional(),
    blockedCommands: z.array(requiredTextSchema).optional(),
  })
  .strict();

export const executionRuntimeSchema = z
  .object({
    target: z.enum(RUNTIME_TARGETS),
    provider: z.enum(RUNTIME_PROVIDERS),
    sandboxProfile: z.enum(SANDBOX_PROFILES),
    idlePolicy: z.enum(SANDBOX_IDLE_POLICIES).optional(),
    resumeOnActivity: z.boolean().optional(),
    ttlSeconds: z.coerce.number().int().positive().optional(),
  })
  .strict();

export const executionConfigSchema = z
  .object({
    commands: z.array(executionCommandSchema).default([]),
    agentProvider: z.enum(AGENT_PROVIDERS).default("none"),
    agentModel: requiredTextSchema.optional(),
    agentReasoningEffort: z
      .enum(["low", "medium", "high", "xhigh", "max", "ultrathink"])
      .optional(),
    agentThinkingEnabled: z.boolean().optional(),
    agentPrompt: requiredTextSchema.optional(),
    runtime: executionRuntimeSchema.optional(),
    workingDirectory: requiredTextSchema.optional(),
    commitMessage: requiredTextSchema.optional(),
    prTitle: requiredTextSchema.optional(),
    prBody: requiredTextSchema.optional(),
  })
  .strict();

export const automationConfigSchema = executionConfigSchema
  .extend({
    branchPattern: requiredTextSchema.optional(),
    targetBranchFormat: requiredTextSchema.optional(),
  })
  .strict();

export const workspaceIdParamsSchema = z.object({
  workspaceId: uuidSchema,
});

export const projectIdParamsSchema = z.object({
  projectId: uuidSchema,
});

export const repoConnectionIdParamsSchema = z.object({
  repoConnectionId: uuidSchema,
});

export const taskIdParamsSchema = z.object({
  taskId: uuidSchema,
});

export const runIdParamsSchema = z.object({
  runId: uuidSchema,
});

export const automationIdParamsSchema = z.object({
  automationId: uuidSchema,
});
