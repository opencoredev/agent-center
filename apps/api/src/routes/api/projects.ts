import { Hono } from "hono";

import { ok } from "../../http/responses";
import { validateJson, validateParams, validateQuery } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { projectService } from "../../services/project-service";
import {
  createProjectSchema,
  projectIdParamsSchema,
  projectListQuerySchema,
} from "../../validators/projects";

export const projectRoutes = new Hono<ApiEnv>();

projectRoutes.get("/", async (context) => {
  const filters = validateQuery(context, projectListQuerySchema);

  return ok(context, await projectService.list(filters));
});

projectRoutes.post("/", async (context) => {
  const input = await validateJson(context, createProjectSchema);

  return ok(context, await projectService.create(input), 201);
});

projectRoutes.get("/:projectId", async (context) => {
  const { projectId } = validateParams(context, projectIdParamsSchema);

  return ok(context, await projectService.getById(projectId));
});
