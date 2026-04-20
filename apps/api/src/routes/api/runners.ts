import { Hono } from "hono";

import { runApiEffect, tryApiPromise } from "../../effect/http";
import { validateJson, validateParams, validateQuery } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { runnerService } from "../../services/runner-service";
import {
  createRunnerRegistrationTokenSchema,
  registerRunnerSchema,
  runnerIdParamsSchema,
  runnerListQuerySchema,
  runnerRegistrationTokenIdParamsSchema,
  runnerRegistrationTokenListQuerySchema,
} from "../../validators/runners";

export const runnerRoutes = new Hono<ApiEnv>();

runnerRoutes.get("/", async (context) => {
  const { workspaceId } = validateQuery(context, runnerListQuerySchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() => runnerService.list(workspaceId, userId)),
  );
});

runnerRoutes.get("/registration-tokens", async (context) => {
  const { workspaceId } = validateQuery(context, runnerRegistrationTokenListQuerySchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() => runnerService.listRegistrationTokens(workspaceId, userId)),
  );
});

runnerRoutes.post("/registration-tokens", async (context) => {
  const input = await validateJson(context, createRunnerRegistrationTokenSchema);

  return runApiEffect(
    context,
    tryApiPromise(() =>
      runnerService.createRegistrationToken({
        ...input,
        createdByUserId: context.get("userId"),
      }),
    ),
    201,
  );
});

runnerRoutes.delete("/registration-tokens/:registrationTokenId", async (context) => {
  const { registrationTokenId } = validateParams(context, runnerRegistrationTokenIdParamsSchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() => runnerService.revokeRegistrationToken(registrationTokenId, userId)),
  );
});

runnerRoutes.post("/register", async (context) => {
  const input = await validateJson(context, registerRunnerSchema);

  return runApiEffect(
    context,
    tryApiPromise(() => runnerService.register(input)),
    201,
  );
});

runnerRoutes.delete("/:runnerId", async (context) => {
  const { runnerId } = validateParams(context, runnerIdParamsSchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() => runnerService.revokeRunner(runnerId, userId)),
  );
});
