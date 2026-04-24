import { api } from "@agent-center/control-plane/api";
import type {
  DomainMetadata,
  ExecutionConfig,
  ExecutionPolicy,
  PermissionMode,
  SandboxSize,
} from "@agent-center/shared";

import { convexServiceClient } from "../services/convex-service-client";
import { asConvexArgs, asConvexId } from "./convex-repository-utils";

export interface CreateRunRecordInput {
  taskId: string;
  repoConnectionId: string | null;
  prompt: string;
  baseBranch: string | null;
  branchName: string | null;
  sandboxSize: SandboxSize;
  permissionMode: PermissionMode;
  policy: ExecutionPolicy;
  config: ExecutionConfig;
  metadata: DomainMetadata;
  workspacePath?: string | null;
  source: "api" | "retry";
}

export async function findRunById(runId: string) {
  const run = await convexServiceClient.query(api.serviceApi.getRun, {
    runId: asConvexId<"runs">(runId),
  });
  return run ?? undefined;
}

export async function findLatestRunForTask(taskId: string) {
  const run = await convexServiceClient.query(api.serviceApi.getLatestRunForTask, {
    taskId: asConvexId<"tasks">(taskId),
  });
  return run ?? undefined;
}

export async function listRunsForTask(taskId: string) {
  return convexServiceClient.query(api.serviceApi.listRunsForTask, {
    taskId: asConvexId<"tasks">(taskId),
  });
}

export async function listRunEvents(runId: string) {
  return convexServiceClient.query(api.serviceApi.listRunEvents, {
    runId: asConvexId<"runs">(runId),
  });
}

export async function listRunLogEvents(runId: string) {
  return convexServiceClient.query(api.serviceApi.listRunLogEvents, {
    runId: asConvexId<"runs">(runId),
  });
}

export async function createRunRecord(input: CreateRunRecordInput) {
  return convexServiceClient.mutation(api.serviceApi.createRunRecord, {
    taskId: asConvexId<"tasks">(input.taskId),
    repoConnectionId: input.repoConnectionId
      ? asConvexId<"repoConnections">(input.repoConnectionId)
      : null,
    prompt: input.prompt,
    baseBranch: input.baseBranch,
    branchName: input.branchName,
    sandboxSize: input.sandboxSize,
    permissionMode: input.permissionMode,
    policy: input.policy,
    config: input.config,
    metadata: input.metadata,
    workspacePath: input.workspacePath ?? null,
    source: input.source,
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
    runId: asConvexId<"runs">(runId),
    ...asConvexArgs(values),
  });
}

export async function updateRun(runId: string, values: Record<string, unknown>) {
  const run = await convexServiceClient.mutation(api.serviceApi.updateRun, {
    runId: asConvexId<"runs">(runId),
    ...asConvexArgs(values),
  });

  if (run === null) {
    throw new Error(`Failed to update run ${runId}`);
  }

  return run;
}
