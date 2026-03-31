import { resolve } from "node:path";

import { host, loadRootEnv, logLevel, nodeEnv, parseEnv, port } from "@agent-center/config";

loadRootEnv();

export const runnerEnv = parseEnv(
  {
    NODE_ENV: process.env.NODE_ENV,
    RUNNER_HOST: process.env.RUNNER_HOST,
    RUNNER_LOG_LEVEL: process.env.RUNNER_LOG_LEVEL,
    RUNNER_PORT: process.env.RUNNER_PORT,
  },
  {
    NODE_ENV: nodeEnv,
    RUNNER_HOST: host.default("127.0.0.1"),
    RUNNER_LOG_LEVEL: logLevel,
    RUNNER_PORT: port.default(3002),
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
  RUNNER_CLEANUP_MODE: parseCleanupMode(process.env.RUNNER_CLEANUP_MODE),
  RUNNER_CONTROL_POLL_INTERVAL_MS: parsePollInterval(process.env.RUNNER_CONTROL_POLL_INTERVAL_MS),
  RUNNER_WORKSPACE_ROOT:
    process.env.RUNNER_WORKSPACE_ROOT?.trim() || resolve(process.cwd(), ".agent-center", "runner-workspaces"),
  EXECUTION_BACKEND: (process.env.EXECUTION_BACKEND ?? "local") as "local" | "e2b",
  E2B_API_KEY: process.env.E2B_API_KEY ?? "",
};
