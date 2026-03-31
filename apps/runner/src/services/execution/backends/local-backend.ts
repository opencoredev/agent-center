import { CommandExecutor } from "../command-executor";
import { WorkspaceService } from "../../sandbox/workspace-service";
import type { BackendCommandRequest, CleanupResult, ExecutionBackend, WorkspaceHandle } from "./types";
import type { CommandExecutionResult } from "../command-executor";

interface LocalBackendOptions {
  cleanupMode: "delete_on_completion" | "retain";
  workspaceRoot: string;
}

export class LocalBackend implements ExecutionBackend {
  readonly name = "local";
  readonly #commandExecutor: CommandExecutor;
  readonly #workspaceService: WorkspaceService;

  constructor(options: LocalBackendOptions) {
    this.#commandExecutor = new CommandExecutor();
    this.#workspaceService = new WorkspaceService({
      cleanupMode: options.cleanupMode,
      workspaceRoot: options.workspaceRoot,
    });
  }

  get cleanupMode() {
    return this.#workspaceService.cleanupMode;
  }

  async createWorkspace(runId: string): Promise<WorkspaceHandle> {
    const path = await this.#workspaceService.createWorkspace(runId);
    return { id: runId, path, backend: "local" };
  }

  async executeCommand(request: BackendCommandRequest): Promise<CommandExecutionResult> {
    return this.#commandExecutor.execute({
      command: request.command,
      control: request.control,
      cwd: request.cwd,
      env: request.env,
      onStdoutLine: request.onStdoutLine,
      onStderrLine: request.onStderrLine,
      timeoutMs: request.timeoutMs,
    });
  }

  async cleanup(handle: WorkspaceHandle, status: "cancelled" | "completed" | "failed"): Promise<CleanupResult> {
    return this.#workspaceService.cleanupWorkspace(handle.path, status);
  }
}
