import { z } from "zod";

import {
  executionConfigSchema,
  executionPolicySchema,
  metadataSchema,
  optionalNullableTextSchema,
  permissionModeSchema,
  runIdParamsSchema,
  sandboxSizeSchema,
  uuidSchema,
} from "./common";

export { runIdParamsSchema };

export const createRunSchema = z
  .object({
    taskId: uuidSchema,
    baseBranch: optionalNullableTextSchema,
    branchName: optionalNullableTextSchema,
    sandboxSize: sandboxSizeSchema.optional(),
    permissionMode: permissionModeSchema.optional(),
    policy: executionPolicySchema.optional(),
    config: executionConfigSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const runControlSchema = z
  .object({
    reason: optionalNullableTextSchema,
  })
  .strict();
