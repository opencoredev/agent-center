import { Hono } from "hono";

import { ok } from "../../http/responses";
import { validateParams } from "../../http/validation";
import type { ApiEnv } from "../../http/types";
import { runnerAuthMiddleware } from "../../middleware/runner-auth";
import { findRepoConnectionByWorkspaceAndId } from "../../repositories/repo-connection-repository";
import { githubAppService } from "../../services/github-app-service";
import { ApiError } from "../../http/errors";
import { z } from "zod";

const repoConnectionIdParamsSchema = z.object({
  repoConnectionId: z.uuid(),
});

export const internalGitHubRoutes = new Hono<ApiEnv>();

internalGitHubRoutes.use("*", runnerAuthMiddleware);

internalGitHubRoutes.get(
  "/repo-connections/:repoConnectionId/installation-token",
  async (context) => {
    const { repoConnectionId } = validateParams(context, repoConnectionIdParamsSchema);
    const workspaceId = context.get("runnerWorkspaceId");

    if (!workspaceId) {
      throw new Error("Runner workspace id was not attached to the request context");
    }

    const repoConnection = await findRepoConnectionByWorkspaceAndId(workspaceId, repoConnectionId);

    if (!repoConnection) {
      throw new ApiError(404, "repo_connection_not_found", "Repo connection not found");
    }

    const installationId = Number(
      (repoConnection.connectionMetadata as Record<string, unknown> | null)?.installationId,
    );

    if (!Number.isInteger(installationId) || installationId <= 0) {
      throw new ApiError(
        400,
        "repo_connection_not_installation_backed",
        "Repo connection is not backed by a GitHub App installation",
      );
    }

    const token = await githubAppService.getInstallationAccessToken(installationId);

    return ok(context, {
      token: token.token,
      expiresAt: token.expires_at ?? null,
    });
  },
);
