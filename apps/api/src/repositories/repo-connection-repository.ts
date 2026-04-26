import { api } from "@agent-center/control-plane/api";
import type { RepoProvider } from "@agent-center/shared";

import { convexServiceClient } from "../services/convex-service-client";
import { asConvexArgs, asConvexId } from "./convex-repository-utils";

export interface RepoConnectionListFilters {
  workspaceId?: string;
  projectId?: string;
  provider?: RepoProvider;
}

export function listRepoConnections(filters: RepoConnectionListFilters) {
  return convexServiceClient.query(api.serviceApi.listRepoConnections, {
    workspaceId: filters.workspaceId ? asConvexId<"workspaces">(filters.workspaceId) : undefined,
    projectId: filters.projectId ? asConvexId<"projects">(filters.projectId) : undefined,
    provider: filters.provider,
  });
}

export async function findRepoConnectionById(repoConnectionId: string) {
  const repoConnection = await convexServiceClient.query(api.serviceApi.getRepoConnectionById, {
    repoConnectionId: asConvexId<"repoConnections">(repoConnectionId),
  });
  return repoConnection ?? undefined;
}

export async function findRepoConnectionByWorkspaceAndId(
  workspaceId: string,
  repoConnectionId: string,
) {
  const repoConnection = await convexServiceClient.query(
    api.serviceApi.getRepoConnectionByWorkspaceAndId,
    {
      workspaceId: asConvexId<"workspaces">(workspaceId),
      repoConnectionId: asConvexId<"repoConnections">(repoConnectionId),
    },
  );
  return repoConnection ?? undefined;
}

export async function findRepoConnectionByWorkspaceAndRepo(
  workspaceId: string,
  provider: RepoProvider,
  owner: string,
  repo: string,
) {
  const repoConnections = await listRepoConnections({ workspaceId, provider });
  return repoConnections.find(
    (repoConnection) => repoConnection.owner === owner && repoConnection.repo === repo,
  );
}

export async function findGitHubAppRepoConnectionByRepository(input: {
  owner: string;
  repo: string;
  installationId: number;
}) {
  const repoConnection = await convexServiceClient.query(
    api.serviceApi.getGitHubAppRepoConnectionByRepository,
    input,
  );
  return repoConnection ?? undefined;
}

export async function createRepoConnection(values: Record<string, unknown>) {
  const repoConnection = await convexServiceClient.mutation(
    api.serviceApi.createRepoConnection,
    asConvexArgs(values),
  );

  if (repoConnection === null) {
    throw new Error("Failed to create repo connection");
  }

  return repoConnection;
}

export async function updateRepoConnection(
  repoConnectionId: string,
  values: Record<string, unknown>,
) {
  const repoConnection = await convexServiceClient.mutation(api.serviceApi.updateRepoConnection, {
    repoConnectionId: asConvexId<"repoConnections">(repoConnectionId),
    ...asConvexArgs(values),
  });

  if (repoConnection === null) {
    throw new Error(`Failed to update repo connection ${repoConnectionId}`);
  }

  return repoConnection;
}

export async function deleteRepoConnection(repoConnectionId: string) {
  const repoConnection = await convexServiceClient.mutation(api.serviceApi.deleteRepoConnection, {
    repoConnectionId: asConvexId<"repoConnections">(repoConnectionId),
  });

  if (repoConnection === null) {
    throw new Error(`Failed to delete repo connection ${repoConnectionId}`);
  }

  return repoConnection;
}
