import { Hono } from "hono";
import { z } from "zod";
import { Effect } from "effect";

import { runApiEffect, tryApiPromise } from "../../effect/http";
import { validateParams, validateQuery } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { githubAppService } from "../../services/github-app-service";
import { githubWebhookService } from "../../services/github-webhook-service";
import { uuidSchema } from "../../validators/common";
import { runEventsHub } from "../../ws";

const installationIdParamsSchema = z.object({
  installationId: z.coerce.number().int().positive(),
});

const githubInstallationsQuerySchema = z
  .object({
    workspaceId: uuidSchema.optional(),
  })
  .strict();

export const githubRoutes = new Hono<ApiEnv>();

githubRoutes.post("/webhook", async (context) => {
  const rawBody = await context.req.text();
  return runApiEffect(
    context,
    tryApiPromise(() =>
      githubWebhookService.handleSignedDelivery({
        deliveryId: context.req.header("X-GitHub-Delivery"),
        event: context.req.header("X-GitHub-Event"),
        rawBody,
        requestOrigin: new URL(context.req.url).origin,
        signature: context.req.header("X-Hub-Signature-256"),
      }),
    ).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          if (result.status === "created") {
            runEventsHub.notifyTasksChanged();
          }
        })
      ),
    ),
  );
});

githubRoutes.get("/app", async (context) => {
  return runApiEffect(context, tryApiPromise(() => githubAppService.getStatus()));
});

githubRoutes.get("/installations", async (context) => {
  const { workspaceId } = validateQuery(context, githubInstallationsQuerySchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() => githubAppService.listInstallations({ workspaceId, userId })),
  );
});

githubRoutes.get("/app/installations", async (context) => {
  const { workspaceId } = validateQuery(context, githubInstallationsQuerySchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() => githubAppService.listInstallations({ workspaceId, userId })),
  );
});

githubRoutes.get("/installations/:installationId/repositories", async (context) => {
  const { installationId } = validateParams(context, installationIdParamsSchema);
  const { workspaceId } = validateQuery(context, githubInstallationsQuerySchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() =>
      githubAppService.listInstallationRepositories({
        installationId,
        workspaceId,
        userId,
      }),
    ),
  );
});

githubRoutes.get("/app/installations/:installationId/repositories", async (context) => {
  const { installationId } = validateParams(context, installationIdParamsSchema);
  const { workspaceId } = validateQuery(context, githubInstallationsQuerySchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() =>
      githubAppService.listInstallationRepositories({
        installationId,
        workspaceId,
        userId,
      }),
    ),
  );
});
