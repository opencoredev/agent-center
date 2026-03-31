import type { EventType, RunStatus, TaskStatus } from "@agent-center/shared";

import {
  appendRunEvent,
  updateRun,
  updateRunMetadata,
  updateTask,
} from "../../repositories/run-repository";
import type { ControlAction, ControlIntentPayload } from "../../lib/metadata";
import { withControlIntent } from "../../lib/metadata";

interface RunPersistenceOptions {
  runId: string;
  taskId: string;
}

interface StatusTransitionOptions {
  errorMessage?: string | null;
  level?: string;
  message: string;
  payload?: Record<string, unknown>;
  taskStatus?: TaskStatus;
}

interface EventInput {
  eventType: EventType;
  level?: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
}

export class RunPersistence {
  readonly runId: string;
  readonly taskId: string;
  #writeChain: Promise<unknown> = Promise.resolve();

  constructor(options: RunPersistenceOptions) {
    this.runId = options.runId;
    this.taskId = options.taskId;
  }

  enqueue<TValue>(work: () => Promise<TValue>) {
    const next = this.#writeChain.then(work);
    this.#writeChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  flush() {
    return this.#writeChain;
  }

  appendEvent(input: EventInput) {
    return this.enqueue(() =>
      appendRunEvent(this.runId, {
        eventType: input.eventType,
        level: input.level ?? null,
        message: input.message ?? null,
        payload: input.payload ?? null,
      }),
    );
  }

  appendLog(message: string, payload: Record<string, unknown>) {
    return this.appendEvent({
      eventType: "run.log",
      level: payload.stream === "stderr" ? "warn" : "info",
      message,
      payload,
    });
  }

  recordWorkspacePath(workspacePath: string) {
    return this.enqueue(() =>
      updateRun(this.runId, {
        updatedAt: new Date(),
        workspacePath,
      }),
    );
  }

  recordControlIntent(action: ControlAction, payload: ControlIntentPayload) {
    return this.enqueue(() =>
      updateRunMetadata(this.runId, (metadata) => withControlIntent(metadata, action, payload)),
    );
  }

  markControlApplied(action: ControlAction, payload: ControlIntentPayload) {
    return this.enqueue(() =>
      updateRunMetadata(this.runId, (metadata) =>
        withControlIntent(metadata, action, {
          ...payload,
          applied: true,
          appliedAt: new Date().toISOString(),
        }),
      ),
    );
  }

  transitionStatus(status: RunStatus, options: StatusTransitionOptions) {
    return this.enqueue(async () => {
      const now = new Date();
      const runValues: Partial<Parameters<typeof updateRun>[1]> = {
        status,
        updatedAt: now,
      };

      if (status === "provisioning") {
        runValues.startedAt = now;
        runValues.completedAt = null;
        runValues.failedAt = null;
        runValues.errorMessage = null;
      }

      if (status === "completed") {
        runValues.completedAt = now;
        runValues.failedAt = null;
        runValues.errorMessage = null;
      }

      if (status === "failed") {
        runValues.failedAt = now;
        runValues.errorMessage = options.errorMessage ?? options.message;
      }

      if (status === "cancelled") {
        runValues.completedAt = now;
      }

      await updateRun(this.runId, runValues as Parameters<typeof updateRun>[1]);

      if (options.taskStatus) {
        await updateTask(this.taskId, {
          status: options.taskStatus,
          updatedAt: now,
        });
      }

      await appendRunEvent(this.runId, {
        eventType: "run.status_changed",
        level: options.level ?? "info",
        message: options.message,
        payload: {
          status,
          ...options.payload,
        },
      });
    });
  }
}
