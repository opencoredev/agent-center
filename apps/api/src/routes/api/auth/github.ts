import { Hono } from "hono";

import type { ApiEnv } from "../../../http/types";
import { githubAppService } from "../../../services/github-app-service";
import { ApiError } from "../../../http/errors";

export const authGitHubRoutes = new Hono<ApiEnv>();

authGitHubRoutes.get("/github/start", async (context) => {
  const status = await githubAppService.getStatus();
  const installUrl = status.installUrl;

  if (!installUrl) {
    throw new ApiError(501, "github_app_not_configured", "GitHub App is not configured");
  }

  return context.redirect(installUrl);
});

authGitHubRoutes.get("/github/callback", async (context) => {
  const status = await githubAppService.getStatus();
  const setupUrl = status.setupUrl;
  const webBase = setupUrl ?? "/";
  const params = new URLSearchParams();

  const installationId = context.req.query("installation_id");
  const setupAction = context.req.query("setup_action");
  if (installationId) {
    params.set("installation_id", installationId);
  }
  if (setupAction) {
    params.set("setup_action", setupAction);
  }

  const separator = webBase.includes("?") ? "&" : "?";
  return context.redirect(params.size > 0 ? `${webBase}${separator}${params}` : webBase);
});
