import { z } from "zod";

import {
  emptyBodySchema,
  idSchema,
  nullableTextSchema,
  repoConnectionIdParamsSchema,
  repoProviderSchema,
  requiredTextSchema,
} from "./common";

export { repoConnectionIdParamsSchema };

export const repoConnectionListQuerySchema = z
  .object({
    workspaceId: idSchema.optional(),
    projectId: idSchema.optional(),
    provider: repoProviderSchema.optional(),
  })
  .strict();

export const createRepoConnectionSchema = z
  .object({
    workspaceId: idSchema,
    projectId: z.union([idSchema, z.null()]).default(null),
    provider: repoProviderSchema.default("github"),
    owner: requiredTextSchema,
    repo: requiredTextSchema,
    defaultBranch: nullableTextSchema,
    authType: requiredTextSchema,
    connectionMetadata: z.record(z.string(), z.unknown()).nullable().default(null),
  })
  .strict();

export const repoConnectionTestSchema = emptyBodySchema;
