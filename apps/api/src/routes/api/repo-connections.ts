import { Hono } from "hono";

import { runApiEffect, tryApiPromise } from "../../effect/http";
import { validateJson, validateParams, validateQuery } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { repoConnectionService } from "../../services/repo-connection-service";
import {
  createRepoConnectionSchema,
  repoConnectionIdParamsSchema,
  repoConnectionListQuerySchema,
  repoConnectionTestSchema,
} from "../../validators/repo-connections";

export const repoConnectionRoutes = new Hono<ApiEnv>();

repoConnectionRoutes.get("/", async (context) => {
  const filters = validateQuery(context, repoConnectionListQuerySchema);
  const userId = context.get("userId");

  return runApiEffect(context, tryApiPromise(() => repoConnectionService.list(filters, userId)));
});

repoConnectionRoutes.post("/", async (context) => {
  const input = await validateJson(context, createRepoConnectionSchema);
  const userId = context.get("userId");

  return runApiEffect(context, tryApiPromise(() => repoConnectionService.create(input, userId)), 201);
});

repoConnectionRoutes.post("/:repoConnectionId/test", async (context) => {
  const { repoConnectionId } = validateParams(context, repoConnectionIdParamsSchema);
  const userId = context.get("userId");

  await validateJson(context, repoConnectionTestSchema, {
    optionalBody: true,
  });

  return runApiEffect(context, tryApiPromise(() => repoConnectionService.test(repoConnectionId, userId)));
});

repoConnectionRoutes.get("/:repoConnectionId", async (context) => {
  const { repoConnectionId } = validateParams(context, repoConnectionIdParamsSchema);
  const userId = context.get("userId");

  return runApiEffect(context, tryApiPromise(() => repoConnectionService.getById(repoConnectionId, userId)));
});

repoConnectionRoutes.delete("/:repoConnectionId", async (context) => {
  const { repoConnectionId } = validateParams(context, repoConnectionIdParamsSchema);
  const userId = context.get("userId");

  return runApiEffect(context, tryApiPromise(() => repoConnectionService.delete(repoConnectionId, userId)));
});
