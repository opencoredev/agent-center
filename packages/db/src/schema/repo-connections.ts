import type { DomainMetadata, RepoAuthType } from "@agent-center/shared";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { foreignKey } from "drizzle-orm/pg-core";

import { repoProviderEnum } from "./enums";
import { projects } from "./projects";
import { workspaces } from "./workspaces";

export const repoConnections = pgTable(
  "repo_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, {
        onDelete: "cascade",
      }),
    projectId: uuid("project_id"),
    provider: repoProviderEnum("provider").notNull().default("github"),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    defaultBranch: text("default_branch"),
    authType: text("auth_type").$type<RepoAuthType>().notNull(),
    connectionMetadata: jsonb("connection_metadata").$type<DomainMetadata | null>(),
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
    index("repo_connections_workspace_id_idx").on(table.workspaceId),
    index("repo_connections_project_id_idx").on(table.projectId),
    index("repo_connections_provider_owner_repo_idx").on(table.provider, table.owner, table.repo),
    uniqueIndex("repo_connections_workspace_id_id_idx").on(table.workspaceId, table.id),
    uniqueIndex("repo_connections_workspace_project_id_id_idx").on(
      table.workspaceId,
      table.projectId,
      table.id,
    ),
    uniqueIndex("repo_connections_workspace_provider_owner_repo_idx").on(
      table.workspaceId,
      table.provider,
      table.owner,
      table.repo,
    ),
    foreignKey({
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
      name: "repo_connections_workspace_id_project_id_projects_workspace_id_id_fk",
    }).onDelete("cascade"),
  ],
);
