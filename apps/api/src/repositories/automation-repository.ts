import { db, automations } from "@agent-center/db";
import { and, desc, eq, type SQL } from "drizzle-orm";

export interface AutomationListFilters {
  workspaceId?: string;
  projectId?: string;
  enabled?: boolean;
}

export function listAutomations(filters: AutomationListFilters) {
  const conditions: SQL<unknown>[] = [];

  if (filters.workspaceId !== undefined) {
    conditions.push(eq(automations.workspaceId, filters.workspaceId));
  }

  if (filters.projectId !== undefined) {
    conditions.push(eq(automations.projectId, filters.projectId));
  }

  if (filters.enabled !== undefined) {
    conditions.push(eq(automations.enabled, filters.enabled));
  }

  if (conditions.length > 0) {
    return db
      .select()
      .from(automations)
      .where(and(...conditions))
      .orderBy(desc(automations.createdAt));
  }

  return db.select().from(automations).orderBy(desc(automations.createdAt));
}

export async function findAutomationById(automationId: string) {
  return db.query.automations.findFirst({
    where: eq(automations.id, automationId),
  });
}

export async function findAutomationByWorkspaceAndId(workspaceId: string, automationId: string) {
  return db.query.automations.findFirst({
    where: and(eq(automations.workspaceId, workspaceId), eq(automations.id, automationId)),
  });
}

export async function createAutomation(values: typeof automations.$inferInsert) {
  const [automation] = await db.insert(automations).values(values).returning();

  if (automation === undefined) {
    throw new Error("Failed to create automation");
  }

  return automation;
}

export async function updateAutomation(
  automationId: string,
  values: Partial<typeof automations.$inferInsert> & {
    updatedAt: Date;
  },
) {
  const [automation] = await db
    .update(automations)
    .set(values)
    .where(eq(automations.id, automationId))
    .returning();

  if (automation === undefined) {
    throw new Error(`Failed to update automation ${automationId}`);
  }

  return automation;
}
