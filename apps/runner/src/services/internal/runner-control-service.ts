import type { RunStatus } from "@agent-center/shared";

import type {
  ActiveRunSnapshot,
  RunControlResponse,
  RunDispatchResponse,
} from "../../internal/protocol";
import { findRunById, loadRunTarget } from "../../repositories/run-repository";
import { CommandExecutor } from "../execution/command-executor";
import type { ExecutionBackend } from "../execution/backends/types";
import { LocalBackend } from "../execution/backends/local-backend";
import { GitService } from "../git/git-service";
import { RunSession } from "../execution/run-session";
import { ActiveRunRegistry } from "./active-run-registry";

const TERMINAL_STATUSES = new Set<RunStatus>(["cancelled", "completed", "failed"]);

interface RunnerControlServiceOptions {
  cleanupMode: "delete_on_completion" | "retain";
  controlPollIntervalMs: number;
  workspaceRoot: string;
  executionBackend?: "local" | "e2b";
  e2bApiKey?: string;
}

function createBackend(options: RunnerControlServiceOptions): ExecutionBackend {
  if (options.executionBackend === "e2b") {
    if (!options.e2bApiKey) {
      throw new Error("E2B_API_KEY is required when EXECUTION_BACKEND=e2b");
    }
    // Lazy import to avoid pulling in E2B SDK when not needed
    const { E2BBackend } = require("../execution/backends/e2b-backend") as typeof import("../execution/backends/e2b-backend");
    return new E2BBackend({ apiKey: options.e2bApiKey });
  }

  return new LocalBackend({
    cleanupMode: options.cleanupMode,
    workspaceRoot: options.workspaceRoot,
  });
}

export class RunnerControlService {
  #backend: ExecutionBackend;
  #commandExecutor = new CommandExecutor();
  #gitService = new GitService(this.#commandExecutor);
  #registry = new ActiveRunRegistry();
  #controlPollIntervalMs: number;

  constructor(options: RunnerControlServiceOptions) {
    this.#backend = createBackend(options);
    this.#controlPollIntervalMs = options.controlPollIntervalMs;
    console.log(`[runner] execution backend: ${this.#backend.name}`);
  }

  async dispatch(runId: string): Promise<RunDispatchResponse> {
    const existing = this.#registry.get(runId);

    if (existing) {
      return {
        accepted: true,
        alreadyActive: true,
        snapshot: existing.getSnapshot(),
      };
    }

    const target = await loadRunTarget(runId);
    if (!target) {
      throw new Error(`Run ${runId} could not be loaded from Postgres`);
    }

    if (TERMINAL_STATUSES.has(target.run.status)) {
      throw new Error(`Run ${runId} is already ${target.run.status}`);
    }

    const session = new RunSession({
      backend: this.#backend,
      commandExecutor: this.#commandExecutor,
      controlPollIntervalMs: this.#controlPollIntervalMs,
      gitService: this.#gitService,
      target,
    });

    this.#registry.add(runId, session);

    void session.run().finally(() => {
      this.#registry.delete(runId);
    });

    return {
      accepted: true,
      alreadyActive: false,
      snapshot: session.getSnapshot(),
    };
  }

  async getSnapshot(runId: string): Promise<ActiveRunSnapshot> {
    const active = this.#registry.get(runId);
    if (active) {
      return active.getSnapshot();
    }

    const run = await findRunById(runId);
    if (!run) {
      throw new Error(`Run ${runId} was not found`);
    }

    return {
      active: false,
      cancelRequested: false,
      currentCommand: null,
      paused: run.status === "paused",
      phase: "inactive",
      runId: run.id,
      startedAt: run.startedAt?.toISOString() ?? run.createdAt.toISOString(),
      status: run.status,
      workspacePath: run.workspacePath,
    };
  }

  async pause(runId: string, input: { reason?: string | null }): Promise<RunControlResponse> {
    const active = this.#registry.get(runId);
    if (!active) {
      throw new Error(`Run ${runId} is not active on this runner`);
    }

    return active.requestPause({
      reason: input.reason,
      source: "runner-http",
    });
  }

  async resume(runId: string, input: { reason?: string | null }): Promise<RunControlResponse> {
    const active = this.#registry.get(runId);
    if (!active) {
      throw new Error(`Run ${runId} is not active on this runner`);
    }

    return active.requestResume({
      reason: input.reason,
      source: "runner-http",
    });
  }

  async cancel(runId: string, input: { reason?: string | null }): Promise<RunControlResponse> {
    const active = this.#registry.get(runId);
    if (!active) {
      throw new Error(`Run ${runId} is not active on this runner`);
    }

    return active.requestCancel({
      reason: input.reason,
      source: "runner-http",
    });
  }
}
