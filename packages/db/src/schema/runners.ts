import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";
import { workspaces } from "./workspaces";

export const runners = pgTable(
  "runners",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, {
        onDelete: "cascade",
      }),
    name: text("name").notNull(),
    authKeyHash: text("auth_key_hash").notNull(),
    authKeyPrefix: text("auth_key_prefix").notNull(),
    lastSeenAt: timestamp("last_seen_at", {
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
    index("runners_workspace_id_idx").on(table.workspaceId),
    uniqueIndex("runners_workspace_id_id_idx").on(table.workspaceId, table.id),
    uniqueIndex("runners_auth_key_hash_idx").on(table.authKeyHash),
  ],
);
