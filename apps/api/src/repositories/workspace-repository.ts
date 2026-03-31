import { db, workspaces } from "@agent-center/db";
import { desc, eq } from "drizzle-orm";

export function listWorkspaces() {
  return db.select().from(workspaces).orderBy(desc(workspaces.createdAt));
}

export async function findWorkspaceById(workspaceId: string) {
  return db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
}

export async function createWorkspace(values: typeof workspaces.$inferInsert) {
  const [workspace] = await db.insert(workspaces).values(values).returning();

  if (workspace === undefined) {
    throw new Error("Failed to create workspace");
  }

  return workspace;
}
