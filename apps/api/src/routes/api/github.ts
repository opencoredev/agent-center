import { Hono } from "hono";

import { runApiEffect, tryApiPromise } from "../../effect/http";
import { validateParams } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { githubAppService } from "../../services/github-app-service";
import { z } from "zod";

const installationIdParamsSchema = z.object({
  installationId: z.coerce.number().int().positive(),
});

export const githubRoutes = new Hono<ApiEnv>();

githubRoutes.get("/app", async (context) => {
  return runApiEffect(context, tryApiPromise(() => githubAppService.getStatus()));
});

githubRoutes.get("/installations", async (context) => {
  return runApiEffect(context, tryApiPromise(() => githubAppService.listInstallations()));
});

githubRoutes.get("/app/installations", async (context) => {
  return runApiEffect(context, tryApiPromise(() => githubAppService.listInstallations()));
});

githubRoutes.get("/installations/:installationId/repositories", async (context) => {
  const { installationId } = validateParams(context, installationIdParamsSchema);

  return runApiEffect(
    context,
    tryApiPromise(() => githubAppService.listInstallationRepositories(installationId)),
  );
});

githubRoutes.get("/app/installations/:installationId/repositories", async (context) => {
  const { installationId } = validateParams(context, installationIdParamsSchema);

  return runApiEffect(
    context,
    tryApiPromise(() => githubAppService.listInstallationRepositories(installationId)),
  );
});
