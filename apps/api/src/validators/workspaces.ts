import { z } from "zod";

import { metadataSchema, nullableTextSchema, requiredTextSchema, slugSchema } from "./common";

export const createWorkspaceSchema = z
  .object({
    slug: slugSchema,
    name: requiredTextSchema,
    description: nullableTextSchema,
    metadata: metadataSchema,
  })
  .strict();
