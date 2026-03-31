import { Hono } from "hono";

import { ok } from "../../http/responses";
import { validateJson, validateParams, validateQuery } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { automationService } from "../../services/automation-service";
import { emptyBodySchema } from "../../validators/common";
import {
  automationIdParamsSchema,
  automationListQuerySchema,
  createAutomationSchema,
  updateAutomationSchema,
} from "../../validators/automations";

export const automationRoutes = new Hono<ApiEnv>();

automationRoutes.post("/", async (context) => {
  const input = await validateJson(context, createAutomationSchema);

  return ok(context, await automationService.create(input), 201);
});

automationRoutes.get("/", async (context) => {
  const filters = validateQuery(context, automationListQuerySchema);

  return ok(context, await automationService.list(filters));
});

automationRoutes.post("/:automationId/enable", async (context) => {
  const { automationId } = validateParams(context, automationIdParamsSchema);

  await validateJson(context, emptyBodySchema, {
    optionalBody: true,
  });

  return ok(context, await automationService.setEnabled(automationId, true));
});

automationRoutes.post("/:automationId/disable", async (context) => {
  const { automationId } = validateParams(context, automationIdParamsSchema);

  await validateJson(context, emptyBodySchema, {
    optionalBody: true,
  });

  return ok(context, await automationService.setEnabled(automationId, false));
});

automationRoutes.get("/:automationId", async (context) => {
  const { automationId } = validateParams(context, automationIdParamsSchema);

  return ok(context, await automationService.getById(automationId));
});

automationRoutes.patch("/:automationId", async (context) => {
  const { automationId } = validateParams(context, automationIdParamsSchema);
  const input = await validateJson(context, updateAutomationSchema);

  return ok(context, await automationService.update(automationId, input));
});
