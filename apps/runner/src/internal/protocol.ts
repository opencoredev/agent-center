import type { RunStatus } from "@agent-center/shared";

export interface ExecuteRunRequest {
  runId: string;
}

export interface RunControlRequest {
  reason?: string | null;
}

export interface ActiveRunSnapshot {
  runId: string;
  active: boolean;
  phase: string;
  status: RunStatus;
  workspacePath: string | null;
  currentCommand: string | null;
  paused: boolean;
  cancelRequested: boolean;
  startedAt: string;
}

export interface RunDispatchResponse {
  accepted: boolean;
  alreadyActive: boolean;
  snapshot: ActiveRunSnapshot;
}

export interface RunControlResponse {
  accepted: boolean;
  applied: boolean;
  detail: string;
  snapshot: ActiveRunSnapshot;
}
