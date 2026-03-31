import type { DomainMetadata, ExecutionConfig, ExecutionPolicy } from "@agent-center/shared";
import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { permissionModeEnum, runStatusEnum, sandboxSizeEnum } from "./enums";
import { repoConnections } from "./repo-connections";
import { tasks } from "./tasks";

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, {
        onDelete: "cascade",
      }),
    repoConnectionId: uuid("repo_connection_id").references(() => repoConnections.id, {
      onDelete: "set null",
    }),
    status: runStatusEnum("status").notNull().default("queued"),
    attempt: integer("attempt").notNull().default(1),
    prompt: text("prompt").notNull(),
    baseBranch: text("base_branch"),
    branchName: text("branch_name"),
    sandboxSize: sandboxSizeEnum("sandbox_size").notNull(),
    permissionMode: permissionModeEnum("permission_mode").notNull(),
    policy: jsonb("policy")
      .$type<ExecutionPolicy>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    config: jsonb("config")
      .$type<ExecutionConfig>()
      .notNull()
      .default(sql`'{"commands":[]}'::jsonb`),
    metadata: jsonb("metadata")
      .$type<DomainMetadata>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at", {
      withTimezone: true,
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
    }),
    failedAt: timestamp("failed_at", {
      withTimezone: true,
    }),
    errorMessage: text("error_message"),
    workspacePath: text("workspace_path"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("runs_task_id_idx").on(table.taskId),
    index("runs_status_idx").on(table.status),
    index("runs_repo_connection_id_idx").on(table.repoConnectionId),
    index("runs_created_at_idx").on(table.createdAt),
    uniqueIndex("runs_task_attempt_idx").on(table.taskId, table.attempt),
    foreignKey({
      columns: [table.taskId, table.repoConnectionId],
      foreignColumns: [tasks.id, tasks.repoConnectionId],
      name: "runs_task_id_repo_connection_id_tasks_id_repo_connection_id_fk",
    }),
  ],
);
