import { api } from "@agent-center/control-plane/api";

import { convexServiceClient } from "../services/convex-service-client";
import { asConvexArgs, asConvexId } from "./convex-repository-utils";

export function listWorkspaces() {
  return convexServiceClient.query(api.serviceApi.listWorkspaces);
}

export async function findWorkspaceById(workspaceId: string) {
  const workspace = await convexServiceClient.query(api.serviceApi.getWorkspaceById, {
    workspaceId: asConvexId<"workspaces">(workspaceId),
  });
  return workspace ?? undefined;
}

export async function createWorkspace(values: Record<string, unknown>) {
  const workspace = await convexServiceClient.mutation(
    api.serviceApi.createWorkspace,
    asConvexArgs(values),
  );

  if (workspace === null) {
    throw new Error("Failed to create workspace");
  }

  return workspace;
}
