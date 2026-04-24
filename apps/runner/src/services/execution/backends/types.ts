import type { CommandExecutionController, CommandExecutionResult } from "../command-executor";

export interface WorkspaceHandle {
  id: string;
  path: string;
  backend: string;
}

export interface BackendCommandRequest {
  command: string;
  control: CommandExecutionController;
  cwd: string;
  env?: Record<string, string>;
  workspaceHandle?: WorkspaceHandle;
  onStdoutLine?: (line: string) => Promise<void> | void;
  onStderrLine?: (line: string) => Promise<void> | void;
  timeoutMs?: number;
}

export interface CleanupResult {
  attempted: boolean;
  reason?: string | null;
}

export interface ExecutionBackend {
  readonly name: string;
  createWorkspace(runId: string): Promise<WorkspaceHandle>;
  executeCommand(request: BackendCommandRequest): Promise<CommandExecutionResult>;
  cleanup(
    handle: WorkspaceHandle,
    status: "cancelled" | "completed" | "failed",
  ): Promise<CleanupResult>;
}
