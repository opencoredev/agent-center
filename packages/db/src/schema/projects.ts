import type { DomainMetadata } from "@agent-center/shared";
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { workspaces } from "./workspaces";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, {
        onDelete: "cascade",
      }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    defaultBranch: text("default_branch").notNull().default("main"),
    rootDirectory: text("root_directory"),
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
    index("projects_workspace_id_idx").on(table.workspaceId),
    uniqueIndex("projects_workspace_id_id_idx").on(table.workspaceId, table.id),
    uniqueIndex("projects_workspace_slug_idx").on(table.workspaceId, table.slug),
  ],
);
