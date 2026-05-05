import type {
  DomainMetadata,
  ExecutionConfig,
  ExecutionPolicy,
  PermissionMode,
  SandboxSize,
  TaskStatus,
} from "@agent-center/shared";

import { ApiError, conflictError, notFoundError } from "../http/errors";
import {
  createTask,
  deleteTask,
  findTaskById,
  listTasks,
  updateTask,
} from "../repositories/task-repository";
import { findWorkspaceById } from "../repositories/workspace-repository";
import { findAutomationByWorkspaceAndId } from "../repositories/automation-repository";
import { findLatestRunForTask, updateRun, appendRunEvent } from "../repositories/run-repository";
import { assertLaunchReadyExecutionConfig, isActiveRunStatus, withControlIntent } from "./helpers";
import { projectService } from "./project-service";
import { repoConnectionService } from "./repo-connection-service";
import { runService } from "./run-service";
import { serializeTask } from "./serializers";
import type { RunCreateRequest } from "./run-service";

type TaskRecord = Exclude<Awaited<ReturnType<typeof findTaskById>>, undefined>;

async function assertWorkspaceAccess(workspaceId: string, userId?: string) {
  const workspace = await findWorkspaceById(workspaceId);

  if (workspace === undefined) {
    throw notFoundError("workspace", workspaceId);
  }

  if (userId && workspace.ownerId !== userId) {
    throw new ApiError(403, "workspace_forbidden", "You do not have access to this workspace", {
      workspaceId,
    });
  }

  return workspace;
}

async function assertTaskAccess(task: TaskRecord, userId?: string) {
  await assertWorkspaceAccess(task.workspaceId, userId);
}

export const taskService = {
  async list(
    filters: {
      workspaceId?: string;
      projectId?: string;
      status?: TaskStatus;
      archived?: "exclude" | "include" | "only";
    },
    userId?: string,
  ) {
    if (filters.workspaceId !== undefined) {
      await assertWorkspaceAccess(filters.workspaceId, userId);
    }

    const rawTasks = await listTasks(filters);
    const now = Date.now();
    const retainedTasks = [];
    const workspaceAccess = new Map<string, boolean>();

    for (const task of rawTasks) {
      if (userId && filters.workspaceId === undefined) {
        let hasAccess = workspaceAccess.get(task.workspaceId);

        if (hasAccess === undefined) {
          const workspace = await findWorkspaceById(task.workspaceId);
          hasAccess = workspace?.ownerId === userId;
          workspaceAccess.set(task.workspaceId, hasAccess);
        }

        if (!hasAccess) {
          continue;
        }
      }

      const archivedAt =
        typeof task.metadata?.archivedAt === "string"
          ? new Date(task.metadata.archivedAt).getTime()
          : null;

      if (archivedAt && now - archivedAt >= 30 * 24 * 60 * 60 * 1000) {
        await deleteTask(task.id).catch((error) => {
          console.warn("[task-service] failed to auto-delete archived task", {
            error,
            taskId: task.id,
          });
          return undefined;
        });
        continue;
      }

      const isArchived = archivedAt !== null;
      const archivedFilter = filters.archived ?? "exclude";
      if (archivedFilter === "exclude" && isArchived) continue;
      if (archivedFilter === "only" && !isArchived) continue;

      retainedTasks.push(task);
    }

    return retainedTasks.map(serializeTask);
  },

  async create(
    input: {
      workspaceId: string;
      projectId: string | null;
      repoConnectionId: string | null;
      automationId: string | null;
      title: string;
      prompt: string;
      sandboxSize: SandboxSize;
      permissionMode: PermissionMode;
      baseBranch?: string | null;
      branchName?: string | null;
      policy: ExecutionPolicy;
      config: ExecutionConfig;
      metadata: DomainMetadata;
    },
    userId?: string,
  ) {
    assertLaunchReadyExecutionConfig(input.config);

    await assertWorkspaceAccess(input.workspaceId, userId);

    if (input.projectId !== null) {
      await projectService.assertWithinWorkspace(input.workspaceId, input.projectId);
    }

    if (input.repoConnectionId !== null) {
      await repoConnectionService.assertWithinWorkspace(
        input.workspaceId,
        input.repoConnectionId,
        input.projectId,
      );
    }

    if (input.automationId !== null) {
      const automation = await findAutomationByWorkspaceAndId(
        input.workspaceId,
        input.automationId,
      );

      if (automation === undefined) {
        throw notFoundError("automation", input.automationId);
      }

      if (input.projectId !== automation.projectId) {
        throw new ApiError(
          409,
          "automation_project_mismatch",
          "Automation does not belong to the requested project",
          {
            automationId: input.automationId,
            projectId: input.projectId,
          },
        );
      }

      if (
        input.repoConnectionId !== null &&
        automation.repoConnectionId !== null &&
        automation.repoConnectionId !== input.repoConnectionId
      ) {
        throw new ApiError(
          409,
          "automation_repo_connection_mismatch",
          "Automation repo connection does not match the requested repo connection",
          {
            automationId: input.automationId,
            repoConnectionId: input.repoConnectionId,
          },
        );
      }
    }

    const task = await createTask({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      repoConnectionId: input.repoConnectionId,
      automationId: input.automationId,
      title: input.title,
      prompt: input.prompt,
      sandboxSize: input.sandboxSize,
      permissionMode: input.permissionMode,
      baseBranch: input.baseBranch ?? null,
      branchName: input.branchName ?? null,
      policy: input.policy,
      config: input.config,
      metadata: input.metadata,
    });

    return serializeTask(task);
  },

  async getById(taskId: string, userId?: string) {
    const task = await findTaskById(taskId);

    if (task === undefined) {
      throw notFoundError("task", taskId);
    }

    await assertTaskAccess(task, userId);

    return serializeTask(task);
  },

  async update(
    taskId: string,
    input: { title?: string; metadata?: DomainMetadata },
    userId?: string,
  ) {
    const task = await findTaskById(taskId);

    if (task === undefined) {
      throw notFoundError("task", taskId);
    }

    await assertTaskAccess(task, userId);

    const updatedTask = await updateTask(task.id, {
      title: input.title ?? task.title,
      metadata: input.metadata ?? task.metadata,
      updatedAt: new Date(),
    });

    return serializeTask(updatedTask);
  },

  async cancel(taskId: string, input: { reason?: string | null }, userId?: string) {
    const task = await findTaskById(taskId);

    if (task === undefined) {
      throw notFoundError("task", taskId);
    }

    await assertTaskAccess(task, userId);

    if (task.status === "cancelled") {
      return {
        control: {
          accepted: true,
          applied: true,
          alreadyApplied: true,
          requestedStatus: "cancelled",
        },
        statusCode: 200 as const,
        task: serializeTask(task),
      };
    }

    if (task.status === "completed" || task.status === "failed") {
      throw conflictError(`Task cannot be cancelled from status "${task.status}"`, {
        status: task.status,
        taskId,
      });
    }

    const latestRun = await findLatestRunForTask(task.id);

    if (latestRun === undefined && (task.status === "pending" || task.status === "queued")) {
      const updatedTask = await updateTask(task.id, {
        metadata: withControlIntent(task.metadata, "cancel", {
          applied: true,
          reason: input.reason ?? null,
          requestedAt: new Date().toISOString(),
          requestedStatus: "cancelled",
          source: "api",
        }),
        status: "cancelled",
        updatedAt: new Date(),
      });

      return {
        control: {
          accepted: true,
          applied: true,
          alreadyApplied: false,
          requestedStatus: "cancelled",
        },
        statusCode: 200 as const,
        task: serializeTask(updatedTask),
      };
    }

    if (latestRun !== undefined && !isActiveRunStatus(latestRun.status)) {
      throw conflictError(`Task has no active run to cancel from status "${latestRun.status}"`, {
        runId: latestRun.id,
        status: latestRun.status,
        taskId,
      });
    }

    const requestedAt = new Date().toISOString();
    const updatedTask = await updateTask(task.id, {
      metadata: withControlIntent(task.metadata, "cancel", {
        applied: false,
        reason: input.reason ?? null,
        requestedAt,
        requestedStatus: "cancelled",
        source: "api",
      }),
      status: "cancelled",
      updatedAt: new Date(),
    });

    if (latestRun !== undefined) {
      await updateRun(latestRun.id, {
        status: "cancelled",
        metadata: withControlIntent(latestRun.metadata, "cancel", {
          applied: false,
          reason: input.reason ?? null,
          requestedAt,
          requestedStatus: "cancelled",
          source: "api",
        }),
        updatedAt: new Date(),
      });

      await appendRunEvent(latestRun.id, {
        eventType: "run.status_changed",
        level: "warn",
        message: "Cancellation requested. Stopping the run and keeping current progress visible.",
        payload: {
          applied: false,
          reason: input.reason ?? null,
          requestedAt,
          requestedStatus: "cancelled",
          source: "api",
          taskId: task.id,
        },
      });
    }

    return {
      control: {
        accepted: true,
        applied: false,
        alreadyApplied: false,
        requestedStatus: "cancelled",
      },
      statusCode: 202 as const,
      task: serializeTask(updatedTask),
    };
  },

  async retry(taskId: string, input: Omit<RunCreateRequest, "taskId">, userId?: string) {
    const task = await findTaskById(taskId);

    if (task === undefined) {
      throw notFoundError("task", taskId);
    }

    await assertTaskAccess(task, userId);

    const latestRun = await findLatestRunForTask(task.id);

    if (latestRun !== undefined && isActiveRunStatus(latestRun.status)) {
      throw conflictError("Task already has an active run", {
        runId: latestRun.id,
        status: latestRun.status,
        taskId: task.id,
      });
    }

    return runService.create(
      {
        ...input,
        taskId: task.id,
      },
      "retry",
      userId,
    );
  },
};
