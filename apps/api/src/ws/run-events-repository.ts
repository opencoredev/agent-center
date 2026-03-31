import { loadRootEnv, parseEnv } from "@agent-center/config";
import type { EventType, RunEventSpec } from "@agent-center/shared";
import { z } from "zod";

interface RunEventRow {
  runId: string;
  eventType: EventType;
  sequence: number;
  level: string | null;
  message: string | null;
  payload: RunEventSpec["payload"];
  createdAt: string | Date;
}

loadRootEnv();

const realtimeDbEnv = parseEnv(
  {
    DATABASE_URL: process.env.DATABASE_URL,
  },
  {
    DATABASE_URL: z.url(),
  },
);

let sqlClient: Bun.SQL | null = null;

export async function listRunEventsAfter(
  runId: string,
  afterSequence: number,
  limit: number,
): Promise<RunEventSpec[]> {
  const rows = await getSqlClient()<RunEventRow[]>`
    select
      run_id as "runId",
      event_type as "eventType",
      sequence,
      level,
      message,
      payload,
      created_at as "createdAt"
    from run_events
    where run_id = ${runId}
      and sequence > ${afterSequence}
    order by sequence asc
    limit ${limit}
  `;

  return rows.map((row) => ({
    runId: row.runId,
    eventType: row.eventType,
    sequence: row.sequence,
    level: row.level,
    message: row.message,
    payload: row.payload,
    createdAt: toISOString(row.createdAt),
  }));
}

function toISOString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function getSqlClient() {
  if (sqlClient === null) {
    sqlClient = new Bun.SQL(realtimeDbEnv.DATABASE_URL, {
      max: 1,
    });
  }

  return sqlClient;
}
