import type { ActiveRunSnapshot, RunControlResponse } from "../../internal/protocol";

export interface ActiveRunHandle {
  getSnapshot(): ActiveRunSnapshot;
  requestCancel(input: { reason?: string | null; source: string }): Promise<RunControlResponse>;
  requestPause(input: { reason?: string | null; source: string }): Promise<RunControlResponse>;
  requestResume(input: { reason?: string | null; source: string }): Promise<RunControlResponse>;
  run(): Promise<void>;
}

export class ActiveRunRegistry {
  #runs = new Map<string, ActiveRunHandle>();

  add(runId: string, handle: ActiveRunHandle) {
    if (this.#runs.has(runId)) {
      throw new Error(`Run ${runId} is already active on this runner`);
    }

    this.#runs.set(runId, handle);
  }

  delete(runId: string) {
    this.#runs.delete(runId);
  }

  get(runId: string) {
    return this.#runs.get(runId);
  }
}
