import type { DomainMetadata } from "@agent-center/shared";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { eventTypeEnum } from "./enums";
import { runs } from "./runs";

export const runEvents = pgTable(
  "run_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, {
        onDelete: "cascade",
      }),
    sequence: integer("sequence").notNull(),
    eventType: eventTypeEnum("event_type").notNull(),
    level: text("level"),
    message: text("message"),
    payload: jsonb("payload").$type<DomainMetadata | null>(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("run_events_run_id_idx").on(table.runId),
    index("run_events_run_id_created_at_idx").on(table.runId, table.createdAt),
    index("run_events_event_type_idx").on(table.eventType),
    uniqueIndex("run_events_run_sequence_idx").on(table.runId, table.sequence),
  ],
);
