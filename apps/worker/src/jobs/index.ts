import { startPollingLoop, type PollingLoopController } from "../lib/polling-loop";
import { createRunnerClient } from "../runner/client";
import { createAutomationWorker } from "../services/automation-worker";
import { createRunWorker } from "../services/run-worker";

export interface WorkerServiceController {
  stop(): void;
}

export function startWorkerService(options: {
  automationBatchSize: number;
  automationPollMs: number;
  runBatchSize: number;
  runPollMs: number;
  runnerBaseUrl: string;
  runnerDispatchTimeoutMs: number;
  workerId: string;
}): WorkerServiceController {
  const runnerClient = createRunnerClient({
    baseUrl: options.runnerBaseUrl,
    dispatchTimeoutMs: options.runnerDispatchTimeoutMs,
  });
  const runWorker = createRunWorker({
    batchSize: options.runBatchSize,
    dispatchRun: runnerClient.dispatchRun,
    runnerEndpoint: runnerClient.endpoint,
    workerId: options.workerId,
  });
  const automationWorker = createAutomationWorker({
    batchSize: options.automationBatchSize,
    workerId: options.workerId,
  });
  const loops: PollingLoopController[] = [
    startPollingLoop({
      name: "run-dispatch",
      intervalMs: options.runPollMs,
      run: async () => {
        await runWorker.pollOnce();
      },
    }),
    startPollingLoop({
      name: "automation-scheduler",
      intervalMs: options.automationPollMs,
      run: async () => {
        await automationWorker.pollOnce();
      },
    }),
  ];

  return {
    stop() {
      for (const loop of loops) {
        loop.stop();
      }
    },
  };
}
