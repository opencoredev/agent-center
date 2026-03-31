import type { DomainMetadata, RunStatus } from "@agent-center/shared";

export function mergeMetadata(base: DomainMetadata, patch?: DomainMetadata) {
  if (patch === undefined) {
    return base;
  }

  return {
    ...base,
    ...patch,
  };
}

export function withControlIntent(
  metadata: DomainMetadata,
  action: string,
  payload: Record<string, unknown>,
) {
  const control =
    typeof metadata.control === "object" &&
    metadata.control !== null &&
    !Array.isArray(metadata.control)
      ? (metadata.control as Record<string, unknown>)
      : {};

  return {
    ...metadata,
    control: {
      ...control,
      [action]: payload,
    },
  };
}

const activeRunStatuses = new Set<RunStatus>([
  "queued",
  "provisioning",
  "cloning",
  "running",
  "paused",
]);

export function isActiveRunStatus(status: RunStatus) {
  return activeRunStatuses.has(status);
}
