import { Hono } from "hono";

import { ok } from "../../http/responses";
import { validateJson, validateParams } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { runService } from "../../services/run-service";
import { createRunSchema, runControlSchema, runIdParamsSchema } from "../../validators/runs";

export const runRoutes = new Hono<ApiEnv>();

runRoutes.post("/", async (context) => {
  const input = await validateJson(context, createRunSchema);

  return ok(context, await runService.create(input), 201);
});

runRoutes.get("/:runId", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);

  return ok(context, await runService.getById(runId));
});

runRoutes.get("/:runId/events", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);

  return ok(context, await runService.listEvents(runId));
});

runRoutes.get("/:runId/logs", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);

  return ok(context, await runService.listLogs(runId));
});

runRoutes.post("/:runId/pause", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);
  const input = await validateJson(context, runControlSchema, {
    optionalBody: true,
  });
  const result = await runService.pause(runId, input);

  return ok(
    context,
    {
      run: result.run,
      control: result.control,
    },
    result.statusCode,
  );
});

runRoutes.post("/:runId/resume", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);
  const input = await validateJson(context, runControlSchema, {
    optionalBody: true,
  });
  const result = await runService.resume(runId, input);

  return ok(
    context,
    {
      run: result.run,
      control: result.control,
    },
    result.statusCode,
  );
});
