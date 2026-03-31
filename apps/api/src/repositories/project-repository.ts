import { db, projects } from "@agent-center/db";
import { and, desc, eq, type SQL } from "drizzle-orm";

export interface ProjectListFilters {
  workspaceId?: string;
}

export function listProjects(filters: ProjectListFilters) {
  const conditions: SQL<unknown>[] = [];

  if (filters.workspaceId !== undefined) {
    conditions.push(eq(projects.workspaceId, filters.workspaceId));
  }

  if (conditions.length > 0) {
    return db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.createdAt));
  }

  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

export async function findProjectById(projectId: string) {
  return db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
}

export async function findProjectByWorkspaceAndId(workspaceId: string, projectId: string) {
  return db.query.projects.findFirst({
    where: and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)),
  });
}

export async function createProject(values: typeof projects.$inferInsert) {
  const [project] = await db.insert(projects).values(values).returning();

  if (project === undefined) {
    throw new Error("Failed to create project");
  }

  return project;
}
