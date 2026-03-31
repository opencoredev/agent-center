import { db, runEvents, runs, tasks } from "@agent-center/db";
import { and, desc, eq, inArray } from "drizzle-orm";

import type {
  DomainMetadata,
  ExecutionConfig,
  ExecutionPolicy,
  PermissionMode,
  SandboxSize,
} from "@agent-center/shared";

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
  source: "api" | "retry";
}

export async function findRunById(runId: string) {
  return db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });
}

export async function findLatestRunForTask(taskId: string) {
  return db.query.runs.findFirst({
    where: eq(runs.taskId, taskId),
    orderBy: [desc(runs.attempt)],
  });
}

export async function listRunEvents(runId: string) {
  return db.query.runEvents.findMany({
    where: eq(runEvents.runId, runId),
    orderBy: [runEvents.sequence],
  });
}

export async function listRunLogEvents(runId: string) {
  return db.query.runEvents.findMany({
    where: and(
      eq(runEvents.runId, runId),
      inArray(runEvents.eventType, ["run.log", "run.command.started", "run.command.finished"]),
    ),
    orderBy: [runEvents.sequence],
  });
}

export async function createRunRecord(input: CreateRunRecordInput) {
  return db.transaction(async (transaction) => {
    const latestRun = await transaction.query.runs.findFirst({
      where: eq(runs.taskId, input.taskId),
      orderBy: [desc(runs.attempt)],
    });

    const attempt = latestRun === undefined ? 1 : latestRun.attempt + 1;

    const [run] = await transaction
      .insert(runs)
      .values({
        taskId: input.taskId,
        repoConnectionId: input.repoConnectionId,
        status: "queued",
        attempt,
        prompt: input.prompt,
        baseBranch: input.baseBranch,
        branchName: input.branchName,
        sandboxSize: input.sandboxSize,
        permissionMode: input.permissionMode,
        policy: input.policy,
        config: input.config,
        metadata: input.metadata,
      })
      .returning();

    if (run === undefined) {
      throw new Error("Failed to create run");
    }

    await transaction
      .update(tasks)
      .set({
        status: "queued",
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, input.taskId));

    await transaction.insert(runEvents).values({
      runId: run.id,
      sequence: 1,
      eventType: "run.created",
      message: input.source === "retry" ? "Run queued via task retry" : "Run queued via API",
      payload: {
        attempt,
        source: input.source,
        taskId: input.taskId,
      },
    });

    return run;
  });
}

export async function appendRunEvent(
  runId: string,
  values: Omit<typeof runEvents.$inferInsert, "runId" | "sequence">,
) {
  return db.transaction(async (transaction) => {
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
