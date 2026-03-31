import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { dbEnv } from "./env";
import * as schema from "./schema";

export const sql = postgres(dbEnv.DATABASE_URL, {
  max: 1,
});

export const db = drizzle(sql, {
  schema,
});
