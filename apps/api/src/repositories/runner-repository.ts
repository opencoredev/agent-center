import { api } from "@agent-center/control-plane/api";

import { convexServiceClient } from "../services/convex-service-client";
import { asConvexArgs, asConvexId } from "./convex-repository-utils";

interface RunnerFilters {
  workspaceId?: string;
}

interface RunnerRegistrationTokenFilters {
  workspaceId?: string;
}

export function listRunners(filters: RunnerFilters = {}) {
  return convexServiceClient.query(api.serviceApi.listRunners, {
    workspaceId: filters.workspaceId ? asConvexId<"workspaces">(filters.workspaceId) : undefined,
  });
}

export async function findRunnerById(runnerId: string) {
  const runner = await convexServiceClient.query(api.serviceApi.getRunner, {
    runnerId: asConvexId<"runners">(runnerId),
  });
  return runner ?? undefined;
}

export async function findRunnerByAuthKeyHash(authKeyHash: string) {
  const runner = await convexServiceClient.query(api.serviceApi.getRunnerByAuthKeyHash, {
    authKeyHash,
  });
  return runner ?? undefined;
}

export async function updateRunner(runnerId: string, values: Record<string, unknown>) {
  const runner = await convexServiceClient.mutation(api.serviceApi.updateRunner, {
    runnerId: asConvexId<"runners">(runnerId),
    ...asConvexArgs(values),
  });
  return runner ?? undefined;
}

export function listRunnerRegistrationTokens(filters: RunnerRegistrationTokenFilters = {}) {
  return convexServiceClient.query(api.serviceApi.listRunnerRegistrationTokens, {
    workspaceId: filters.workspaceId ? asConvexId<"workspaces">(filters.workspaceId) : undefined,
  });
}

export async function findRunnerRegistrationTokenById(registrationTokenId: string) {
  const registrationToken = await convexServiceClient.query(
    api.serviceApi.getRunnerRegistrationToken,
    {
      registrationTokenId: asConvexId<"runnerRegistrationTokens">(registrationTokenId),
    },
  );
  return registrationToken ?? undefined;
}

export async function findActiveRunnerRegistrationTokenByHash(tokenHash: string) {
  const registrationToken = await convexServiceClient.query(
    api.serviceApi.getActiveRunnerRegistrationTokenByHash,
    {
      tokenHash,
    },
  );
  return registrationToken ?? undefined;
}

export async function createRunnerRegistrationToken(values: Record<string, unknown>) {
  const registrationToken = await convexServiceClient.mutation(
    api.serviceApi.createRunnerRegistrationToken,
    asConvexArgs(values),
  );

  if (registrationToken === null) {
    throw new Error("Failed to create runner registration token");
  }

  return registrationToken;
}

export async function updateRunnerRegistrationToken(
  registrationTokenId: string,
  values: Record<string, unknown>,
) {
  const registrationToken = await convexServiceClient.mutation(
    api.serviceApi.updateRunnerRegistrationToken,
    {
      registrationTokenId: asConvexId<"runnerRegistrationTokens">(registrationTokenId),
      ...asConvexArgs(values),
    },
  );
  return registrationToken ?? undefined;
}

export function registerRunnerWithToken(input: {
  tokenHash: string;
  authKeyHash: string;
  authKeyPrefix: string;
  lastSeenAt?: Date | number;
}) {
  return convexServiceClient.mutation(api.serviceApi.registerRunnerWithToken, asConvexArgs(input));
}
