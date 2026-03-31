import {
  db,
  projects,
  repoConnections,
  runEvents,
  runs,
  tasks,
  workspaces,
} from "../../../../packages/db/src/index.ts";
import { desc, eq, sql } from "../../../../packages/db/node_modules/drizzle-orm";

import type { DomainMetadata } from "@agent-center/shared";

export interface LoadedRunTarget {
  project: typeof projects.$inferSelect | null;
  repoConnection: typeof repoConnections.$inferSelect | null;
  run: typeof runs.$inferSelect;
  task: typeof tasks.$inferSelect;
  workspace: typeof workspaces.$inferSelect;
}

export async function findRunById(runId: string) {
  return db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });
}

export async function loadRunTarget(runId: string): Promise<LoadedRunTarget | null> {
  const record = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
    with: {
      repoConnection: true,
      task: {
        with: {
          project: true,
          repoConnection: true,
          workspace: true,
        },
      },
    },
  });

  if (!record?.task?.workspace) {
    return null;
  }

  return {
    project: record.task.project ?? null,
    repoConnection: record.repoConnection ?? record.task.repoConnection ?? null,
    run: record,
    task: record.task,
    workspace: record.task.workspace,
  };
}

export async function appendRunEvent(
  runId: string,
  values: Omit<typeof runEvents.$inferInsert, "runId" | "sequence">,
) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.transaction(async (transaction) => {
        await transaction.execute(sql`select id from runs where id = ${runId} for update`);

        const latestEvent = await transaction.query.runEvents.findFirst({
          where: eq(runEvents.runId, runId),
          orderBy: [desc(runEvents.sequence)],
        });

        const [event] = await transaction
          .insert(runEvents)
          .values({
            runId,
            sequence: latestEvent === undefined ? 1 : latestEvent.sequence + 1,
            ...values,
          })
          .returning();

        if (event === undefined) {
          throw new Error(`Failed to append run event for ${runId}`);
        }

        return event;
      });
    } catch (error) {
      if (attempt === maxAttempts || !isSequenceConflict(error)) {
        throw error;
      }
    }
  }

  throw new Error(`Failed to append run event for ${runId}`);
}

export async function updateRun(
  runId: string,
  values: Partial<typeof runs.$inferInsert> & {
    updatedAt: Date;
  },
) {
  const [run] = await db.update(runs).set(values).where(eq(runs.id, runId)).returning();

  if (run === undefined) {
    throw new Error(`Failed to update run ${runId}`);
  }

  return run;
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

export async function updateRunMetadata(
  runId: string,
  updater: (metadata: DomainMetadata) => DomainMetadata,
) {
  const run = await findRunById(runId);

  if (run === undefined) {
    throw new Error(`Run ${runId} was not found while updating metadata`);
  }

  return updateRun(runId, {
    metadata: updater(run.metadata),
    updatedAt: new Date(),
  });
}

function isSequenceConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
