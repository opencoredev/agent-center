import { readFile, stat } from "node:fs/promises";

import type { ExecutionCommand, RunStatus } from "@agent-center/shared";
import { Effect } from "effect";

import { getRunnerErrorMessage } from "../../effect/errors";
import type {
  ActiveRunSnapshot,
  RunControlResponse,
} from "../../internal/protocol";
import { ensureRunnerApiToken } from "../../lib/runner-bootstrap";
import { getControlIntent, type ControlAction, type ControlIntentPayload } from "../../lib/metadata";
import { resolveInsideWorkspace } from "../../lib/path";
import type { LoadedRunTarget } from "../../repositories/run-repository";
import { findRunById } from "../../repositories/run-repository";
import type {
  CommandExecutionController,
  ControlledSubprocess,
} from "./command-executor";
import { CommandExecutor } from "./command-executor";
import type { ExecutionBackend, WorkspaceHandle } from "./backends/types";
import { type ClaudeExecutionHandle, startClaudeAgent } from "./claude-executor";
import { type CodexExecutionHandle, startCodexAgent } from "./codex-executor";
import { CancelledError } from "./errors";
import { assertCommandAllowed } from "./permission-service";
import { RunPersistence } from "./persistence";
import { runFlow } from "./run-flow";
import { GitService } from "../git/git-service";
import { InternalApiAuthError, InternalApiError, fetchInternalApiJson } from "../../lib/internal-api";
import { runnerRuntimeEnv } from "../../env";

interface RunSessionOptions {
  backend: ExecutionBackend;
  commandExecutor: CommandExecutor;
  controlPollIntervalMs: number;
  gitService: GitService;
  target: LoadedRunTarget;
}

const TERMINAL_STATUSES = new Set<RunStatus>(["cancelled", "completed", "failed"]);

function controlKey(action: ControlAction, payload: ControlIntentPayload) {
  return `${action}:${payload.requestedAt ?? "unknown"}`;
}

export class RunSession implements CommandExecutionController {
  readonly runId: string;
  #backend: ExecutionBackend;
  #commandExecutor: CommandExecutor;
  #controlPollIntervalMs: number;
  #currentCommand: string | null = null;
  #currentProcess: ControlledSubprocess | null = null;
  #currentStatus: RunStatus;
  #gitService: GitService;
  #handledControls = new Set<string>();
  #pauseGate: Promise<void> | null = null;
  #pauseGateResolver: (() => void) | null = null;
  #pauseRequested = false;
  #paused = false;
  #persistence: RunPersistence;
  #previousStatus: RunStatus;
  #runStartedAt = new Date().toISOString();
  #target: LoadedRunTarget;
  #workspacePath: string | null;
  #workspaceHandle: WorkspaceHandle | null = null;
  #cancelRequested = false;
  #claudeHandle: ClaudeExecutionHandle | null = null;
  #codexHandle: CodexExecutionHandle | null = null;
  #controlPoller: ReturnType<typeof setInterval> | null = null;
  #disposed = false;
  #resolvedCodexCredential:
    | {
        authJson: string | null;
        openAiApiKey: string | null;
      }
    | null = null;

  constructor(options: RunSessionOptions) {
    this.runId = options.target.run.id;
    this.#backend = options.backend;
    this.#commandExecutor = options.commandExecutor;
    this.#controlPollIntervalMs = options.controlPollIntervalMs;
    this.#currentStatus = options.target.run.status;
    this.#gitService = options.gitService;
    this.#persistence = new RunPersistence({
      runId: options.target.run.id,
      taskId: options.target.task.id,
    });
    this.#previousStatus = options.target.run.status;
    this.#target = options.target;
    this.#workspacePath = options.target.run.workspacePath;
  }

  getSnapshot(): ActiveRunSnapshot {
    return {
      active: !this.#disposed,
      cancelRequested: this.#cancelRequested,
      currentCommand: this.#currentCommand,
      paused: this.#paused,
      phase: this.#currentCommand ? "executing-command" : this.#currentStatus,
      runId: this.runId,
      startedAt: this.#runStartedAt,
      status: this.#currentStatus,
      workspacePath: this.#workspacePath,
    };
  }

  attachProcess(process: ControlledSubprocess) {
    this.#currentProcess = process;

    if (this.#pauseRequested && !this.#paused) {
      this.#signalProcess("SIGSTOP");
    }

    if (this.#cancelRequested) {
      this.terminateProcess("SIGTERM");
    }
  }

  detachProcess(process: ControlledSubprocess) {
    if (this.#currentProcess?.pid === process.pid) {
      this.#currentProcess = null;
    }
  }

  isCancelRequested() {
    return this.#cancelRequested;
  }

  terminateProcess(signal: NodeJS.Signals = "SIGTERM") {
    if (!this.#currentProcess) {
      return;
    }

    this.#signalProcess(signal);
  }

  async requestPause(input: { reason?: string | null; source: string }): Promise<RunControlResponse> {
    if (TERMINAL_STATUSES.has(this.#currentStatus)) {
      throw new Error(`Run ${this.runId} is already ${this.#currentStatus}`);
    }

    const payload = this.#buildControlPayload("pause", input.reason, input.source, "paused");
    await this.#persistence.recordControlIntent("pause", payload);
    await this.#applyPause(payload);

    return {
      accepted: true,
      applied: true,
      detail: "Pause request applied to local runner session",
      snapshot: this.getSnapshot(),
    };
  }

  async requestResume(input: { reason?: string | null; source: string }): Promise<RunControlResponse> {
    if (TERMINAL_STATUSES.has(this.#currentStatus)) {
      throw new Error(`Run ${this.runId} is already ${this.#currentStatus}`);
    }

    const payload = this.#buildControlPayload("resume", input.reason, input.source, "running");
    await this.#persistence.recordControlIntent("resume", payload);
    await this.#applyResume(payload);

    return {
      accepted: true,
      applied: true,
      detail: "Resume request applied to local runner session",
      snapshot: this.getSnapshot(),
    };
  }

  async requestCancel(input: { reason?: string | null; source: string }): Promise<RunControlResponse> {
    if (TERMINAL_STATUSES.has(this.#currentStatus)) {
      throw new Error(`Run ${this.runId} is already ${this.#currentStatus}`);
    }

    const payload = this.#buildControlPayload("cancel", input.reason, input.source, "cancelled");
    await this.#persistence.recordControlIntent("cancel", payload);
    await this.#applyCancel(payload);

    return {
      accepted: true,
      applied: true,
      detail: "Cancellation request applied to local runner session",
      snapshot: this.getSnapshot(),
    };
  }

  async run() {
    this.#startControlPolling();

    try {
      const agentProvider = this.#target.run.config.agentProvider ?? "none";
      const commands = this.#resolveCommands();

      await Effect.runPromise(
        runFlow({
          agentProvider,
          commands,
          getReusableWorkspace: () => this.#getReusableWorkspace(),
          createWorkspace: () => this.#backend.createWorkspace(this.runId),
          appendCompletedEvent: async () => {
            await this.#persistence.appendEvent({
              eventType: "run.completed",
              level: "info",
              message: "Run completed successfully",
              payload: {
                workspacePath: this.#workspacePath,
              },
            });
          },
          appendFailedEvent: async (message) => {
            await this.#persistence.appendEvent({
              eventType: "run.failed",
              level: "error",
              message,
              payload: {
                workspacePath: this.#workspacePath,
              },
            });
          },
          cleanupWorkspace: (status) => this.#cleanupWorkspace(status),
          executeClaudeAgent: () => this.#executeClaudeAgent(),
          executeCodexAgent: () => this.#executeCodexAgent(),
          executeCommand: (command, index, total) => this.#executeCommand(command, index, total),
          getFailureMessage: getRunnerErrorMessage,
          hasRepository: Boolean(this.#target.repoConnection),
          markRunStarted: () => {
            this.#runStartedAt = new Date().toISOString();
          },
          onWorkspaceCreated: async (workspaceHandle) => {
            this.#workspaceHandle = workspaceHandle;
            this.#workspacePath = workspaceHandle.path;
            await this.#persistence.recordWorkspacePath(this.#workspacePath);
            await this.#persistence.appendLog("Workspace created", {
              phase: "provisioning",
              source: "runner",
              workspacePath: this.#workspacePath,
            });
          },
          onWorkspaceReused: async (workspaceHandle) => {
            this.#workspaceHandle = workspaceHandle;
            this.#workspacePath = workspaceHandle.path;
            await this.#persistence.recordWorkspacePath(this.#workspacePath);
            await this.#persistence.appendLog("Reusing existing workspace", {
              phase: "running",
              source: "runner",
              workspacePath: this.#workspacePath,
            });
          },
          prepareBranch: async () => {
            if (!this.#workspacePath) {
              throw new Error("Workspace path was not prepared before branch setup");
            }
            await this.#gitService.prepareBranch(this.#target, {
              control: this,
              persistence: this.#persistence,
              workspacePath: this.#workspacePath,
            });
          },
          cloneRepository: async () => {
            if (!this.#workspacePath) {
              throw new Error("Workspace path was not prepared before repository clone");
            }
            await this.#gitService.cloneRepository(this.#target, {
              control: this,
              persistence: this.#persistence,
              workspacePath: this.#workspacePath,
            });
          },
          transitionStatus: (status, message, taskStatus, errorMessage) =>
            this.#transitionStatus(status, message, taskStatus, errorMessage),
          waitUntilRunnable: () => this.#waitUntilRunnable(),
        }),
      );
    } catch (error) {
      const message = getRunnerErrorMessage(error);

      if (!TERMINAL_STATUSES.has(this.#currentStatus)) {
        try {
          await this.#transitionStatus("failed", message, "failed", message);
          await this.#persistence.appendEvent({
            eventType: "run.failed",
            level: "error",
            message,
            payload: {
              workspacePath: this.#workspacePath,
              surfacedBy: "run-session-guard",
            },
          });
        } catch (persistError) {
          console.error("[runner] failed to persist outer run-session failure", {
            error: persistError,
            message,
            runId: this.runId,
          });
        }
      }

      console.error("[runner] run session exited with an unexpected outer error", {
        error,
        runId: this.runId,
      });
    } finally {
      if (!TERMINAL_STATUSES.has(this.#currentStatus)) {
        try {
          const message = this.#cancelRequested
            ? "Run cancelled before the terminal state reached the API."
            : "Runner session exited before the run reached a terminal state.";
          const status: RunStatus = this.#cancelRequested ? "cancelled" : "failed";
          const taskStatus = this.#cancelRequested ? "cancelled" : "failed";
          await this.#transitionStatus(status, message, taskStatus, message);
        } catch (persistError) {
          console.error("[runner] failed to persist fallback terminal status", {
            error: persistError,
            runId: this.runId,
            status: this.#currentStatus,
          });
        }
      }

      this.#disposed = true;
      if (this.#controlPoller) {
        clearInterval(this.#controlPoller);
        this.#controlPoller = null;
      }
      await this.#persistence.flush();
    }
  }

  async #executeCommand(command: ExecutionCommand, index: number, total: number) {
    if (!this.#workspacePath) {
      throw new Error("Workspace path was not prepared before command execution");
    }

    assertCommandAllowed(command.command, this.#target.run.permissionMode, this.#target.run.policy);

    const cwd = resolveInsideWorkspace(
      this.#workspacePath,
      this.#target.project?.rootDirectory ?? undefined,
      this.#target.run.config.workingDirectory,
      command.cwd,
    );

    this.#currentCommand = command.command;

    await this.#persistence.appendEvent({
      eventType: "run.command.started",
      level: "info",
      message: `Command ${index}/${total} started`,
      payload: {
        command: command.command,
        cwd,
        index,
        total,
      },
    });

    const result = await this.#commandExecutor.execute({
      command: command.command,
      control: this,
      cwd,
      env: command.env,
      onStderrLine: async (line) => {
        await this.#persistence.appendLog(line, {
          commandIndex: index,
          cwd,
          stream: "stderr",
        });
      },
      onStdoutLine: async (line) => {
        await this.#persistence.appendLog(line, {
          commandIndex: index,
          cwd,
          stream: "stdout",
        });
      },
      timeoutMs: command.timeoutSeconds ? command.timeoutSeconds * 1_000 : undefined,
    });

    this.#currentCommand = null;

    if (this.#cancelRequested) {
      throw new CancelledError("Run cancelled during command execution");
    }

    await this.#persistence.appendEvent({
      eventType: "run.command.finished",
      level: result.exitCode === 0 ? "info" : "error",
      message:
        result.exitCode === 0
          ? `Command ${index}/${total} finished`
          : `Command ${index}/${total} failed with exit code ${result.exitCode}`,
      payload: {
        command: command.command,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        index,
        total,
      },
    });

    if (result.exitCode !== 0) {
      throw new Error(`Command failed with exit code ${result.exitCode}: ${command.command}`);
    }
  }

  async #getReusableWorkspace(): Promise<WorkspaceHandle | null> {
    if (!this.#workspacePath) {
      return null;
    }

    try {
      const info = await stat(this.#workspacePath);
      if (!info.isDirectory()) {
        return null;
      }

      return {
        id: this.runId,
        path: this.#workspacePath,
        backend: this.#backend.name,
      };
    } catch {
      return null;
    }
  }

  async #transitionStatus(
    status: RunStatus,
    message: string,
    taskStatus?: "cancelled" | "completed" | "failed" | "running",
    errorMessage?: string,
  ) {
    this.#currentStatus = status;
    await this.#persistence.transitionStatus(status, {
      errorMessage,
      level:
        status === "failed" ? "error" : status === "paused" || status === "cancelled" ? "warn" : "info",
      message,
      taskStatus,
    });
  }

  async #waitUntilRunnable() {
    while (true) {
      if (this.#cancelRequested) {
        throw new CancelledError("Run cancelled before starting the next step");
      }

      if (!this.#pauseRequested && !this.#paused) {
        return;
      }

      this.#ensurePauseGate();

      if (!this.#paused) {
        await this.#applyPause(
          this.#buildControlPayload("pause", "Pause request is waiting at a safe boundary", "runner", "paused"),
          false,
        );
      }

      await this.#pauseGate;
    }
  }

  async #applyPause(payload: ControlIntentPayload, persistIntent = true) {
    const key = controlKey("pause", payload);
    if (this.#handledControls.has(key)) {
      return;
    }

    this.#pauseRequested = true;
    this.#ensurePauseGate();

    if (!this.#paused) {
      this.#previousStatus = this.#currentStatus;
      this.#paused = true;
      if (this.#currentProcess) {
        this.#signalProcess("SIGSTOP");
      }
      await this.#transitionStatus("paused", payload.reason ?? "Run paused");
    }

    this.#handledControls.add(key);

    if (persistIntent) {
      await this.#persistence.markControlApplied("pause", payload);
    }
  }

  async #applyResume(payload: ControlIntentPayload) {
    const key = controlKey("resume", payload);
    if (this.#handledControls.has(key)) {
      return;
    }

    this.#pauseRequested = false;

    if (this.#paused) {
      this.#paused = false;
      if (this.#currentProcess) {
        this.#signalProcess("SIGCONT");
      }
      const nextStatus = this.#previousStatus === "paused" ? "running" : this.#previousStatus;
      await this.#transitionStatus(nextStatus, payload.reason ?? "Run resumed");
    }

    this.#pauseGateResolver?.();
    this.#pauseGate = null;
    this.#pauseGateResolver = null;
    this.#handledControls.add(key);
    await this.#persistence.markControlApplied("resume", payload);
  }

  async #applyCancel(payload: ControlIntentPayload) {
    const key = controlKey("cancel", payload);
    if (this.#handledControls.has(key)) {
      return;
    }

    this.#cancelRequested = true;
    this.#pauseRequested = false;

    if (this.#paused && this.#currentProcess) {
      this.#signalProcess("SIGCONT");
    }

    this.#pauseGateResolver?.();
    this.#pauseGate = null;
    this.#pauseGateResolver = null;

    if (this.#claudeHandle) {
      this.#claudeHandle.interrupt();
      setTimeout(() => {
        this.#claudeHandle?.close();
      }, 2_000).unref();
    }

    if (this.#codexHandle) {
      this.#codexHandle.interrupt();
      setTimeout(() => {
        this.#codexHandle?.close();
      }, 2_000).unref();
    }

    if (this.#currentProcess) {
      this.terminateProcess("SIGTERM");
      setTimeout(() => {
        this.terminateProcess("SIGKILL");
      }, 2_000).unref();
    }

    if (!TERMINAL_STATUSES.has(this.#currentStatus)) {
      await this.#transitionStatus(
        "cancelled",
        payload.reason ?? "Cancellation requested. Stopping the run and preserving current progress.",
        "cancelled",
      );
    }

    this.#handledControls.add(key);
    await this.#persistence.markControlApplied("cancel", payload);
  }

  #ensurePauseGate() {
    if (this.#pauseGate) {
      return;
    }

    this.#pauseGate = new Promise<void>((resolve) => {
      this.#pauseGateResolver = resolve;
    });
  }

  #buildControlPayload(
    action: ControlAction,
    reason: string | null | undefined,
    source: string,
    requestedStatus: "cancelled" | "paused" | "running",
  ) {
    return {
      applied: false,
      reason: reason ?? null,
      requestedAt: new Date().toISOString(),
      requestedStatus,
      source,
      type: action,
    } satisfies ControlIntentPayload;
  }

  async #executeClaudeAgent() {
    if (!this.#workspacePath) {
      throw new Error("Workspace path was not prepared before agent execution");
    }

    const prompt = this.#target.run.config.agentPrompt ?? this.#target.run.prompt;
    const model = this.#target.run.config.agentModel;

    await this.#persistence.appendEvent({
      eventType: "run.command.started",
      level: "info",
      message: "Claude Code agent session started",
      payload: {
        agentProvider: "claude",
        model: model ?? "claude-sonnet-4-5",
        prompt: prompt.slice(0, 200),
      },
    });

    // Resolve credentials for Claude agent
    let credentialEnv: Record<string, string> = {};

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicApiKey) {
      // Use env var directly (fastest path, no network call)
      credentialEnv = { ANTHROPIC_API_KEY: anthropicApiKey };
    } else {
      try {
        await this.#ensureRunnerCloudAuth();
        const data = await fetchInternalApiJson<{ data: { type: string; value: string } }>(
          "/internal/credentials/claude/resolve",
          undefined,
          {
            baseUrl: runnerRuntimeEnv.RUNNER_API_URL,
            token: runnerRuntimeEnv.RUNNER_API_TOKEN,
          },
        );
        credentialEnv = { ANTHROPIC_API_KEY: data.data.value };
      } catch (error) {
        await this.#logCredentialResolutionFailure("claude", error);
      }
    }

    const handle = startClaudeAgent({
      cwd: this.#workspacePath,
      model,
      permissionMode: this.#target.run.permissionMode,
      prompt,
      env: { ...process.env, ...credentialEnv } as Record<string, string>,
      onEvent: async (event) => {
        await this.#persistence.appendLog(event.message, {
          agentProvider: "claude",
          eventType: event.type,
          ...event.payload,
        });
      },
    });

    this.#claudeHandle = handle;

    const result = await handle.result;

    this.#claudeHandle = null;

    await this.#persistence.appendEvent({
      eventType: "run.command.finished",
      level: result.success ? "info" : "error",
      message: result.success
        ? "Claude Code agent session completed"
        : `Claude agent failed: ${result.error}`,
      payload: {
        agentProvider: "claude",
        durationMs: result.durationMs,
        sessionId: result.sessionId,
        success: result.success,
      },
    });

    if (!result.success) {
      throw new Error(`Claude agent session failed: ${result.error}`);
    }
  }

  async #executeCodexAgent() {
    if (!this.#workspacePath) {
      throw new Error("Workspace path was not prepared before agent execution");
    }

    const prompt = this.#target.run.config.agentPrompt ?? this.#target.run.prompt;
    const model = this.#target.run.config.agentModel;

    await this.#persistence.appendEvent({
      eventType: "run.command.started",
      level: "info",
      message: "Codex agent session started",
      payload: {
        agentProvider: "codex",
        model: model ?? "gpt-5.4",
        prompt: prompt.slice(0, 200),
      },
    });

    const localAuthJson = await this.#readLocalCodexAuthJson();
    let authJson = localAuthJson;
    let openAiApiKey = process.env.OPENAI_API_KEY ?? null;

    if (!authJson && !openAiApiKey) {
      const resolved = await this.#resolveCodexCredential();
      authJson = resolved.authJson;
      openAiApiKey = resolved.openAiApiKey;
    }

    const handle = startCodexAgent({
      cwd: this.#workspacePath,
      model,
      permissionMode: this.#target.run.permissionMode,
      prompt,
      authJson,
      env: openAiApiKey ? { OPENAI_API_KEY: openAiApiKey } : undefined,
      onEvent: async (event) => {
        await this.#persistence.appendLog(event.message, {
          agentProvider: "codex",
          eventType: event.type,
          ...event.payload,
        });
      },
    });

    this.#codexHandle = handle;

    const result = await handle.result;

    this.#codexHandle = null;

    await this.#persistence.appendEvent({
      eventType: "run.command.finished",
      level: result.success ? "info" : "error",
      message: result.success
        ? "Codex agent session completed"
        : `Codex agent failed: ${result.error}`,
      payload: {
        agentProvider: "codex",
        durationMs: result.durationMs,
        success: result.success,
      },
    });

    if (!result.success) {
      throw new Error(`Codex agent session failed: ${result.error}`);
    }
  }

  async #readLocalCodexAuthJson() {
    const authPath = process.env.CODEX_AUTH_PATH ?? `${process.env.HOME ?? ""}/.codex/auth.json`;
    if (authPath) {
      try {
        const raw = await readFile(authPath, "utf8");
        if (raw.trim().length > 0) {
          return raw;
        }
      } catch {
        // Fall through to API-backed credential resolution.
      }
    }
    return null;
  }

  async #resolveCodexCredential() {
    if (this.#resolvedCodexCredential) {
      return this.#resolvedCodexCredential;
    }

    try {
      await this.#ensureRunnerCloudAuth();
      const data = await fetchInternalApiJson<{ data: { type: string; value: string } }>(
        "/internal/credentials/openai/resolve",
        undefined,
        {
          baseUrl: runnerRuntimeEnv.RUNNER_API_URL,
          token: runnerRuntimeEnv.RUNNER_API_TOKEN,
        },
      );
      this.#resolvedCodexCredential = {
        authJson: data.data.type === "auth_json" ? data.data.value : null,
        openAiApiKey: data.data.type === "api_key" ? data.data.value : null,
      };
      return this.#resolvedCodexCredential;
    } catch (error) {
      await this.#logCredentialResolutionFailure("openai", error);
      this.#resolvedCodexCredential = { authJson: null, openAiApiKey: null };
      return this.#resolvedCodexCredential;
    }
  }

  async #ensureRunnerCloudAuth() {
    await ensureRunnerApiToken({
      workspaceId: this.#target.workspace.id,
      runnerName: "Local Runner",
    });
  }

  async #logCredentialResolutionFailure(provider: "claude" | "openai", error: unknown) {
    const basePayload = {
      provider,
      runnerApiUrl: runnerRuntimeEnv.RUNNER_API_URL,
      runnerApiTokenConfigured: Boolean(runnerRuntimeEnv.RUNNER_API_TOKEN),
    };

    if (error instanceof InternalApiAuthError) {
      await this.#persistence.appendLog("Internal API rejected credential resolution", {
        ...basePayload,
        error: error.message,
        status: error.status,
        type: error.name,
        warning:
          "Check RUNNER_API_TOKEN and the API internal auth contract. The runner will continue without remote credentials.",
      });
      return;
    }

    if (error instanceof InternalApiError) {
      await this.#persistence.appendLog("Internal API credential resolution failed", {
        ...basePayload,
        error: error.message,
        status: error.status,
        type: error.name,
      });
      return;
    }

    await this.#persistence.appendLog("Internal API credential resolution failed", {
      ...basePayload,
      error: error instanceof Error ? error.message : String(error),
      type: error instanceof Error ? error.name : typeof error,
    });
  }

  #resolveCommands() {
    return this.#target.run.config.commands ?? [];
  }

  async #pollForPersistedControls() {
    if (this.#disposed || TERMINAL_STATUSES.has(this.#currentStatus)) {
      return;
    }

    const run = await findRunById(this.runId);
    if (!run) {
      return;
    }

    const cancelIntent = getControlIntent(run.metadata, "cancel");
    if (cancelIntent && cancelIntent.applied !== true) {
      await this.#applyCancel(cancelIntent);
      return;
    }

    const resumeIntent = getControlIntent(run.metadata, "resume");
    if (resumeIntent && resumeIntent.applied !== true) {
      await this.#applyResume(resumeIntent);
      return;
    }

    const pauseIntent = getControlIntent(run.metadata, "pause");
    if (pauseIntent && pauseIntent.applied !== true) {
      await this.#applyPause(pauseIntent);
    }
  }

  #startControlPolling() {
    this.#controlPoller = setInterval(() => {
      void this.#pollForPersistedControls();
    }, this.#controlPollIntervalMs);
    this.#controlPoller.unref();
  }

  async #cleanupWorkspace(status: "cancelled" | "completed" | "failed") {
    if (!this.#workspaceHandle) {
      return;
    }

    const result = await this.#backend.cleanup(this.#workspaceHandle, status);

    await this.#persistence.appendLog(
      result.attempted
        ? "Workspace cleanup completed"
        : `Workspace retained: ${result.reason ?? "retained by policy"}`,
      {
        backend: this.#backend.name,
        source: "runner",
        workspacePath: this.#workspacePath,
      },
    );
  }

  #signalProcess(signal: NodeJS.Signals) {
    try {
      this.#currentProcess?.kill(signal);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("ESRCH")) {
        throw error;
      }
    }
  }
}
