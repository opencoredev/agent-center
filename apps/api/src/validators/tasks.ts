import { z } from "zod";

import {
  executionConfigSchema,
  executionPolicySchema,
  optionalNullableTextSchema,
  permissionModeSchema,
  sandboxSizeSchema,
  taskIdParamsSchema,
  taskStatusSchema,
  requiredTextSchema,
  uuidSchema,
  metadataSchema,
} from "./common";

export { taskIdParamsSchema };

export const taskListQuerySchema = z
  .object({
    workspaceId: uuidSchema.optional(),
    projectId: uuidSchema.optional(),
    status: taskStatusSchema.optional(),
  })
  .strict();

export const createTaskSchema = z
  .object({
    workspaceId: uuidSchema,
    projectId: z.union([uuidSchema, z.null()]).default(null),
    repoConnectionId: z.union([uuidSchema, z.null()]).default(null),
    automationId: z.union([uuidSchema, z.null()]).default(null),
    title: requiredTextSchema,
    prompt: requiredTextSchema,
    sandboxSize: sandboxSizeSchema.default("medium"),
    permissionMode: permissionModeSchema.default("safe"),
    baseBranch: optionalNullableTextSchema,
    branchName: optionalNullableTextSchema,
    policy: executionPolicySchema.default({}),
    config: executionConfigSchema.default({
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

    if (value.automationId !== null && value.projectId === null) {
      issue.addIssue({
        code: "custom",
        message: "projectId is required when automationId is provided",
        path: ["projectId"],
      });
    }
  });

export const taskControlSchema = z
  .object({
    reason: optionalNullableTextSchema,
  })
  .strict();
