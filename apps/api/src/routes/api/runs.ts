import { Hono } from "hono";

import { Effect } from "effect";

import { runApiEffect } from "../../effect/http";
import { validateJson, validateParams } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { runService } from "../../services/run-service";
import {
  createRunSchema,
  runControlSchema,
  runIdParamsSchema,
  runPublishSchema,
} from "../../validators/runs";
import { runEventsHub } from "../../ws";

export const runRoutes = new Hono<ApiEnv>();

runRoutes.post("/", async (context) => {
  const input = await validateJson(context, createRunSchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    Effect.tryPromise(() => runService.create(input, "api", userId)).pipe(
      Effect.tap(() => Effect.sync(() => runEventsHub.notifyTasksChanged())),
    ),
    201,
  );
});

runRoutes.get("/:runId", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    Effect.tryPromise(() => runService.getById(runId, userId)),
  );
});

runRoutes.get("/:runId/events", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    Effect.tryPromise(() => runService.listEvents(runId, userId)),
  );
});

runRoutes.get("/:runId/logs", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    Effect.tryPromise(() => runService.listLogs(runId, userId)),
  );
});

runRoutes.get("/:runId/diff", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    Effect.tryPromise(() => runService.getDiff(runId, userId)),
  );
});

runRoutes.post("/:runId/publish", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);
  const userId = context.get("userId");

  await validateJson(context, runPublishSchema, {
    optionalBody: true,
  });

  return runApiEffect(
    context,
    Effect.tryPromise(() => runService.publish(runId, userId)).pipe(
      Effect.tap(() => Effect.sync(() => runEventsHub.notifyTasksChanged())),
    ),
  );
});

runRoutes.post("/:runId/pause", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);
  const userId = context.get("userId");
  const input = await validateJson(context, runControlSchema, {
    optionalBody: true,
  });
  return runApiEffect(
    context,
    Effect.tryPromise(() => runService.pause(runId, input, userId)).pipe(
      Effect.map((result) => ({
        run: result.run,
        control: result.control,
      })),
    ),
    202,
  );
});

runRoutes.post("/:runId/resume", async (context) => {
  const { runId } = validateParams(context, runIdParamsSchema);
  const userId = context.get("userId");
  const input = await validateJson(context, runControlSchema, {
    optionalBody: true,
  });
  return runApiEffect(
    context,
    Effect.tryPromise(() => runService.resume(runId, input, userId)).pipe(
      Effect.map((result) => ({
        run: result.run,
        control: result.control,
      })),
    ),
    202,
  );
});
