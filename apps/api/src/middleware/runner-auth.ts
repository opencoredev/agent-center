import { createMiddleware } from "hono/factory";

import { ApiError } from "../http/errors";
import { runnerService } from "../services/runner-service";

export const runnerAuthMiddleware = createMiddleware(async (context, next) => {
  const authHeader = context.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "runner_unauthorized", "Runner authentication required");
  }

  const token = authHeader.slice(7);
  const runner = await runnerService.authenticate(token);

  context.set("runnerId", runner.id);
  context.set("runnerWorkspaceId", runner.workspaceId);

  await next();
});
