import { Hono } from "hono";

import { ok } from "../../http/responses";
import type { ApiEnv } from "../../http/types";
import { runnerAuthMiddleware } from "../../middleware/runner-auth";
import { credentialService } from "../../services/credential-service";

export const internalCredentialRoutes = new Hono<ApiEnv>();

internalCredentialRoutes.use("*", runnerAuthMiddleware);

internalCredentialRoutes.get("/claude/resolve", async (context) => {
  const runnerWorkspaceId = context.get("runnerWorkspaceId");
  if (!runnerWorkspaceId) {
    throw new Error("Runner workspace id was not attached to the request context");
  }

  const credential = await credentialService.resolveRunnerClaudeCredential(runnerWorkspaceId);

  return ok(context, credential);
});

internalCredentialRoutes.get("/openai/resolve", async (context) => {
  const runnerWorkspaceId = context.get("runnerWorkspaceId");
  if (!runnerWorkspaceId) {
    throw new Error("Runner workspace id was not attached to the request context");
  }

  const credential = await credentialService.resolveRunnerOpenAICredential(runnerWorkspaceId);

  return ok(context, credential);
});
