import { z } from "zod";

import {
  metadataSchema,
  nullableTextSchema,
  optionalNullableTextSchema,
  projectIdParamsSchema,
  requiredTextSchema,
  slugSchema,
  uuidSchema,
} from "./common";

export { projectIdParamsSchema };

export const projectListQuerySchema = z
  .object({
    workspaceId: uuidSchema.optional(),
  })
  .strict();

export const createProjectSchema = z
  .object({
    workspaceId: uuidSchema,
    slug: slugSchema,
    name: requiredTextSchema,
    description: nullableTextSchema,
    defaultBranch: requiredTextSchema.default("main"),
    rootDirectory: optionalNullableTextSchema,
    metadata: metadataSchema,
  })
  .strict();
