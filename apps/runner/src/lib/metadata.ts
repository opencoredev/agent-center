import type { DomainMetadata } from "@agent-center/shared";

export type ControlAction = "cancel" | "pause" | "resume";
export type RequestedStatus = "cancelled" | "paused" | "running";

export interface ControlIntentPayload {
  applied?: boolean;
  appliedAt?: string;
  reason?: string | null;
  requestedAt?: string;
  requestedStatus?: RequestedStatus;
  source?: string;
  [key: string]: unknown;
}

interface ControlMap {
  cancel?: ControlIntentPayload;
  pause?: ControlIntentPayload;
  resume?: ControlIntentPayload;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function withControlIntent(
  metadata: DomainMetadata,
  action: ControlAction,
  payload: ControlIntentPayload,
) {
  const control = asRecord(metadata.control) ?? {};

  return {
    ...metadata,
    control: {
      ...control,
      [action]: payload,
    },
  };
}

export function getControlIntent(metadata: DomainMetadata, action: ControlAction) {
  const control = asRecord(metadata.control) as ControlMap | null;
  const value = control?.[action];

  return asRecord(value) as ControlIntentPayload | null;
}
