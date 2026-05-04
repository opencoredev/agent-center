import { createMiddleware } from "hono/factory";

import { ApiError } from "../http/errors";
import { runnerService } from "../services/runner-service";

function allowsRevokedRunnerRecovery(path: string) {
  return (
    path.startsWith("/internal/github/repo-connections/") &&
    path.endsWith("/installation-token")
  );
}

export const runnerAuthMiddleware = createMiddleware(async (context, next) => {
  const authHeader = context.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "runner_unauthorized", "Runner authentication required");
  }

  const token = authHeader.slice(7);
  const runner = await runnerService.authenticate(token, {
    allowRevoked: allowsRevokedRunnerRecovery(context.req.path),
  });

  context.set("runnerId", runner.id);
  context.set("runnerWorkspaceId", runner.workspaceId);

  await next();
});
