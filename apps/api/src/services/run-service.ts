import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

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
import {
  assertLaunchReadyExecutionConfig,
  isActiveRunStatus,
  mergeMetadata,
  withControlIntent,
  withoutControlMetadata,
} from "./helpers";
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

interface RunDiffResponse {
  available: boolean;
  error: string | null;
  hasChanges: boolean;
  patch: string | null;
  stats: string | null;
  statusLines: string[];
  workspacePath: string | null;
}

const MAX_UNTRACKED_DIFF_FILES = 20;

async function runGitCommand(workspacePath: string, args: string[]) {
  const subprocess = Bun.spawn({
    cmd: ["git", ...args],
    cwd: workspacePath,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    subprocess.stdout ? new Response(subprocess.stdout).text() : Promise.resolve(""),
    subprocess.stderr ? new Response(subprocess.stderr).text() : Promise.resolve(""),
    subprocess.exited,
  ]);

  return {
    exitCode,
    stderr: stderr.trim(),
    stdout: stdout.trim(),
  };
}

async function getUntrackedFiles(workspacePath: string) {
  const status = await runGitCommand(workspacePath, ["status", "--short", "--untracked-files=all"]);

  return status.stdout
    .split("\n")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).trim())
    .map((line) => {
      if (line.startsWith('"') && line.endsWith('"')) {
        try {
          return JSON.parse(line) as string;
        } catch {
          return line.slice(1, -1);
        }
      }

      return line;
    })
    .filter(Boolean);
}

async function buildUntrackedDiff(workspacePath: string, files: string[]) {
  const patches: string[] = [];
  const stats: string[] = [];

  for (const file of files.slice(0, MAX_UNTRACKED_DIFF_FILES)) {
    const patch = await runGitCommand(workspacePath, ["diff", "--patch", "--no-index", "--", "/dev/null", file]);
    if (patch.stdout) {
      patches.push(patch.stdout);
    }

    const stat = await runGitCommand(workspacePath, ["diff", "--stat", "--no-index", "--", "/dev/null", file]);
    if (stat.stdout) {
      stats.push(stat.stdout);
    }
  }

  return {
    patch: patches.join("\n"),
    stats: stats.join("\n"),
  };
}

function resolveWorkspacePath(workspacePath: string) {
  const candidates = isAbsolute(workspacePath)
    ? [workspacePath]
    : [
        resolve(process.cwd(), workspacePath),
        resolve(process.cwd(), "..", "runner", workspacePath),
        resolve(process.cwd(), "..", "..", "apps", "runner", workspacePath),
      ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function readWorkspaceDiff(workspacePath: string): Promise<RunDiffResponse> {
  const resolvedWorkspacePath = resolveWorkspacePath(workspacePath);
  if (!resolvedWorkspacePath) {
    return {
      available: false,
      error: "Run workspace is not accessible from the API process in this deployment.",
      hasChanges: false,
      patch: null,
      stats: null,
      statusLines: [],
      workspacePath: null,
    };
  }

  const status = await runGitCommand(resolvedWorkspacePath, ["status", "--short", "--untracked-files=all"]);

  if (status.exitCode !== 0) {
    return {
      available: false,
      error: status.stderr || "Git status failed for this run workspace.",
      hasChanges: false,
      patch: null,
      stats: null,
      statusLines: [],
      workspacePath: resolvedWorkspacePath,
    };
  }

  const untrackedFiles = await getUntrackedFiles(resolvedWorkspacePath);

  let patch = await runGitCommand(resolvedWorkspacePath, ["diff", "--patch", "--minimal", "HEAD", "--"]);
  let stats = await runGitCommand(resolvedWorkspacePath, ["diff", "--stat", "--minimal", "HEAD", "--"]);

  let missingHead =
    patch.exitCode !== 0 &&
    (patch.stderr.includes("ambiguous argument 'HEAD'") || patch.stderr.includes("bad revision 'HEAD'"));

  if (missingHead) {
    patch = await runGitCommand(resolvedWorkspacePath, ["diff", "--patch", "--minimal", "--"]);
    stats = await runGitCommand(resolvedWorkspacePath, ["diff", "--stat", "--minimal", "--"]);
    missingHead = false;
  }

  const untrackedDiff = await buildUntrackedDiff(resolvedWorkspacePath, untrackedFiles);
  const combinedPatch = [patch.stdout, untrackedDiff.patch].filter(Boolean).join("\n");
  const truncatedUntrackedCount = Math.max(0, untrackedFiles.length - MAX_UNTRACKED_DIFF_FILES);
  const combinedStats = [
    stats.stdout,
    untrackedDiff.stats,
    truncatedUntrackedCount > 0
      ? `... ${truncatedUntrackedCount} additional untracked file${truncatedUntrackedCount === 1 ? "" : "s"} omitted`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    available: true,
    error:
      patch.exitCode !== 0 && !missingHead
        ? (patch.stderr || "Git diff failed for this run workspace.")
        : null,
    hasChanges: status.stdout.length > 0 || combinedPatch.length > 0,
    patch: combinedPatch || null,
    stats: combinedStats || null,
    statusLines: status.stdout.length > 0 ? status.stdout.split("\n").filter(Boolean) : [],
    workspacePath: resolvedWorkspacePath,
  };
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
    const reusableWorkspacePath = latestRun?.workspacePath ?? null;

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
      metadata: mergeMetadata(withoutControlMetadata(task.metadata), input.metadata),
      workspacePath: reusableWorkspacePath,
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

  async getDiff(runId: string): Promise<RunDiffResponse> {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    if (!run.workspacePath) {
      return {
        available: false,
        error: "No workspace is available for this run yet.",
        hasChanges: false,
        patch: null,
        stats: null,
        statusLines: [],
        workspacePath: null,
      };
    }

    return readWorkspaceDiff(run.workspacePath);
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
