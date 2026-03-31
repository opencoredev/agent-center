import { db } from "./client";
import { workspaces } from "./schema";

export async function seed() {
  console.log("[db] checking seed data");

  const existing = await db.query.workspaces.findFirst();

  if (!existing) {
    await db.insert(workspaces).values({
      name: "Default Workspace",
      slug: "default",
      description: "Auto-created workspace for self-hosted mode",
    });
    console.log("[db] created default workspace");
  } else {
    console.log("[db] workspace already exists, skipping seed");
  }

  console.log("[db] seed complete");
}
