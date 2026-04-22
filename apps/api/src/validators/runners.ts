import { z } from "zod";

import { requiredTextSchema, uuidSchema } from "./common";

export const runnerIdParamsSchema = z.object({
  runnerId: uuidSchema,
});

export const runnerRegistrationTokenIdParamsSchema = z.object({
  registrationTokenId: uuidSchema,
});

export const runnerListQuerySchema = z
  .object({
    workspaceId: uuidSchema,
  })
  .strict();

export const createRunnerRegistrationTokenSchema = z
  .object({
    workspaceId: uuidSchema,
    name: requiredTextSchema,
    expiresInMinutes: z.coerce
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .optional(),
  })
  .strict();

export const runnerRegistrationTokenListQuerySchema = z
  .object({
    workspaceId: uuidSchema,
  })
  .strict();

export const registerRunnerSchema = z
  .object({
    registrationToken: requiredTextSchema,
  })
  .strict();
