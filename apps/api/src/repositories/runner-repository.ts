import { and, desc, eq, gt, isNull, type SQL } from "drizzle-orm";

import { db, runnerRegistrationTokens, runners } from "@agent-center/db";

interface RunnerFilters {
  workspaceId?: string;
}

interface RunnerRegistrationTokenFilters {
  workspaceId?: string;
}

function buildRunnerFilters(filters: RunnerFilters) {
  const conditions: SQL[] = [];

  if (filters.workspaceId !== undefined) {
    conditions.push(eq(runners.workspaceId, filters.workspaceId));
  }

  return conditions;
}

function buildRunnerRegistrationTokenFilters(filters: RunnerRegistrationTokenFilters) {
  const conditions: SQL[] = [];

  if (filters.workspaceId !== undefined) {
    conditions.push(eq(runnerRegistrationTokens.workspaceId, filters.workspaceId));
  }

  return conditions;
}

export function listRunners(filters: RunnerFilters = {}) {
  const conditions = buildRunnerFilters(filters);

  return db.query.runners.findMany({
    where: conditions.length === 0 ? undefined : and(...conditions),
    orderBy: desc(runners.createdAt),
  });
}

export async function findRunnerById(runnerId: string) {
  return db.query.runners.findFirst({
    where: eq(runners.id, runnerId),
  });
}

export async function findRunnerByAuthKeyHash(authKeyHash: string) {
  return db.query.runners.findFirst({
    where: eq(runners.authKeyHash, authKeyHash),
  });
}

export async function createRunner(values: typeof runners.$inferInsert) {
  const [runner] = await db.insert(runners).values(values).returning();

  if (runner === undefined) {
    throw new Error("Failed to create runner");
  }

  return runner;
}

export async function updateRunner(runnerId: string, values: Partial<typeof runners.$inferInsert>) {
  const [runner] = await db.update(runners).set(values).where(eq(runners.id, runnerId)).returning();

  return runner;
}

export function listRunnerRegistrationTokens(filters: RunnerRegistrationTokenFilters = {}) {
  const conditions = buildRunnerRegistrationTokenFilters(filters);

  return db.query.runnerRegistrationTokens.findMany({
    where: conditions.length === 0 ? undefined : and(...conditions),
    orderBy: desc(runnerRegistrationTokens.createdAt),
  });
}

export async function findRunnerRegistrationTokenById(registrationTokenId: string) {
  return db.query.runnerRegistrationTokens.findFirst({
    where: eq(runnerRegistrationTokens.id, registrationTokenId),
  });
}

export async function findActiveRunnerRegistrationTokenByHash(tokenHash: string) {
  return db.query.runnerRegistrationTokens.findFirst({
    where: and(
      eq(runnerRegistrationTokens.tokenHash, tokenHash),
      isNull(runnerRegistrationTokens.revokedAt),
      isNull(runnerRegistrationTokens.consumedAt),
      gt(runnerRegistrationTokens.expiresAt, new Date()),
    ),
  });
}

export async function createRunnerRegistrationToken(
  values: typeof runnerRegistrationTokens.$inferInsert,
) {
  const [registrationToken] = await db.insert(runnerRegistrationTokens).values(values).returning();

  if (registrationToken === undefined) {
    throw new Error("Failed to create runner registration token");
  }

  return registrationToken;
}

export async function updateRunnerRegistrationToken(
  registrationTokenId: string,
  values: Partial<typeof runnerRegistrationTokens.$inferInsert>,
) {
  const [registrationToken] = await db
    .update(runnerRegistrationTokens)
    .set(values)
    .where(eq(runnerRegistrationTokens.id, registrationTokenId))
    .returning();

  return registrationToken;
}
