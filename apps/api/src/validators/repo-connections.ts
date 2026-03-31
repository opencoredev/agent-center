import { z } from "zod";

import {
  emptyBodySchema,
  nullableTextSchema,
  repoConnectionIdParamsSchema,
  repoProviderSchema,
  requiredTextSchema,
  uuidSchema,
} from "./common";

export { repoConnectionIdParamsSchema };

export const repoConnectionListQuerySchema = z
  .object({
    workspaceId: uuidSchema.optional(),
    projectId: uuidSchema.optional(),
    provider: repoProviderSchema.optional(),
  })
  .strict();

export const createRepoConnectionSchema = z
  .object({
    workspaceId: uuidSchema,
    projectId: z.union([uuidSchema, z.null()]).default(null),
    provider: repoProviderSchema.default("github"),
    owner: requiredTextSchema,
    repo: requiredTextSchema,
    defaultBranch: nullableTextSchema,
    authType: requiredTextSchema,
    connectionMetadata: z.record(z.string(), z.unknown()).nullable().default(null),
  })
  .strict();

export const repoConnectionTestSchema = emptyBodySchema;
