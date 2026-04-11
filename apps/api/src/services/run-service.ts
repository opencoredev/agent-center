import type {
  DomainMetadata,
  ExecutionConfig,
  ExecutionPolicy,
  PermissionMode,
  RunStatus,
  SandboxSize,
} from "@agent-center/shared";

import { ApiError, conflictError, notFoundError } from "../http/errors";
import {
  appendRunEvent,
  createRunRecord,
  findLatestRunForTask,
  findRunById,
  listRunEvents,
  listRunLogEvents,
  listRunsForTask,
  updateRun,
} from "../repositories/run-repository";
import { findTaskById } from "../repositories/task-repository";
import { assertLaunchReadyExecutionConfig, isActiveRunStatus, mergeMetadata, withControlIntent } from "./helpers";
import { serializeRun, serializeRunEvent } from "./serializers";

interface RunCreateRequest {
  taskId: string;
  prompt?: string | null;
  baseBranch?: string | null;
  branchName?: string | null;
  sandboxSize?: SandboxSize;
  permissionMode?: PermissionMode;
  policy?: ExecutionPolicy;
  config?: ExecutionConfig;
  metadata?: DomainMetadata;
}

interface RunControlResponse {
  control: {
    accepted: true;
    applied: false;
    reason: string | null | undefined;
    requestedStatus: "paused" | "running";
  };
  run: ReturnType<typeof serializeRun>;
  statusCode: 202;
}

function assertPauseable(status: RunStatus) {
  if (!["queued", "provisioning", "cloning", "running"].includes(status)) {
    throw conflictError(`Run cannot be paused from status "${status}"`, {
      status,
    });
  }
}

export const runService = {
  async create(input: RunCreateRequest, source: "api" | "retry" = "api") {
    const task = await findTaskById(input.taskId);

    if (task === undefined) {
      throw notFoundError("task", input.taskId);
    }

    const latestRun = await findLatestRunForTask(task.id);

    if (latestRun !== undefined && isActiveRunStatus(latestRun.status)) {
      throw conflictError("Task already has an active run", {
        runId: latestRun.id,
        status: latestRun.status,
        taskId: task.id,
      });
    }

    const nextConfig = input.config ?? task.config;
    assertLaunchReadyExecutionConfig(nextConfig);

    const run = await createRunRecord({
      taskId: task.id,
      repoConnectionId: task.repoConnectionId,
      prompt: input.prompt ?? task.prompt,
      baseBranch: input.baseBranch ?? task.baseBranch,
      branchName: input.branchName ?? task.branchName,
      sandboxSize: input.sandboxSize ?? task.sandboxSize,
      permissionMode: input.permissionMode ?? task.permissionMode,
      policy: input.policy ?? task.policy,
      config: nextConfig,
      metadata: mergeMetadata(task.metadata, input.metadata),
      source,
    });

    return serializeRun(run);
  },

  async getById(runId: string) {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    return serializeRun(run);
  },

  async listByTask(taskId: string) {
    const task = await findTaskById(taskId);

    if (task === undefined) {
      throw notFoundError("task", taskId);
    }

    const taskRuns = await listRunsForTask(taskId);
    return taskRuns.map(serializeRun);
  },

  async listEvents(runId: string) {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    const events = await listRunEvents(runId);

    return events.map(serializeRunEvent);
  },

  async listLogs(runId: string) {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    const events = await listRunLogEvents(runId);

    return events.map(serializeRunEvent);
  },

  async pause(runId: string, input: { reason?: string | null }): Promise<RunControlResponse> {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    if (run.status === "paused") {
      throw conflictError("Run is already paused", {
        runId,
      });
    }

    assertPauseable(run.status);

    const requestedAt = new Date().toISOString();
    const updatedRun = await updateRun(run.id, {
      metadata: withControlIntent(run.metadata, "pause", {
        applied: false,
        reason: input.reason ?? null,
        requestedAt,
        requestedStatus: "paused",
        source: "api",
      }),
      updatedAt: new Date(),
    });

    await appendRunEvent(run.id, {
      eventType: "run.status_changed",
      level: "warn",
      message: "Pause requested via API",
      payload: {
        applied: false,
        reason: input.reason ?? null,
        requestedAt,
        requestedStatus: "paused",
        source: "api",
      },
    });

    return {
      run: serializeRun(updatedRun),
      control: {
        accepted: true,
        applied: false,
        reason: input.reason,
        requestedStatus: "paused",
      },
      statusCode: 202,
    };
  },

  async resume(runId: string, input: { reason?: string | null }): Promise<RunControlResponse> {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    if (run.status !== "paused") {
      throw new ApiError(409, "run_not_paused", "Run can only be resumed from paused status", {
        runId,
        status: run.status,
      });
    }

    const requestedAt = new Date().toISOString();
    const updatedRun = await updateRun(run.id, {
      metadata: withControlIntent(run.metadata, "resume", {
        applied: false,
        reason: input.reason ?? null,
        requestedAt,
        requestedStatus: "running",
        source: "api",
      }),
      updatedAt: new Date(),
    });

    await appendRunEvent(run.id, {
      eventType: "run.status_changed",
      level: "info",
      message: "Resume requested via API",
      payload: {
        applied: false,
        reason: input.reason ?? null,
        requestedAt,
        requestedStatus: "running",
        source: "api",
      },
    });

    return {
      run: serializeRun(updatedRun),
      control: {
        accepted: true,
        applied: false,
        reason: input.reason,
        requestedStatus: "running",
      },
      statusCode: 202,
    };
  },
};

export type { RunCreateRequest };
