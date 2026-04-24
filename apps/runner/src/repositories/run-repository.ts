import { api } from "@agent-center/control-plane/api";
import type { Id } from "@agent-center/control-plane/data-model";
import type { DomainMetadata } from "@agent-center/shared";

import { convexServiceClient } from "../lib/convex-service-client";

type ApiRecord = Record<string, any>;

export interface LoadedRunTarget {
  project: ApiRecord | null;
  repoConnection: ApiRecord | null;
  run: ApiRecord;
  task: ApiRecord;
  workspace: ApiRecord;
}

function normalizeConvexInput<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value instanceof Date ? value.getTime() : value]),
  ) as any;
}

export async function findRunById(runId: string) {
  const run = await convexServiceClient.query(api.serviceApi.getRun, {
    runId: runId as Id<"runs">,
  });
  return run ?? undefined;
}

export async function loadRunTarget(runId: string): Promise<LoadedRunTarget | null> {
  return convexServiceClient.query(api.serviceApi.getRunTarget, {
    runId: runId as Id<"runs">,
  });
}

export async function appendRunEvent(
  runId: string,
  values: {
    eventType: string;
    level?: string | null;
    message?: string | null;
    payload?: unknown;
    createdAt?: Date | number;
  },
) {
  return convexServiceClient.mutation(api.serviceApi.appendRunEvent, {
    runId: runId as Id<"runs">,
    ...normalizeConvexInput(values),
  });
}

export async function updateRun(
  runId: string,
  values: Record<string, unknown> & {
    updatedAt: Date | number;
  },
) {
  const run = await convexServiceClient.mutation(api.serviceApi.updateRun, {
    runId: runId as Id<"runs">,
    ...normalizeConvexInput(values),
  });

  if (run === null) {
    throw new Error(`Failed to update run ${runId}`);
  }

  return run;
}

export async function updateTask(
  taskId: string,
  values: Record<string, unknown> & {
    updatedAt: Date | number;
  },
) {
  const task = await convexServiceClient.mutation(api.serviceApi.updateTask, {
    taskId: taskId as Id<"tasks">,
    ...normalizeConvexInput(values),
  });

  if (task === null) {
    throw new Error(`Failed to update task ${taskId}`);
  }

  return task;
}

export async function updateRunMetadata(
  runId: string,
  updater: (metadata: DomainMetadata) => DomainMetadata,
) {
  const run = await findRunById(runId);

  if (run === undefined) {
    throw new Error(`Run ${runId} was not found while updating metadata`);
  }

  return updateRun(runId, {
    metadata: updater(run.metadata ?? {}),
    updatedAt: new Date(),
  });
}
