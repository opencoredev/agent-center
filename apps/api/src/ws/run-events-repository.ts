import { api } from "@agent-center/control-plane/api";
import type { Id } from "@agent-center/control-plane/data-model";
import type { EventType, RunEventSpec } from "@agent-center/shared";

import { convexServiceClient } from "../services/convex-service-client";

interface RunEventRow {
  runId: string;
  eventType: EventType;
  sequence: number;
  level: string | null;
  message: string | null;
  payload: RunEventSpec["payload"];
  createdAt: number;
}

export async function listRunEventsAfter(
  runId: string,
  afterSequence: number,
  limit: number,
): Promise<RunEventSpec[]> {
  const rows = await convexServiceClient.query(api.serviceApi.listRunEventsAfter, {
    runId: runId as Id<"runs">,
    afterSequence,
    limit,
  });

  return (rows as unknown as RunEventRow[]).map((row) => ({
    runId: row.runId,
    eventType: row.eventType,
    sequence: row.sequence,
    level: row.level,
    message: row.message,
    payload: row.payload,
    createdAt: toISOString(row.createdAt),
  }));
}

function toISOString(value: number): string {
  return new Date(value).toISOString();
}
