import type { DomainMetadata, ExecutionConfig, ExecutionPolicy } from "@agent-center/shared";
import { sql } from "drizzle-orm";
import {
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

import { automations } from "./automations";
import { permissionModeEnum, sandboxSizeEnum, taskStatusEnum } from "./enums";
import { projects } from "./projects";
import { repoConnections } from "./repo-connections";
import { workspaces } from "./workspaces";

export const tasks = pgTable(
  "tasks",
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
    automationId: uuid("automation_id").references(() => automations.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    status: taskStatusEnum("status").notNull().default("pending"),
    sandboxSize: sandboxSizeEnum("sandbox_size").notNull().default("medium"),
    permissionMode: permissionModeEnum("permission_mode").notNull().default("safe"),
    baseBranch: text("base_branch"),
    branchName: text("branch_name"),
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
    index("tasks_workspace_status_idx").on(table.workspaceId, table.status),
    index("tasks_project_status_idx").on(table.projectId, table.status),
    index("tasks_repo_connection_id_idx").on(table.repoConnectionId),
    index("tasks_automation_id_idx").on(table.automationId),
    index("tasks_created_at_idx").on(table.createdAt),
    uniqueIndex("tasks_id_repo_connection_id_idx").on(table.id, table.repoConnectionId),
    foreignKey({
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
      name: "tasks_workspace_id_project_id_projects_workspace_id_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.repoConnectionId],
      foreignColumns: [repoConnections.workspaceId, repoConnections.id],
      name: "tasks_workspace_id_repo_connection_id_repo_connections_workspace_id_id_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.projectId, table.repoConnectionId],
      foreignColumns: [repoConnections.workspaceId, repoConnections.projectId, repoConnections.id],
      name: "tasks_workspace_id_project_id_repo_connection_id_repo_connections_workspace_project_id_id_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.projectId, table.automationId],
      foreignColumns: [automations.workspaceId, automations.projectId, automations.id],
      name: "tasks_workspace_id_project_id_automation_id_automations_workspace_project_id_id_fk",
    }),
    check(
      "tasks_project_required_for_repo_connection_check",
      sql`${table.repoConnectionId} IS NULL OR ${table.projectId} IS NOT NULL`,
    ),
    check(
      "tasks_project_required_for_automation_check",
      sql`${table.automationId} IS NULL OR ${table.projectId} IS NOT NULL`,
    ),
  ],
);
