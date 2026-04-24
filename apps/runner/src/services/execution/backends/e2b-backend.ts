import { Sandbox } from "@e2b/code-interpreter";
import type {
  BackendCommandRequest,
  CleanupResult,
  ExecutionBackend,
  WorkspaceHandle,
} from "./types";
import type { CommandExecutionResult } from "../command-executor";

interface E2BBackendOptions {
  apiKey: string;
  template?: string;
  timeoutMs?: number;
}

interface E2BWorkspaceHandle extends WorkspaceHandle {
  sandbox: Sandbox;
}

export class E2BBackend implements ExecutionBackend {
  readonly name = "e2b";
  readonly #apiKey: string;
  readonly #template: string;
  readonly #timeoutMs: number;

  constructor(options: E2BBackendOptions) {
    this.#apiKey = options.apiKey;
    this.#template = options.template ?? "base";
    this.#timeoutMs = options.timeoutMs ?? 300_000; // 5 min default sandbox lifetime
  }

  async createWorkspace(runId: string): Promise<E2BWorkspaceHandle> {
    const sandbox = await Sandbox.create(this.#template, {
      apiKey: this.#apiKey,
      timeoutMs: this.#timeoutMs,
    });

    // Create a workspace directory in the sandbox
    const workspacePath = `/home/user/workspace/${runId}`;
    await sandbox.commands.run(`mkdir -p ${workspacePath}`);

    return {
      id: runId,
      path: workspacePath,
      backend: "e2b",
      sandbox,
    };
  }

  async executeCommand(request: BackendCommandRequest): Promise<CommandExecutionResult> {
    const handle = request.workspaceHandle as E2BWorkspaceHandle | undefined;

    if (!handle || handle.backend !== "e2b" || !handle.sandbox) {
      throw new Error("E2B command execution requires an active E2B workspace handle");
    }

    return this.executeCommandInSandbox(handle, request);
  }

  async executeCommandInSandbox(
    handle: E2BWorkspaceHandle,
    request: BackendCommandRequest,
  ): Promise<CommandExecutionResult> {
    const startedAt = Date.now();

    const result = await handle.sandbox.commands.run(request.command, {
      cwd: request.cwd,
      envs: request.env ?? {},
      timeoutMs: request.timeoutMs,
      onStdout: (data) => {
        const lines = data.split("\n");
        for (const line of lines) {
          if (line) void request.onStdoutLine?.(line);
        }
      },
      onStderr: (data) => {
        const lines = data.split("\n");
        for (const line of lines) {
          if (line) void request.onStderrLine?.(line);
        }
      },
    });

    return {
      durationMs: Date.now() - startedAt,
      exitCode: result.exitCode,
    };
  }

  async cleanup(
    handle: WorkspaceHandle,
    _status: "cancelled" | "completed" | "failed",
  ): Promise<CleanupResult> {
    const e2bHandle = handle as E2BWorkspaceHandle;
    if (e2bHandle.sandbox) {
      await e2bHandle.sandbox.kill();
      return { attempted: true, reason: null };
    }
    return { attempted: false, reason: "no sandbox to cleanup" };
  }
}
