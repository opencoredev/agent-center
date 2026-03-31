import { Hono } from "hono";

import { ok } from "../../http/responses";
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

  return ok(context, await repoConnectionService.list(filters));
});

repoConnectionRoutes.post("/", async (context) => {
  const input = await validateJson(context, createRepoConnectionSchema);

  return ok(context, await repoConnectionService.create(input), 201);
});

repoConnectionRoutes.post("/:repoConnectionId/test", async (context) => {
  const { repoConnectionId } = validateParams(context, repoConnectionIdParamsSchema);

  await validateJson(context, repoConnectionTestSchema, {
    optionalBody: true,
  });

  return ok(context, await repoConnectionService.test(repoConnectionId));
});

repoConnectionRoutes.get("/:repoConnectionId", async (context) => {
  const { repoConnectionId } = validateParams(context, repoConnectionIdParamsSchema);

  return ok(context, await repoConnectionService.getById(repoConnectionId));
});
