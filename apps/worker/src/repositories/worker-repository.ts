import {
  automations,
  db,
  projects,
  repoConnections,
  runEvents,
  runs,
  tasks,
} from "@agent-center/db";
import type { DomainMetadata } from "@agent-center/shared";
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";

import { mergeMetadata } from "../lib/metadata";
import { getNextCronOccurrence } from "../services/cron";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type RunRecord = typeof runs.$inferSelect;
type AutomationRecord = typeof automations.$inferSelect;
type ProjectRecord = typeof projects.$inferSelect;
type RepoConnectionRecord = typeof repoConnections.$inferSelect;

export type ClaimedRun = RunRecord;

export interface AutomationProcessingOutcome {
  automationId: string;
  kind: "initialized" | "triggered";
  nextRunAt: Date;
  runId?: string;
  taskId?: string;
}

interface AutomationCandidate extends AutomationRecord {
  project: ProjectRecord | null;
  repoConnection: RepoConnectionRecord | null;
}

function toIsoString(value: Date) {
  return value.toISOString();
}

function buildDispatchMetadata(metadata: DomainMetadata, workerId: string, claimedAt: Date) {
  return mergeMetadata(metadata, {
    dispatch: {
      ...(typeof metadata.dispatch === "object" &&
      metadata.dispatch !== null &&
      !Array.isArray(metadata.dispatch)
        ? metadata.dispatch
        : {}),
      claimedAt: toIsoString(claimedAt),
      claimedBy: workerId,
      state: "claimed",
    },
  });
}

async function getNextRunEventSequence(transaction: DbTransaction, runId: string) {
  const latestEvent = await transaction.query.runEvents.findFirst({
    where: eq(runEvents.runId, runId),
    orderBy: [desc(runEvents.sequence)],
  });

  return latestEvent === undefined ? 1 : latestEvent.sequence + 1;
}

async function appendRunEventTx(
  transaction: DbTransaction,
  runId: string,
  values: Omit<typeof runEvents.$inferInsert, "runId" | "sequence">,
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await transaction.execute(
      sql`select ${runs.id} from ${runs} where ${runs.id} = ${runId} for update`,
    );

    const sequence = await getNextRunEventSequence(transaction, runId);
    const [event] = await transaction
      .insert(runEvents)
      .values({
        runId,
        sequence,
        ...values,
      })
      .onConflictDoNothing({
        target: [runEvents.runId, runEvents.sequence],
      })
      .returning();

    if (event !== undefined) {
      return event;
    }
  }

  throw new Error(`Failed to append run event for ${runId} after retrying sequence allocation`);
}

function buildAutomationMetadata(
  metadata: DomainMetadata,
  projectId: string | null,
  workerId: string,
  triggeredAt: Date,
  automationId: string,
) {
  const scope = projectId === null ? "workspace" : "project";

  return mergeMetadata(metadata, {
    automation: {
      id: automationId,
      scope,
      taskLink: scope === "workspace" ? "metadata_only" : "relational",
      triggeredAt: toIsoString(triggeredAt),
      workerId,
    },
  });
}

function sanitizeBranchSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
}

function createAutomationBranchName(
  automation: AutomationCandidate,
  triggeredAt: Date,
) {
  if (automation.branchPrefix === null) {
    return null;
  }

  const prefix = sanitizeBranchSegment(automation.branchPrefix);

  if (prefix.length === 0) {
    return null;
  }

  const timestamp = toIsoString(triggeredAt)
    .replaceAll(":", "")
    .replaceAll(".", "")
    .toLowerCase();

  return `${prefix}/${timestamp}`;
}

async function findDueAutomationCandidate(transaction: DbTransaction, now: Date) {
  return transaction.query.automations.findFirst({
    where: and(
      eq(automations.enabled, true),
      or(lte(automations.nextRunAt, now), isNull(automations.nextRunAt)),
    ),
    with: {
      project: true,
      repoConnection: true,
    },
    orderBy: [asc(automations.nextRunAt), asc(automations.createdAt)],
  }) as Promise<AutomationCandidate | undefined>;
}

export async function claimNextQueuedRun(workerId: string): Promise<ClaimedRun | null> {
  return db.transaction(async (transaction: DbTransaction) => {
    const candidate = await transaction.query.runs.findFirst({
      where: eq(runs.status, "queued"),
      orderBy: [asc(runs.createdAt), asc(runs.id)],
    });

    if (candidate === undefined) {
      return null;
    }

    const claimedAt = new Date();
    const [claimedRun] = await transaction
      .update(runs)
      .set({
        status: "provisioning",
        startedAt: candidate.startedAt ?? claimedAt,
        metadata: buildDispatchMetadata(candidate.metadata, workerId, claimedAt),
        updatedAt: claimedAt,
      })
      .where(and(eq(runs.id, candidate.id), eq(runs.status, "queued")))
      .returning();

    if (claimedRun === undefined) {
      return null;
    }

    await transaction
      .update(tasks)
      .set({
        status: "running",
        updatedAt: claimedAt,
      })
      .where(eq(tasks.id, claimedRun.taskId));

    await appendRunEventTx(transaction, claimedRun.id, {
      eventType: "run.status_changed",
      level: "info",
      message: "Run claimed by worker and marked provisioning",
      payload: {
        claimedAt: toIsoString(claimedAt),
        previousStatus: "queued",
        status: "provisioning",
        workerId,
      },
    });

    return claimedRun;
  });
}

export async function markRunDispatchAccepted(input: {
  endpoint: string;
  responseStatus: number;
  runId: string;
  workerId: string;
}) {
  await db.transaction(async (transaction: DbTransaction) => {
    const run = await transaction.query.runs.findFirst({
      where: eq(runs.id, input.runId),
    });

    if (run === undefined) {
      throw new Error(`Run ${input.runId} no longer exists`);
    }

    const dispatchedAt = new Date();
    await transaction
      .update(runs)
      .set({
        metadata: mergeMetadata(run.metadata, {
          dispatch: {
            ...(typeof run.metadata.dispatch === "object" &&
            run.metadata.dispatch !== null &&
            !Array.isArray(run.metadata.dispatch)
              ? run.metadata.dispatch
              : {}),
            dispatchedAt: toIsoString(dispatchedAt),
            endpoint: input.endpoint,
            responseStatus: input.responseStatus,
            state: "dispatched",
            workerId: input.workerId,
          },
        }),
        updatedAt: dispatchedAt,
      })
      .where(eq(runs.id, input.runId));

    await appendRunEventTx(transaction, input.runId, {
      eventType: "run.log",
      level: "info",
      message: "Run dispatch accepted by runner",
      payload: {
        dispatchedAt: toIsoString(dispatchedAt),
        endpoint: input.endpoint,
        responseStatus: input.responseStatus,
        workerId: input.workerId,
      },
    });
  });
}

export async function markRunDispatchFailed(input: {
  errorMessage: string;
  runId: string;
  workerId: string;
}) {
  await db.transaction(async (transaction: DbTransaction) => {
    const run = await transaction.query.runs.findFirst({
      where: eq(runs.id, input.runId),
    });

    if (run === undefined) {
      throw new Error(`Run ${input.runId} no longer exists`);
    }

    const failedAt = new Date();
    await transaction
      .update(runs)
      .set({
        status: "failed",
        errorMessage: input.errorMessage,
        failedAt,
        metadata: mergeMetadata(run.metadata, {
          dispatch: {
            ...(typeof run.metadata.dispatch === "object" &&
            run.metadata.dispatch !== null &&
            !Array.isArray(run.metadata.dispatch)
              ? run.metadata.dispatch
              : {}),
            failedAt: toIsoString(failedAt),
            failureReason: input.errorMessage,
            state: "dispatch_failed",
            workerId: input.workerId,
          },
        }),
        updatedAt: failedAt,
      })
      .where(eq(runs.id, input.runId));

    await transaction
      .update(tasks)
      .set({
        status: "failed",
        updatedAt: failedAt,
      })
      .where(eq(tasks.id, run.taskId));

    await appendRunEventTx(transaction, input.runId, {
      eventType: "run.status_changed",
      level: "error",
      message: "Run failed before execution because dispatch to runner failed",
      payload: {
        failedAt: toIsoString(failedAt),
        previousStatus: run.status,
        reason: input.errorMessage,
        status: "failed",
        workerId: input.workerId,
      },
    });

    await appendRunEventTx(transaction, input.runId, {
      eventType: "run.failed",
      level: "error",
      message: input.errorMessage,
      payload: {
        failedAt: toIsoString(failedAt),
        phase: "dispatch",
        workerId: input.workerId,
      },
    });
  });
}

export async function processNextDueAutomation(
  workerId: string,
  now: Date,
): Promise<AutomationProcessingOutcome | null> {
  return db.transaction(async (transaction: DbTransaction) => {
    const candidate = await findDueAutomationCandidate(transaction, now);

    if (candidate === undefined) {
      return null;
    }

    const nextRunAt = getNextCronOccurrence(candidate.cronExpression, now);
    const claimedCondition =
      candidate.nextRunAt === null
        ? isNull(automations.nextRunAt)
        : eq(automations.nextRunAt, candidate.nextRunAt);

    const [claimedAutomation] = await transaction
      .update(automations)
      .set({
        lastRunAt: candidate.nextRunAt === null ? candidate.lastRunAt : now,
        nextRunAt,
        updatedAt: now,
      })
      .where(and(eq(automations.id, candidate.id), eq(automations.enabled, true), claimedCondition))
      .returning();

    if (claimedAutomation === undefined) {
      return null;
    }

    if (candidate.nextRunAt === null) {
      return {
        automationId: claimedAutomation.id,
        kind: "initialized",
        nextRunAt,
      };
    }

    const taskAutomationId = candidate.projectId === null ? null : candidate.id;
    const taskMetadata = buildAutomationMetadata(
      candidate.metadata,
      candidate.projectId,
      workerId,
      now,
      candidate.id,
    );
    const [task] = await transaction
      .insert(tasks)
      .values({
        workspaceId: candidate.workspaceId,
        projectId: candidate.projectId,
        repoConnectionId: candidate.repoConnectionId,
        automationId: taskAutomationId,
        title: candidate.taskTemplateTitle,
        prompt: candidate.taskTemplatePrompt,
        status: "pending",
        sandboxSize: candidate.sandboxSize,
        permissionMode: candidate.permissionMode,
        baseBranch:
          candidate.repoConnection?.defaultBranch ?? candidate.project?.defaultBranch ?? null,
        branchName: createAutomationBranchName(candidate, now),
        policy: candidate.policy,
        config: candidate.config,
        metadata: taskMetadata,
      })
      .returning();

    if (task === undefined) {
      throw new Error(`Failed to create task for automation ${candidate.id}`);
    }

    const [run] = await transaction
      .insert(runs)
      .values({
        taskId: task.id,
        repoConnectionId: task.repoConnectionId,
        status: "queued",
        attempt: 1,
        prompt: task.prompt,
        baseBranch: task.baseBranch,
        branchName: task.branchName,
        sandboxSize: task.sandboxSize,
        permissionMode: task.permissionMode,
        policy: task.policy,
        config: task.config,
        metadata: task.metadata,
      })
      .returning();

    if (run === undefined) {
      throw new Error(`Failed to create run for automation ${candidate.id}`);
    }

    await transaction
      .update(tasks)
      .set({
        status: "queued",
        updatedAt: now,
      })
      .where(eq(tasks.id, task.id));

    await transaction.insert(runEvents).values([
      {
        runId: run.id,
        sequence: 1,
        eventType: "run.created",
        message: "Run queued via automation",
        payload: {
          attempt: run.attempt,
          automationId: candidate.id,
          source: "automation",
          taskId: task.id,
        },
      },
      {
        runId: run.id,
        sequence: 2,
        eventType: "automation.triggered",
        level: "info",
        message: `Automation "${candidate.name}" triggered a task and run`,
        payload: {
          automationId: candidate.id,
          nextRunAt: toIsoString(nextRunAt),
          taskId: task.id,
          triggeredAt: toIsoString(now),
          workerId,
        },
      },
    ]);

    return {
      automationId: claimedAutomation.id,
      kind: "triggered",
      nextRunAt,
      runId: run.id,
      taskId: task.id,
    };
  });
}
