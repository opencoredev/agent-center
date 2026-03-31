import type {
  DomainMetadata,
  ExecutionConfig,
  ExecutionPolicy,
  PermissionMode,
  SandboxSize,
  TaskStatus,
} from "@agent-center/shared";

import { ApiError, conflictError, notFoundError } from "../http/errors";
import { createTask, findTaskById, listTasks, updateTask } from "../repositories/task-repository";
import { findWorkspaceById } from "../repositories/workspace-repository";
import { findAutomationByWorkspaceAndId } from "../repositories/automation-repository";
import { findLatestRunForTask, updateRun, appendRunEvent } from "../repositories/run-repository";
import { isActiveRunStatus, withControlIntent } from "./helpers";
import { projectService } from "./project-service";
import { repoConnectionService } from "./repo-connection-service";
import { runService } from "./run-service";
import { serializeTask } from "./serializers";
import type { RunCreateRequest } from "./run-service";

export const taskService = {
  async list(filters: { workspaceId?: string; projectId?: string; status?: TaskStatus }) {
    const tasks = await listTasks(filters);

    return tasks.map(serializeTask);
  },

  async create(input: {
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
  }) {
    const workspace = await findWorkspaceById(input.workspaceId);

    if (workspace === undefined) {
      throw notFoundError("workspace", input.workspaceId);
    }

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

  async getById(taskId: string) {
    const task = await findTaskById(taskId);

    if (task === undefined) {
      throw notFoundError("task", taskId);
    }

    return serializeTask(task);
  },

  async cancel(taskId: string, input: { reason?: string | null }) {
    const task = await findTaskById(taskId);

    if (task === undefined) {
      throw notFoundError("task", taskId);
    }

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
      updatedAt: new Date(),
    });

    if (latestRun !== undefined) {
      await updateRun(latestRun.id, {
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
        message: "Cancellation requested via API",
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

  async retry(taskId: string, input: Omit<RunCreateRequest, "taskId">) {
    const task = await findTaskById(taskId);

    if (task === undefined) {
      throw notFoundError("task", taskId);
    }

    const latestRun = await findLatestRunForTask(taskId);

    if (latestRun !== undefined && isActiveRunStatus(latestRun.status)) {
      throw conflictError("Task already has an active run", {
        runId: latestRun.id,
        status: latestRun.status,
        taskId,
      });
    }

    return runService.create(
      {
        ...input,
        taskId,
      },
      "retry",
    );
  },
};
