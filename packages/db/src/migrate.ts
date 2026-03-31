import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { loadRootEnv } from "@agent-center/config";

import { db, sql } from "./client";
import { seed } from "./seed";

loadRootEnv();

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

console.log("[db] running migrations");

await migrate(db, {
  migrationsFolder,
});

console.log("[db] migrations complete");

await seed();

await sql.end();
console.log("[db] done");
