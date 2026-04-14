import { Hono } from "hono";

import { runApiEffect, tryApiPromise } from "../../effect/http";
import { validateJson, validateParams } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { workspaceService } from "../../services/workspace-service";
import { workspaceIdParamsSchema } from "../../validators/common";
import { createWorkspaceSchema } from "../../validators/workspaces";

export const workspaceRoutes = new Hono<ApiEnv>();

workspaceRoutes.get("/", async (context) => {
  return runApiEffect(context, tryApiPromise(() => workspaceService.list()));
});

workspaceRoutes.post("/", async (context) => {
  const input = await validateJson(context, createWorkspaceSchema);

  return runApiEffect(context, tryApiPromise(() => workspaceService.create(input)), 201);
});

workspaceRoutes.get("/:workspaceId", async (context) => {
  const { workspaceId } = validateParams(context, workspaceIdParamsSchema);

  return runApiEffect(context, tryApiPromise(() => workspaceService.getById(workspaceId)));
});
