import { api } from "@agent-center/control-plane/api";
import type { TaskStatus } from "@agent-center/shared";

import { convexServiceClient } from "../services/convex-service-client";
import { asConvexArgs, asConvexId } from "./convex-repository-utils";

export interface TaskListFilters {
  workspaceId?: string;
  projectId?: string;
  status?: TaskStatus;
}

export function listTasks(filters: TaskListFilters) {
  return convexServiceClient.query(api.serviceApi.listTasks, {
    workspaceId: filters.workspaceId ? asConvexId<"workspaces">(filters.workspaceId) : undefined,
    projectId: filters.projectId ? asConvexId<"projects">(filters.projectId) : undefined,
    status: filters.status,
  });
}

export async function findTaskById(taskId: string) {
  try {
    const task = await convexServiceClient.query(api.serviceApi.getTask, {
      taskId: asConvexId<"tasks">(taskId),
    });

    if (task !== null) {
      return task;
    }
  } catch (error) {
    if (!isTaskIdValidationError(error)) {
      throw error;
    }
  }

  const task = (await listTasks({})).find(
    (candidate) => candidate.id === taskId || candidate.threadId === taskId,
  );
  return task ?? undefined;
}

function isTaskIdValidationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    (message.includes("ArgumentValidationError") && message.includes("tasks")) ||
    message.includes("does not match v.id(\"tasks\")") ||
    message.includes("does not match the table name in validator")
  );
}

export async function findTaskByGitHubDeliveryId(deliveryId: string) {
  const task = await convexServiceClient.query(api.serviceApi.getTaskByGitHubDeliveryId, {
    deliveryId,
  });
  return task ?? undefined;
}

export async function createTask(values: Record<string, unknown>) {
  const task = await convexServiceClient.mutation(api.serviceApi.createTask, asConvexArgs(values));

  if (task === null) {
    throw new Error("Failed to create task");
  }

  return task;
}

export async function updateTask(taskId: string, values: Record<string, unknown>) {
  const task = await convexServiceClient.mutation(api.serviceApi.updateTask, {
    taskId: asConvexId<"tasks">(taskId),
    ...asConvexArgs(values),
  });

  if (task === null) {
    throw new Error(`Failed to update task ${taskId}`);
  }

  return task;
}

export async function deleteTask(taskId: string) {
  const task = await convexServiceClient.mutation(api.serviceApi.deleteTask, {
    taskId: asConvexId<"tasks">(taskId),
  });

  if (task === null) {
    throw new Error(`Failed to delete task ${taskId}`);
  }

  return task;
}
