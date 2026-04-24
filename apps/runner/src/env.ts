import { resolve } from "node:path";

import { host, loadRootEnv, logLevel, nodeEnv, parseEnv, port } from "@agent-center/config";
import { z } from "zod";

loadRootEnv();

export const runnerEnv = parseEnv(
  {
    NODE_ENV: process.env.NODE_ENV,
    RUNNER_HOST: process.env.RUNNER_HOST,
    RUNNER_LOG_LEVEL: process.env.RUNNER_LOG_LEVEL,
    RUNNER_PORT: process.env.PORT || process.env.RUNNER_PORT,
    CONVEX_URL: process.env.CONVEX_URL || process.env.VITE_CONVEX_URL,
    AGENT_CENTER_CONVEX_SERVICE_TOKEN: process.env.AGENT_CENTER_CONVEX_SERVICE_TOKEN,
  },
  {
    NODE_ENV: nodeEnv,
    RUNNER_HOST: host.default("127.0.0.1"),
    RUNNER_LOG_LEVEL: logLevel,
    RUNNER_PORT: port.default(3002),
    CONVEX_URL: z.url(),
    AGENT_CENTER_CONVEX_SERVICE_TOKEN: z.string().trim().min(1),
  },
);

function parseCleanupMode(value: string | undefined): "delete_on_completion" | "retain" {
  return value === "delete_on_completion" ? "delete_on_completion" : "retain";
}

function parsePollInterval(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 250) {
    return 1_000;
  }

  return parsed;
}

export const runnerRuntimeEnv = {
  ...runnerEnv,
  RUNNER_BOOTSTRAP_TOKEN: process.env.RUNNER_BOOTSTRAP_TOKEN?.trim() ?? "",
  RUNNER_CLEANUP_MODE: parseCleanupMode(process.env.RUNNER_CLEANUP_MODE),
  RUNNER_CONTROL_POLL_INTERVAL_MS: parsePollInterval(process.env.RUNNER_CONTROL_POLL_INTERVAL_MS),
  RUNNER_INTERNAL_TOKEN: process.env.RUNNER_INTERNAL_TOKEN?.trim() ?? "",
  RUNNER_API_TOKEN: process.env.RUNNER_API_TOKEN?.trim() ?? "",
  RUNNER_API_URL: process.env.RUNNER_API_URL?.trim() || "http://api.agent-center.localhost:1355",
  RUNNER_REGISTRATION_TOKEN: process.env.RUNNER_REGISTRATION_TOKEN?.trim() ?? "",
  RUNNER_STATE_PATH:
    process.env.RUNNER_STATE_PATH?.trim() ||
    resolve(process.cwd(), ".agent-center", "runner-state.json"),
  RUNNER_WORKSPACE_ROOT:
    process.env.RUNNER_WORKSPACE_ROOT?.trim() ||
    resolve(process.cwd(), ".agent-center", "runner-workspaces"),
  EXECUTION_BACKEND: (process.env.EXECUTION_BACKEND ?? "local") as "local" | "e2b",
  E2B_API_KEY: process.env.E2B_API_KEY ?? "",
};
