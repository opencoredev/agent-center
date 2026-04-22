import { db, tasks } from "@agent-center/db";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";

export interface TaskListFilters {
  workspaceId?: string;
  projectId?: string;
  status?: typeof tasks.$inferSelect.status;
}

export function listTasks(filters: TaskListFilters) {
  const conditions: SQL<unknown>[] = [];

  if (filters.workspaceId !== undefined) {
    conditions.push(eq(tasks.workspaceId, filters.workspaceId));
  }

  if (filters.projectId !== undefined) {
    conditions.push(eq(tasks.projectId, filters.projectId));
  }

  if (filters.status !== undefined) {
    conditions.push(eq(tasks.status, filters.status));
  }

  if (conditions.length > 0) {
    return db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt));
  }

  return db.select().from(tasks).orderBy(desc(tasks.createdAt));
}

export async function findTaskById(taskId: string) {
  return db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
}

export async function findTaskByGitHubDeliveryId(deliveryId: string) {
  return db.query.tasks.findFirst({
    where: sql`${tasks.metadata} -> 'github' ->> 'deliveryId' = ${deliveryId}`,
    orderBy: desc(tasks.createdAt),
  });
}

export async function createTask(values: typeof tasks.$inferInsert) {
  const [task] = await db.insert(tasks).values(values).returning();

  if (task === undefined) {
    throw new Error("Failed to create task");
  }

  return task;
}

export async function updateTask(
  taskId: string,
  values: Partial<typeof tasks.$inferInsert> & {
    updatedAt: Date;
  },
) {
  const [task] = await db.update(tasks).set(values).where(eq(tasks.id, taskId)).returning();

  if (task === undefined) {
    throw new Error(`Failed to update task ${taskId}`);
  }

  return task;
}

export async function deleteTask(taskId: string) {
  const [task] = await db.delete(tasks).where(eq(tasks.id, taskId)).returning();

  if (task === undefined) {
    throw new Error(`Failed to delete task ${taskId}`);
  }

  return task;
}
