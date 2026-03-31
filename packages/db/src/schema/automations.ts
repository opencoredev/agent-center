import type { AutomationConfig, DomainMetadata, ExecutionPolicy } from "@agent-center/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { permissionModeEnum, sandboxSizeEnum } from "./enums";
import { projects } from "./projects";
import { repoConnections } from "./repo-connections";
import { workspaces } from "./workspaces";

export const automations = pgTable(
  "automations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, {
        onDelete: "cascade",
      }),
    projectId: uuid("project_id"),
    repoConnectionId: uuid("repo_connection_id").references(() => repoConnections.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    cronExpression: text("cron_expression").notNull(),
    taskTemplateTitle: text("task_template_title").notNull(),
    taskTemplatePrompt: text("task_template_prompt").notNull(),
    sandboxSize: sandboxSizeEnum("sandbox_size").notNull().default("medium"),
    permissionMode: permissionModeEnum("permission_mode").notNull().default("safe"),
    branchPrefix: text("branch_prefix"),
    policy: jsonb("policy")
      .$type<ExecutionPolicy>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    config: jsonb("config")
      .$type<AutomationConfig>()
      .notNull()
      .default(sql`'{"commands":[]}'::jsonb`),
    metadata: jsonb("metadata")
      .$type<DomainMetadata>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastRunAt: timestamp("last_run_at", {
      withTimezone: true,
    }),
    nextRunAt: timestamp("next_run_at", {
      withTimezone: true,
    }),
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
    index("automations_workspace_id_idx").on(table.workspaceId),
    index("automations_project_id_idx").on(table.projectId),
    index("automations_repo_connection_id_idx").on(table.repoConnectionId),
    index("automations_enabled_next_run_at_idx").on(table.enabled, table.nextRunAt),
    uniqueIndex("automations_workspace_name_idx").on(table.workspaceId, table.name),
    uniqueIndex("automations_workspace_project_id_id_idx").on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
      name: "automations_workspace_id_project_id_projects_workspace_id_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.repoConnectionId],
      foreignColumns: [repoConnections.workspaceId, repoConnections.id],
      name: "automations_workspace_id_repo_connection_id_repo_connections_workspace_id_id_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.projectId, table.repoConnectionId],
      foreignColumns: [repoConnections.workspaceId, repoConnections.projectId, repoConnections.id],
      name: "automations_workspace_id_project_id_repo_connection_id_repo_connections_workspace_project_id_id_fk",
    }),
    check(
      "automations_project_required_for_repo_connection_check",
      sql`${table.repoConnectionId} IS NULL OR ${table.projectId} IS NOT NULL`,
    ),
  ],
);
