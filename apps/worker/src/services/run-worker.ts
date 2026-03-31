import { describeError } from "../lib/errors";
import {
  claimNextQueuedRun,
  markRunDispatchAccepted,
  markRunDispatchFailed,
} from "../repositories/worker-repository";
import type { RunnerDispatchPayload } from "../runner/client";

export function createRunWorker(options: {
  batchSize: number;
  dispatchRun: (payload: RunnerDispatchPayload) => Promise<{
    accepted: boolean;
    responseStatus: number;
  }>;
  runnerEndpoint: string;
  workerId: string;
}) {
  return {
    async pollOnce() {
      for (let index = 0; index < options.batchSize; index += 1) {
        const run = await claimNextQueuedRun(options.workerId);

        if (run === null) {
          return;
        }

        try {
          const dispatchResult = await options.dispatchRun({
            runId: run.id,
          });

          await markRunDispatchAccepted({
            endpoint: options.runnerEndpoint,
            responseStatus: dispatchResult.responseStatus,
            runId: run.id,
            workerId: options.workerId,
          });

          console.log(
            `[worker] dispatched run ${run.id} (attempt ${run.attempt}) to ${options.runnerEndpoint}`,
          );
        } catch (error) {
          const errorMessage = describeError(error);
          await markRunDispatchFailed({
            errorMessage,
            runId: run.id,
            workerId: options.workerId,
          });
          console.error(`[worker] failed to dispatch run ${run.id}: ${errorMessage}`);
        }
      }
    },
  };
}
