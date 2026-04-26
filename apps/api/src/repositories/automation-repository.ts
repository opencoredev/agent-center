import { api } from "@agent-center/control-plane/api";

import { convexServiceClient } from "../services/convex-service-client";
import { asConvexArgs, asConvexId } from "./convex-repository-utils";

export interface AutomationListFilters {
  workspaceId?: string;
  projectId?: string;
  enabled?: boolean;
}

export function listAutomations(filters: AutomationListFilters) {
  return convexServiceClient.query(api.serviceApi.listAutomations, {
    workspaceId: filters.workspaceId ? asConvexId<"workspaces">(filters.workspaceId) : undefined,
    projectId: filters.projectId ? asConvexId<"projects">(filters.projectId) : undefined,
    enabled: filters.enabled,
  });
}

export async function findAutomationById(automationId: string) {
  const automation = await convexServiceClient.query(api.serviceApi.getAutomation, {
    automationId: asConvexId<"automations">(automationId),
  });
  return automation ?? undefined;
}

export async function findAutomationByWorkspaceAndId(workspaceId: string, automationId: string) {
  const automation = await convexServiceClient.query(api.serviceApi.getAutomationByWorkspaceAndId, {
    workspaceId: asConvexId<"workspaces">(workspaceId),
    automationId: asConvexId<"automations">(automationId),
  });
  return automation ?? undefined;
}

export async function createAutomation(values: Record<string, unknown>) {
  const automation = await convexServiceClient.mutation(
    api.serviceApi.createAutomation,
    asConvexArgs(values),
  );

  if (automation === null) {
    throw new Error("Failed to create automation");
  }

  return automation;
}

export async function updateAutomation(automationId: string, values: Record<string, unknown>) {
  const automation = await convexServiceClient.mutation(api.serviceApi.updateAutomation, {
    automationId: asConvexId<"automations">(automationId),
    ...asConvexArgs(values),
  });

  if (automation === null) {
    throw new Error(`Failed to update automation ${automationId}`);
  }

  return automation;
}
