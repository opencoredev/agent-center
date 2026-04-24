import { SERVICE_NAMES } from "@agent-center/shared";

import { createApp } from "./app";
import { runnerEnv, runnerRuntimeEnv } from "./env";
import { bootstrapRunnerAuth } from "./lib/runner-bootstrap";
import { RunnerControlService } from "./services/internal/runner-control-service";

async function main() {
  console.log(`[runner] booting ${SERVICE_NAMES.runner} service in ${runnerEnv.NODE_ENV}`);

  const bootstrap = await bootstrapRunnerAuth();
  if (bootstrap.source === "registration") {
    console.log(
      `[runner] registered with cloud API and persisted auth state at ${bootstrap.statePath}`,
    );
  } else if (bootstrap.source === "persisted") {
    console.log(`[runner] using persisted cloud auth token from ${bootstrap.statePath}`);
  } else if (bootstrap.source === "env") {
    console.log("[runner] using cloud auth token from RUNNER_API_TOKEN");
  } else {
    console.warn(
      "[runner] no cloud auth token configured; remote credential resolution is disabled",
    );
  }

  const controlService = new RunnerControlService({
    cleanupMode: runnerRuntimeEnv.RUNNER_CLEANUP_MODE,
    controlPollIntervalMs: runnerRuntimeEnv.RUNNER_CONTROL_POLL_INTERVAL_MS,
    workspaceRoot: runnerRuntimeEnv.RUNNER_WORKSPACE_ROOT,
    executionBackend: runnerRuntimeEnv.EXECUTION_BACKEND,
    e2bApiKey: runnerRuntimeEnv.E2B_API_KEY,
  });
  const app = createApp(controlService, {
    internalAuthToken: runnerRuntimeEnv.RUNNER_INTERNAL_TOKEN,
  });
  const server = Bun.serve({
    fetch: app.fetch,
    hostname: runnerRuntimeEnv.RUNNER_HOST,
    port: runnerRuntimeEnv.RUNNER_PORT,
  });

  process.on("SIGINT", () => {
    console.log("[runner] shutting down");
    server.stop(true);
    process.exit(0);
  });

  console.log(`[runner] ready with log level ${runnerEnv.RUNNER_LOG_LEVEL}`);
  console.log(`[runner] listening on http://${server.hostname}:${server.port}`);
  console.log(`[runner] workspace root ${runnerRuntimeEnv.RUNNER_WORKSPACE_ROOT}`);
}

void main().catch((error) => {
  console.error("[runner] failed to boot", error);
  process.exit(1);
});
