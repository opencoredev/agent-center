import { SERVICE_NAMES } from "@agent-center/shared";

import { createApp } from "./app";
import { runnerEnv, runnerRuntimeEnv } from "./env";
import { RunnerControlService } from "./services/internal/runner-control-service";

console.log(`[runner] booting ${SERVICE_NAMES.runner} service in ${runnerEnv.NODE_ENV}`);

const controlService = new RunnerControlService({
  cleanupMode: runnerRuntimeEnv.RUNNER_CLEANUP_MODE,
  controlPollIntervalMs: runnerRuntimeEnv.RUNNER_CONTROL_POLL_INTERVAL_MS,
  workspaceRoot: runnerRuntimeEnv.RUNNER_WORKSPACE_ROOT,
  executionBackend: runnerRuntimeEnv.EXECUTION_BACKEND,
  e2bApiKey: runnerRuntimeEnv.E2B_API_KEY,
});
const app = createApp(controlService);
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
