import { Hono } from "hono";

import type { ApiEnv } from "../../http/types";
import { apiKeyRoutes } from "./api-keys";
import { authClaudeOAuthRoutes } from "./auth/claude-oauth";
import { authCodexRoutes } from "./auth/codex-auth";
import { authGitHubRoutes } from "./auth/github";
import { authGoogleRoutes } from "./auth/google";
import { authLoginRoutes } from "./auth/login";
import { automationRoutes } from "./automations";
import { credentialRoutes } from "./credentials";
import { githubRoutes } from "./github";
import { projectRoutes } from "./projects";
import { repoConnectionRoutes } from "./repo-connections";
import { runnerRoutes } from "./runners";
import { runRoutes } from "./runs";
import { runtimeRoutes } from "./runtime";
import { taskRoutes } from "./tasks";
import { workspaceRoutes } from "./workspaces";

export const apiRoutes = new Hono<ApiEnv>();

apiRoutes.route("/auth", authLoginRoutes);
apiRoutes.route("/auth", authGoogleRoutes);
apiRoutes.route("/auth", authGitHubRoutes);
apiRoutes.route("/auth", authClaudeOAuthRoutes);
apiRoutes.route("/auth", authCodexRoutes);
apiRoutes.route("/api-keys", apiKeyRoutes);
apiRoutes.route("/github", githubRoutes);
apiRoutes.route("/workspaces", workspaceRoutes);
apiRoutes.route("/projects", projectRoutes);
apiRoutes.route("/repo-connections", repoConnectionRoutes);
apiRoutes.route("/runners", runnerRoutes);
apiRoutes.route("/runtime", runtimeRoutes);
apiRoutes.route("/tasks", taskRoutes);
apiRoutes.route("/runs", runRoutes);
apiRoutes.route("/automations", automationRoutes);
apiRoutes.route("/credentials", credentialRoutes);
