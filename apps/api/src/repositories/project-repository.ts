import { api } from "@agent-center/control-plane/api";

import { convexServiceClient } from "../services/convex-service-client";
import { asConvexArgs, asConvexId } from "./convex-repository-utils";

export interface ProjectListFilters {
  workspaceId?: string;
}

export function listProjects(filters: ProjectListFilters) {
  return convexServiceClient.query(api.serviceApi.listProjects, {
    workspaceId: filters.workspaceId
      ? asConvexId<"workspaces">(filters.workspaceId)
      : undefined,
  });
}

export async function findProjectById(projectId: string) {
  const project = await convexServiceClient.query(api.serviceApi.getProjectById, {
    projectId: asConvexId<"projects">(projectId),
  });
  return project ?? undefined;
}

export async function findProjectByWorkspaceAndId(workspaceId: string, projectId: string) {
  const project = await convexServiceClient.query(api.serviceApi.getProjectByWorkspaceAndId, {
    workspaceId: asConvexId<"workspaces">(workspaceId),
    projectId: asConvexId<"projects">(projectId),
  });
  return project ?? undefined;
}

export async function findProjectByWorkspaceAndSlug(workspaceId: string, slug: string) {
  const project = await convexServiceClient.query(api.serviceApi.getProjectByWorkspaceAndSlug, {
    workspaceId: asConvexId<"workspaces">(workspaceId),
    slug,
  });
  return project ?? undefined;
}

export async function createProject(values: Record<string, unknown>) {
  const project = await convexServiceClient.mutation(
    api.serviceApi.createProject,
    asConvexArgs(values),
  );

  if (project === null) {
    throw new Error("Failed to create project");
  }

  return project;
}
