import { startPollingLoop, type PollingLoopController } from "../lib/polling-loop";
import { describeError } from "../lib/errors";
import { checkControlPlaneReady } from "../repositories/worker-repository";
import { createRunnerClient } from "../runner/client";
import { createAutomationWorker } from "../services/automation-worker";
import { createRunWorker } from "../services/run-worker";

export interface WorkerServiceController {
  stop(): void;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForControlPlaneReady() {
  let attempts = 0;

  for (;;) {
    attempts += 1;

    try {
      await checkControlPlaneReady();
      if (attempts > 1) {
        console.log("[worker] Convex control plane is ready");
      }
      return;
    } catch (error) {
      if (attempts === 1) {
        console.log("[worker] waiting for Convex control plane functions");
      }

      if (attempts % 10 === 0) {
        console.warn(`[worker] still waiting for Convex control plane: ${describeError(error)}`);
      }

      await sleep(2_000);
    }
  }
}

export async function startWorkerService(options: {
  automationBatchSize: number;
  automationPollMs: number;
  runBatchSize: number;
  runPollMs: number;
  runnerBaseUrl: string;
  runnerDispatchTimeoutMs: number;
  runnerInternalToken: string;
  workerId: string;
}): Promise<WorkerServiceController> {
  await waitForControlPlaneReady();

  const runnerClient = createRunnerClient({
    baseUrl: options.runnerBaseUrl,
    dispatchTimeoutMs: options.runnerDispatchTimeoutMs,
    internalAuthToken: options.runnerInternalToken,
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
