import { api } from "@agent-center/control-plane/api";

import { convexServiceClient } from "../services/convex-service-client";
import { asConvexArgs, asConvexId } from "./convex-repository-utils";

export function listGitHubAppInstallations(workspaceId: string) {
  return convexServiceClient.query(api.serviceApi.listGitHubAppInstallations, {
    workspaceId: asConvexId<"workspaces">(workspaceId),
  });
}

export async function upsertGitHubAppInstallation(values: Record<string, unknown>) {
  const installation = await convexServiceClient.mutation(
    api.serviceApi.upsertGitHubAppInstallation,
    asConvexArgs(values),
  );

  if (installation === null) {
    throw new Error("Failed to upsert GitHub App installation link");
  }

  return installation;
}

export function createGitHubAppInstallState(values: {
  workspaceId: string;
  userId: string;
  stateHash: string;
  expiresAt: number;
}) {
  return convexServiceClient.mutation(api.serviceApi.createGitHubAppInstallState, {
    workspaceId: asConvexId<"workspaces">(values.workspaceId),
    userId: asConvexId<"users">(values.userId),
    stateHash: values.stateHash,
    expiresAt: values.expiresAt,
  });
}

export function consumeGitHubAppInstallState(values: {
  workspaceId: string;
  userId: string;
  stateHash: string;
}) {
  return convexServiceClient.mutation(api.serviceApi.consumeGitHubAppInstallState, {
    workspaceId: asConvexId<"workspaces">(values.workspaceId),
    userId: asConvexId<"users">(values.userId),
    stateHash: values.stateHash,
  });
}
