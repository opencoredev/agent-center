import { Hono } from "hono";
import { z } from "zod";
import { Effect } from "effect";
import type { Context } from "hono";

import { runApiEffect, tryApiPromise } from "../../effect/http";
import { ApiError } from "../../http/errors";
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
    installationId: z.coerce.number().int().positive().optional(),
    state: z.string().trim().min(1).optional(),
    workspaceId: uuidSchema.optional(),
  })
  .strict();

const githubInstallUrlQuerySchema = z
  .object({
    workspaceId: uuidSchema,
  })
  .strict();

export const githubRoutes = new Hono<ApiEnv>();

async function listInstallationsHandler(context: Context<ApiEnv>) {
  const { installationId, state, workspaceId } = validateQuery(
    context,
    githubInstallationsQuerySchema,
  );
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() =>
      githubAppService.listInstallations({
        installationId,
        state,
        workspaceId,
        userId,
      }),
    ),
  );
}

async function listInstallationRepositoriesHandler(context: Context<ApiEnv>) {
  const { installationId } = validateParams(context, installationIdParamsSchema);
  const { state, workspaceId } = validateQuery(context, githubInstallationsQuerySchema);
  const userId = context.get("userId");

  return runApiEffect(
    context,
    tryApiPromise(() =>
      githubAppService.listInstallationRepositories({
        installationId,
        state,
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
        }),
      ),
    ),
  );
});

githubRoutes.get("/app", async (context) => {
  return runApiEffect(
    context,
    tryApiPromise(() => githubAppService.getStatus()),
  );
});

githubRoutes.get("/install-url", async (context) => {
  const { workspaceId } = validateQuery(context, githubInstallUrlQuerySchema);
  const userId = context.get("userId");
  if (!userId) {
    throw new ApiError(401, "unauthorized", "Authentication required");
  }

  return runApiEffect(
    context,
    tryApiPromise(() => githubAppService.createWorkspaceInstallUrl({ workspaceId, userId })),
  );
});

githubRoutes.get("/installations", listInstallationsHandler);
githubRoutes.get("/app/installations", listInstallationsHandler);
githubRoutes.get(
  "/installations/:installationId/repositories",
  listInstallationRepositoriesHandler,
);
githubRoutes.get(
  "/app/installations/:installationId/repositories",
  listInstallationRepositoriesHandler,
);
