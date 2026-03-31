import { Hono } from "hono";

import type { ApiEnv } from "../../http/types";
import { apiKeyRoutes } from "./api-keys";
import { authGoogleRoutes } from "./auth/google";
import { authLoginRoutes } from "./auth/login";
import { automationRoutes } from "./automations";
import { credentialRoutes } from "./credentials";
import { projectRoutes } from "./projects";
import { repoConnectionRoutes } from "./repo-connections";
import { runRoutes } from "./runs";
import { taskRoutes } from "./tasks";
import { workspaceRoutes } from "./workspaces";

export const apiRoutes = new Hono<ApiEnv>();

apiRoutes.route("/auth", authLoginRoutes);
apiRoutes.route("/auth", authGoogleRoutes);
apiRoutes.route("/api-keys", apiKeyRoutes);
apiRoutes.route("/workspaces", workspaceRoutes);
apiRoutes.route("/projects", projectRoutes);
apiRoutes.route("/repo-connections", repoConnectionRoutes);
apiRoutes.route("/tasks", taskRoutes);
apiRoutes.route("/runs", runRoutes);
apiRoutes.route("/automations", automationRoutes);
apiRoutes.route("/credentials", credentialRoutes);
