import { SERVICE_NAMES } from "@agent-center/shared";
import { sql } from "@agent-center/db";

import { workerEnv } from "./env";
import { startWorkerService } from "./jobs";

console.log(`[worker] booting ${SERVICE_NAMES.worker} service in ${workerEnv.NODE_ENV}`);
console.log(
  `[worker] config workerId=${workerEnv.WORKER_ID} runPoll=${workerEnv.WORKER_RUN_POLL_MS}ms automationPoll=${workerEnv.WORKER_AUTOMATION_POLL_MS}ms runner=${workerEnv.RUNNER_INTERNAL_BASE_URL}`,
);

const workerService = startWorkerService({
  automationBatchSize: workerEnv.WORKER_AUTOMATION_BATCH_SIZE,
  automationPollMs: workerEnv.WORKER_AUTOMATION_POLL_MS,
  runBatchSize: workerEnv.WORKER_RUN_BATCH_SIZE,
  runPollMs: workerEnv.WORKER_RUN_POLL_MS,
  runnerBaseUrl: workerEnv.RUNNER_INTERNAL_BASE_URL,
  runnerDispatchTimeoutMs: workerEnv.RUNNER_DISPATCH_TIMEOUT_MS,
  runnerInternalToken: workerEnv.RUNNER_INTERNAL_TOKEN,
  workerId: workerEnv.WORKER_ID,
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[worker] received ${signal}; shutting down`);
  workerService.stop();
  await sql.end();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

// Minimal health server so Railway knows we're alive
const healthPort = Number(process.env.PORT) || 3001;
Bun.serve({
  port: healthPort,
  hostname: "0.0.0.0",
  fetch() {
    return Response.json({ service: "worker", status: "ok" });
  },
});

console.log(`[worker] health server on :${healthPort}`);
console.log(`[worker] ready with log level ${workerEnv.WORKER_LOG_LEVEL}`);
