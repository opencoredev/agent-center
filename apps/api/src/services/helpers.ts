import type { DomainMetadata, ExecutionConfig, RunStatus } from "@agent-center/shared";

import { ApiError } from "../http/errors";

export function mergeMetadata(base: DomainMetadata, patch?: DomainMetadata) {
  if (patch === undefined) {
    return base;
  }

  return {
    ...base,
    ...patch,
  };
}

export function withoutControlMetadata(metadata: DomainMetadata | null | undefined): DomainMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const next = { ...metadata };
  delete next.control;
  return next;
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

const launchReadyRuntimeProviders = new Set([
  "legacy_local",
  "convex_bash",
  "agent_os",
]);

export function assertLaunchReadyExecutionConfig(config: ExecutionConfig) {
  const provider = config.runtime?.provider;

  if (!provider || launchReadyRuntimeProviders.has(provider)) {
    return;
  }

  throw new ApiError(
    400,
    "runtime_not_launch_ready",
    "This runtime is not launch-ready yet. Switch the task to Local and retry.",
    {
      provider,
      target: config.runtime?.target ?? null,
    },
  );
}
