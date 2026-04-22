import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";
import { workspaces } from "./workspaces";

export const runnerRegistrationTokens = pgTable(
  "runner_registration_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, {
        onDelete: "cascade",
      }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),
    consumedAt: timestamp("consumed_at", {
      withTimezone: true,
    }),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
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
    index("runner_registration_tokens_workspace_id_idx").on(table.workspaceId),
    uniqueIndex("runner_registration_tokens_workspace_id_id_idx").on(table.workspaceId, table.id),
    uniqueIndex("runner_registration_tokens_token_hash_idx").on(table.tokenHash),
  ],
);
