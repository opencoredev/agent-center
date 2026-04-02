import { Hono } from "hono";

import { ok } from "../../http/responses";
import { validateJson, validateParams, validateQuery } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { taskService } from "../../services/task-service";
import { createRunSchema } from "../../validators/runs";
import {
  createTaskSchema,
  taskControlSchema,
  taskIdParamsSchema,
  taskListQuerySchema,
} from "../../validators/tasks";
import { runEventsHub } from "../../ws";

export const taskRoutes = new Hono<ApiEnv>();

taskRoutes.post("/", async (context) => {
  const input = await validateJson(context, createTaskSchema);
  const result = await taskService.create(input);
  runEventsHub.notifyTasksChanged();

  return ok(context, result, 201);
});

taskRoutes.get("/", async (context) => {
  const filters = validateQuery(context, taskListQuerySchema);

  return ok(context, await taskService.list(filters));
});

taskRoutes.post("/:taskId/cancel", async (context) => {
  const { taskId } = validateParams(context, taskIdParamsSchema);
  const input = await validateJson(context, taskControlSchema, {
    optionalBody: true,
  });
  const result = await taskService.cancel(taskId, input);
  runEventsHub.notifyTasksChanged();

  return ok(
    context,
    {
      task: result.task,
      control: result.control,
    },
    result.statusCode,
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
  const result = await taskService.retry(taskId, input);
  runEventsHub.notifyTasksChanged();

  return ok(context, result, 201);
});

taskRoutes.get("/:taskId", async (context) => {
  const { taskId } = validateParams(context, taskIdParamsSchema);

  return ok(context, await taskService.getById(taskId));
});
