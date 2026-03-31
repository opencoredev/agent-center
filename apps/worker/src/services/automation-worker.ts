import { describeError } from "../lib/errors";
import { processNextDueAutomation } from "../repositories/worker-repository";

export function createAutomationWorker(options: {
  batchSize: number;
  workerId: string;
}) {
  return {
    async pollOnce() {
      for (let index = 0; index < options.batchSize; index += 1) {
        const now = new Date();

        try {
          const outcome = await processNextDueAutomation(options.workerId, now);

          if (outcome === null) {
            return;
          }

          if (outcome.kind === "initialized") {
            console.log(
              `[worker] initialized automation ${outcome.automationId}; next run at ${outcome.nextRunAt.toISOString()}`,
            );
            continue;
          }

          console.log(
            `[worker] automation ${outcome.automationId} created task ${outcome.taskId} and run ${outcome.runId}; next run at ${outcome.nextRunAt.toISOString()}`,
          );
        } catch (error) {
          const errorMessage = describeError(error);
          console.error(`[worker] failed to process due automation: ${errorMessage}`, error);
          return;
        }
      }
    },
  };
}
