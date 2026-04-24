import { api } from "@agent-center/control-plane/api";
import type { Id } from "@agent-center/control-plane/data-model";
import type { DomainMetadata } from "@agent-center/shared";

import { convexServiceClient } from "../lib/convex-service-client";
import { mergeMetadata } from "../lib/metadata";
import { getNextCronOccurrence } from "../services/cron";

type RunRecord = Record<string, any>;
type AutomationCandidate = Record<string, any>;

export type ClaimedRun = RunRecord;

export interface AutomationProcessingOutcome {
  automationId: string;
  kind: "initialized" | "triggered";
  nextRunAt: Date;
  runId?: string;
  taskId?: string;
}

function toIsoString(value: Date) {
  return value.toISOString();
}

function buildAutomationMetadata(
  metadata: DomainMetadata,
  projectId: string | null | undefined,
  workerId: string,
  triggeredAt: Date,
  automationId: string,
) {
  const scope = projectId == null ? "workspace" : "project";

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

function createAutomationBranchName(automation: AutomationCandidate, triggeredAt: Date) {
  if (automation.branchPrefix == null) {
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

export async function claimNextQueuedRun(workerId: string): Promise<ClaimedRun | null> {
  return convexServiceClient.mutation(api.serviceApi.claimNextQueuedRun, { workerId });
}

export async function markRunDispatchAccepted(input: {
  endpoint: string;
  responseStatus: number;
  runId: string;
  workerId: string;
}) {
  await convexServiceClient.mutation(api.serviceApi.markRunDispatchAccepted, {
    endpoint: input.endpoint,
    responseStatus: input.responseStatus,
    runId: input.runId as Id<"runs">,
    workerId: input.workerId,
  });
}

export async function markRunDispatchFailed(input: {
  errorMessage: string;
  runId: string;
  workerId: string;
}) {
  await convexServiceClient.mutation(api.serviceApi.markRunDispatchFailed, {
    errorMessage: input.errorMessage,
    runId: input.runId as Id<"runs">,
    workerId: input.workerId,
  });
}

export async function processNextDueAutomation(
  workerId: string,
  now: Date,
): Promise<AutomationProcessingOutcome | null> {
  const candidate = await convexServiceClient.query(api.serviceApi.getDueAutomationCandidate, {
    now: now.getTime(),
  });

  if (!candidate) {
    return null;
  }

  const nextRunAt = getNextCronOccurrence(candidate.cronExpression, now);
  const taskMetadata = buildAutomationMetadata(
    candidate.metadata ?? {},
    candidate.projectId,
    workerId,
    now,
    candidate.id,
  );

  const result = await convexServiceClient.mutation(api.serviceApi.claimAutomationAndCreateRun, {
    automationId: candidate.id as Id<"automations">,
    expectedNextRunAt: candidate.nextRunAt ?? null,
    nextRunAt: nextRunAt.getTime(),
    workerId,
    taskMetadata,
    branchName: createAutomationBranchName(candidate, now),
    now: now.getTime(),
  });

  if (!result) {
    return null;
  }

  return {
    automationId: candidate.id,
    kind: result.kind as "initialized" | "triggered",
    nextRunAt,
    runId: result.run?.id,
    taskId: result.task?.id,
  };
}
