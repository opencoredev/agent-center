import { Hono } from "hono";
import { Effect } from "effect";

import { runApiEffect, runApiResponseEffect, tryApiPromise } from "../../effect/http";
import { ok } from "../../http/responses";
import { validateJson, validateParams, validateQuery } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { runService } from "../../services/run-service";
import { taskService } from "../../services/task-service";
import { createRunSchema } from "../../validators/runs";
import {
  createTaskSchema,
  taskControlSchema,
  taskIdParamsSchema,
  taskListQuerySchema,
  updateTaskSchema,
} from "../../validators/tasks";
import { runEventsHub } from "../../ws";

export const taskRoutes = new Hono<ApiEnv>();

taskRoutes.post("/", async (context) => {
  const input = await validateJson(context, createTaskSchema);
  return runApiEffect(
    context,
    tryApiPromise(() => taskService.create(input)).pipe(
      Effect.tap(() => Effect.sync(() => runEventsHub.notifyTasksChanged())),
    ),
    201,
  );
});

taskRoutes.get("/", async (context) => {
  const filters = validateQuery(context, taskListQuerySchema);
  return runApiEffect(context, tryApiPromise(() => taskService.list(filters)));
});

taskRoutes.post("/:taskId/cancel", async (context) => {
  const { taskId } = validateParams(context, taskIdParamsSchema);
  const input = await validateJson(context, taskControlSchema, {
    optionalBody: true,
  });
  return runApiResponseEffect(
    context,
    tryApiPromise(() => taskService.cancel(taskId, input)).pipe(
      Effect.tap(() => Effect.sync(() => runEventsHub.notifyTasksChanged())),
      Effect.map((result) =>
        ok(
          context,
          {
            task: result.task,
            control: result.control,
          },
          result.statusCode,
        ),
      ),
    ),
  );
});

taskRoutes.post("/:taskId/retry", async (context) => {
  const { taskId } = validateParams(context, taskIdParamsSchema);
  const input = await validateJson(
    context,
    createRunSchema.omit({
      taskId: true,
    }),
    {
      optionalBody: true,
    },
  );
  return runApiEffect(
    context,
    tryApiPromise(() => taskService.retry(taskId, input)).pipe(
      Effect.tap(() => Effect.sync(() => runEventsHub.notifyTasksChanged())),
    ),
    201,
  );
});

taskRoutes.get("/:taskId", async (context) => {
  const { taskId } = validateParams(context, taskIdParamsSchema);
  return runApiEffect(context, tryApiPromise(() => taskService.getById(taskId)));
});

taskRoutes.patch("/:taskId", async (context) => {
  const { taskId } = validateParams(context, taskIdParamsSchema);
  const input = await validateJson(context, updateTaskSchema);

  return runApiEffect(
    context,
    tryApiPromise(() => taskService.update(taskId, input)).pipe(
      Effect.tap(() => Effect.sync(() => runEventsHub.notifyTasksChanged())),
    ),
  );
});

taskRoutes.get("/:taskId/runs", async (context) => {
  const { taskId } = validateParams(context, taskIdParamsSchema);
  return runApiEffect(context, tryApiPromise(() => runService.listByTask(taskId)));
});
