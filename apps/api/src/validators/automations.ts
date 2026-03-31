import { z } from "zod";

import {
  automationConfigSchema,
  automationIdParamsSchema,
  executionPolicySchema,
  metadataSchema,
  optionalNullableTextSchema,
  permissionModeSchema,
  requiredTextSchema,
  sandboxSizeSchema,
  uuidSchema,
} from "./common";

export { automationIdParamsSchema };

const enabledQuerySchema = z.enum(["true", "false"]).transform((value) => value === "true");

export const automationListQuerySchema = z
  .object({
    workspaceId: uuidSchema.optional(),
    projectId: uuidSchema.optional(),
    enabled: enabledQuerySchema.optional(),
  })
  .strict();

export const createAutomationSchema = z
  .object({
    workspaceId: uuidSchema,
    projectId: z.union([uuidSchema, z.null()]).default(null),
    repoConnectionId: z.union([uuidSchema, z.null()]).default(null),
    name: requiredTextSchema,
    enabled: z.boolean().default(true),
    cronExpression: requiredTextSchema,
    taskTemplateTitle: requiredTextSchema,
    taskTemplatePrompt: requiredTextSchema,
    sandboxSize: sandboxSizeSchema.default("medium"),
    permissionMode: permissionModeSchema.default("safe"),
    branchPrefix: optionalNullableTextSchema,
    policy: executionPolicySchema.default({}),
    config: automationConfigSchema.default({
      commands: [],
      agentProvider: "none",
    }),
    metadata: metadataSchema,
  })
  .strict()
  .superRefine((value, issue) => {
    if (value.repoConnectionId !== null && value.projectId === null) {
      issue.addIssue({
        code: "custom",
        message: "projectId is required when repoConnectionId is provided",
        path: ["projectId"],
      });
    }
  });

export const updateAutomationSchema = z
  .object({
    projectId: z.union([uuidSchema, z.null()]).optional(),
    repoConnectionId: z.union([uuidSchema, z.null()]).optional(),
    name: requiredTextSchema.optional(),
    enabled: z.boolean().optional(),
    cronExpression: requiredTextSchema.optional(),
    taskTemplateTitle: requiredTextSchema.optional(),
    taskTemplatePrompt: requiredTextSchema.optional(),
    sandboxSize: sandboxSizeSchema.optional(),
    permissionMode: permissionModeSchema.optional(),
    branchPrefix: optionalNullableTextSchema,
    policy: executionPolicySchema.optional(),
    config: automationConfigSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
