import { Hono } from "hono";
import { z } from "zod";
import { Effect } from "effect";
import type { Context } from "hono";

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

async function listInstallationsHandler(context: Context<ApiEnv>) {
  const { workspaceId } = validateQuery(context, githubInstallationsQuerySchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() => githubAppService.listInstallations({ workspaceId, userId })),
  );
}

async function listInstallationRepositoriesHandler(context: Context<ApiEnv>) {
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
}

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

githubRoutes.get("/installations", listInstallationsHandler);
githubRoutes.get("/app/installations", listInstallationsHandler);
githubRoutes.get("/installations/:installationId/repositories", listInstallationRepositoriesHandler);
githubRoutes.get("/app/installations/:installationId/repositories", listInstallationRepositoriesHandler);
