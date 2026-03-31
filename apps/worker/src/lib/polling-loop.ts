import { describeError } from "./errors";

export interface PollingLoopController {
  stop(): void;
}

export function startPollingLoop(options: {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}): PollingLoopController {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (delayMs: number) => {
    timer = setTimeout(() => {
      void tick();
    }, delayMs);
  };

  const tick = async () => {
    if (stopped) {
      return;
    }

    const startedAt = Date.now();

    try {
      await options.run();
    } catch (error) {
      console.error(
        `[worker] ${options.name} loop failed: ${describeError(error)}`,
        error,
      );
    }

    if (stopped) {
      return;
    }

    const elapsedMs = Date.now() - startedAt;
    schedule(Math.max(0, options.intervalMs - elapsedMs));
  };

  console.log(`[worker] starting ${options.name} loop (${options.intervalMs}ms)`);
  schedule(0);

  return {
    stop() {
      stopped = true;

      if (timer !== undefined) {
        clearTimeout(timer);
      }
    },
  };
}
