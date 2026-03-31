import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const systemStatus = pgTable("system_status", {
  id: uuid("id").defaultRandom().primaryKey(),
  service: text("service").notNull(),
  status: text("status").notNull().default("bootstrapped"),
  checkedAt: timestamp("checked_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});
