import { db, repoConnections } from "@agent-center/db";
import { and, desc, eq, type SQL } from "drizzle-orm";

export interface RepoConnectionListFilters {
  workspaceId?: string;
  projectId?: string;
  provider?: typeof repoConnections.$inferSelect.provider;
}

export function listRepoConnections(filters: RepoConnectionListFilters) {
  const conditions: SQL<unknown>[] = [];

  if (filters.workspaceId !== undefined) {
    conditions.push(eq(repoConnections.workspaceId, filters.workspaceId));
  }

  if (filters.projectId !== undefined) {
    conditions.push(eq(repoConnections.projectId, filters.projectId));
  }

  if (filters.provider !== undefined) {
    conditions.push(eq(repoConnections.provider, filters.provider));
  }

  if (conditions.length > 0) {
    return db
      .select()
      .from(repoConnections)
      .where(and(...conditions))
      .orderBy(desc(repoConnections.createdAt));
  }

  return db.select().from(repoConnections).orderBy(desc(repoConnections.createdAt));
}

export async function findRepoConnectionById(repoConnectionId: string) {
  return db.query.repoConnections.findFirst({
    where: eq(repoConnections.id, repoConnectionId),
  });
}

export async function findRepoConnectionByWorkspaceAndId(
  workspaceId: string,
  repoConnectionId: string,
) {
  return db.query.repoConnections.findFirst({
    where: and(
      eq(repoConnections.workspaceId, workspaceId),
      eq(repoConnections.id, repoConnectionId),
    ),
  });
}

export async function findRepoConnectionByWorkspaceAndRepo(
  workspaceId: string,
  provider: typeof repoConnections.$inferSelect.provider,
  owner: string,
  repo: string,
) {
  return db.query.repoConnections.findFirst({
    where: and(
      eq(repoConnections.workspaceId, workspaceId),
      eq(repoConnections.provider, provider),
      eq(repoConnections.owner, owner),
      eq(repoConnections.repo, repo),
    ),
    orderBy: desc(repoConnections.createdAt),
  });
}

export async function createRepoConnection(values: typeof repoConnections.$inferInsert) {
  const [repoConnection] = await db.insert(repoConnections).values(values).returning();

  if (repoConnection === undefined) {
    throw new Error("Failed to create repo connection");
  }

  return repoConnection;
}

export async function updateRepoConnection(
  repoConnectionId: string,
  values: Partial<typeof repoConnections.$inferInsert>,
) {
  const [repoConnection] = await db
    .update(repoConnections)
    .set(values)
    .where(eq(repoConnections.id, repoConnectionId))
    .returning();

  if (repoConnection === undefined) {
    throw new Error(`Failed to update repo connection ${repoConnectionId}`);
  }

  return repoConnection;
}

export async function deleteRepoConnection(repoConnectionId: string) {
  const [repoConnection] = await db
    .delete(repoConnections)
    .where(eq(repoConnections.id, repoConnectionId))
    .returning();

  if (repoConnection === undefined) {
    throw new Error(`Failed to delete repo connection ${repoConnectionId}`);
  }

  return repoConnection;
}
