import type { EventType, RunStatus, TaskStatus } from "@agent-center/shared";

import {
  appendRunEvent,
  updateRun,
  updateRunMetadata,
  updateTask,
} from "../../repositories/run-repository";
import type { ControlAction, ControlIntentPayload } from "../../lib/metadata";
import { withControlIntent } from "../../lib/metadata";
import { redactSensitiveData, redactString } from "../../lib/redaction";

interface RunPersistenceOptions {
  runId: string;
  taskId: string;
}

interface StatusTransitionOptions {
  errorMessage?: string | null;
  level?: string;
  message: string;
  payload?: Record<string, unknown>;
  taskStatus?: TaskStatus;
}

interface EventInput {
  eventType: EventType;
  level?: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
}

interface UiSummaryStep {
  at: string;
  command?: string | null;
  id: string;
  label: string;
  message: string;
  output?: string | null;
  status?: "running" | "completed" | "failed";
}

interface UiSummary {
  phase?: "setup" | "thinking" | "completed" | "failed" | "cancelled";
  thinkingCompletedAt?: string;
  thinkingStartedAt?: string;
  thinkingTimeSec?: number;
  setupSteps?: UiSummaryStep[];
  workSteps?: UiSummaryStep[];
}

const MAX_UI_STEPS = 8;

function trimSteps(steps: UiSummaryStep[] | undefined) {
  return (steps ?? []).slice(-MAX_UI_STEPS);
}

function isLowSignalUiMessage(message: string) {
  return [
    "Started the Codex agent.",
    "Started the Claude agent.",
    "Codex session started.",
    "Sent the message to the agent.",
    "Reusing existing workspace",
  ].some((fragment) => message.includes(fragment));
}

function compactCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed) return null;

  const shellWrapped = trimmed.match(/^\/bin\/zsh -lc\s+([\s\S]+)$/);
  const shellBody = shellWrapped?.[1]?.trim();
  const unwrapped = shellBody?.replace(/^["']([\s\S]*)["']$/, "$1").trim() ?? trimmed;
  const segments = unwrapped
    .split("&&")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.some((segment) => segment === "pwd") && segments.length === 1) {
    return "Checked working directory";
  }

  if (segments.some((segment) => segment.startsWith("rg --files"))) {
    return "Listed files";
  }

  if (segments.some((segment) => segment.startsWith("rg "))) {
    return "Searched the codebase";
  }

  if (segments.some((segment) => segment.startsWith("git status --short"))) {
    return "Checked git status";
  }

  if (unwrapped.startsWith("sed -n")) {
    const pathMatch = unwrapped.match(/sed -n ['"][^'"]+['"]\s+(.+)$/);
    const path = pathMatch?.[1]?.replace(/^["']|["']$/g, "");
    return path ? `Read ${path}` : "Read file";
  }

  if (unwrapped.startsWith("rg ") || unwrapped.startsWith("find ")) {
    return "Searched the codebase";
  }

  if (unwrapped.startsWith("git status")) return "Checked git status";
  if (unwrapped.startsWith("git diff")) return "Inspected git diff";
  if (unwrapped.startsWith("ls")) return "Listed files";

  return unwrapped.length > 80 ? `${unwrapped.slice(0, 77)}...` : unwrapped;
}

function mapUiMessage(
  message: string | null | undefined,
  payload?: Record<string, unknown> | null,
): {
  kind: "setup" | "work" | "ignore";
  message: string | null;
  command?: string | null;
  output?: string | null;
  status?: "running" | "completed" | "failed";
} {
  if (!message) return { kind: "ignore", message: null };

  if (payload?.eventType === "assistant_message_delta") {
    return { kind: "ignore", message: null };
  }

  const item = payload?.item;
  if (
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    typeof (item as { type?: unknown }).type === "string"
  ) {
    const itemType = (item as { type: string }).type;
    const payloadType = typeof payload?.type === "string" ? payload.type : null;

    if (itemType === "agent_message") {
      return { kind: "ignore", message: null };
    }

    if (itemType === "command_execution") {
      const command =
        typeof (item as { command?: unknown }).command === "string"
          ? (item as { command: string }).command
          : null;

      if (payloadType === "item.started") {
        const nextMessage = compactCommand(command ?? "");
        return {
          kind: "work",
          message: nextMessage ?? "Ran a command",
          command,
          status: "running",
        };
      }

      if (payloadType === "item.completed") {
        const output =
          typeof (item as { aggregated_output?: unknown }).aggregated_output === "string"
            ? (item as { aggregated_output: string }).aggregated_output
            : null;
        const status = (item as { status?: unknown }).status === "failed" ? "failed" : "completed";
        const nextMessage = compactCommand(command ?? "");
        return {
          kind: "work",
          message: nextMessage ?? "Ran a command",
          command,
          output,
          status,
        };
      }
    }
  }

  if (typeof payload?.type === "string" && payload.type === "turn.completed") {
    return { kind: "ignore", message: null };
  }

  if (message.includes("Cancellation requested"))
    return { kind: "setup", message: "Cancellation requested." };
  if (message.includes("Reusing existing workspace")) return { kind: "ignore", message: null };

  if (message.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(message) as {
        type?: string;
        item?: { type?: string; text?: string };
      };

      if (parsed.type === "turn.started" || parsed.type === "thread.started")
        return { kind: "ignore", message: null };
      if (parsed.type === "item.started") return { kind: "ignore", message: null };
      if (parsed.type === "item.completed" && parsed.item?.type === "agent_message")
        return { kind: "ignore", message: null };
      if (parsed.type === "item.completed" && parsed.item?.type) {
        return { kind: "ignore", message: null };
      }
    } catch {
      return { kind: "setup", message };
    }
  }

  if (message.includes("Run claimed by worker and marked provisioning"))
    return { kind: "setup", message: "Claimed by the worker." };
  if (message.includes("Provisioning host-local workspace"))
    return { kind: "setup", message: "Prepared the local workspace." };
  if (message.includes("Workspace created"))
    return { kind: "setup", message: "Workspace created." };
  if (message.includes("Cloning repository into local workspace"))
    return { kind: "setup", message: "Cloned repository." };
  if (message.includes("Clone completed for"))
    return { kind: "setup", message: "Cloned repository." };
  if (message.includes("Reset branch 'main'"))
    return { kind: "setup", message: "Reset branch 'main'." };
  if (message.includes("branch 'main' set up to track 'origin/main'."))
    return { kind: "setup", message: "Prepared branch main." };
  if (message.includes("Your branch is up to date with 'origin/main'."))
    return { kind: "setup", message: "Branch is up to date." };
  if (message.includes("Starting Codex agent session")) return { kind: "ignore", message: null };
  if (message.includes("Starting Claude Code agent session"))
    return { kind: "ignore", message: null };
  if (message.includes("Codex agent session started")) return { kind: "ignore", message: null };
  if (message.includes("Claude session started")) return { kind: "ignore", message: null };
  if (message.includes("Reading additional input from stdin"))
    return { kind: "ignore", message: null };
  if (message.includes("Codex session completed")) return { kind: "ignore", message: null };
  if (message.includes("Codex agent session completed")) return { kind: "ignore", message: null };
  if (message.includes("Run completed successfully")) return { kind: "ignore", message: null };

  return { kind: "setup", message };
}

function appendUiStep(summary: UiSummary, kind: "setup" | "work", step: UiSummaryStep) {
  const key = kind === "setup" ? "setupSteps" : "workSteps";
  const existing = trimSteps(summary[key]);
  return {
    ...summary,
    [key]: trimSteps([...existing, step]),
  };
}

function withUiSummary(
  metadata: Record<string, unknown>,
  input: {
    eventType: EventType;
    message?: string | null;
    payload?: Record<string, unknown> | null;
  },
) {
  const current = (metadata.uiSummary as UiSummary | undefined) ?? {};
  const now = new Date().toISOString();
  const next: UiSummary = { ...current };
  const payloadStatus = typeof input.payload?.status === "string" ? input.payload.status : null;
  const mappedMessage = mapUiMessage(input.message, input.payload);

  if (payloadStatus === "provisioning" || payloadStatus === "cloning") {
    next.phase = "setup";
  } else if (payloadStatus === "running") {
    next.phase = "thinking";
    next.thinkingStartedAt ??= now;
  } else if (payloadStatus === "completed") {
    next.phase = "completed";
    next.thinkingCompletedAt = now;
  } else if (payloadStatus === "failed") {
    next.phase = "failed";
    next.thinkingCompletedAt = now;
  } else if (payloadStatus === "cancelled") {
    next.phase = "cancelled";
    next.thinkingCompletedAt = now;
  }

  if (input.payload?.eventType === "assistant_message_delta") {
    next.phase = "thinking";
    next.thinkingStartedAt ??= now;
  }

  if (input.payload?.eventType === "assistant_message") {
    next.phase = "completed";
    next.thinkingCompletedAt = now;
  }

  if (
    mappedMessage.kind !== "ignore" &&
    mappedMessage.message &&
    !isLowSignalUiMessage(mappedMessage.message)
  ) {
    const step: UiSummaryStep = {
      at: now,
      id: crypto.randomUUID(),
      label: mappedMessage.kind === "work" || next.phase === "thinking" ? "Work" : "Setup",
      message: mappedMessage.message,
      command: mappedMessage.command ?? null,
      output: mappedMessage.output ?? null,
      status: mappedMessage.status,
    };
    const kind = mappedMessage.kind === "work" || next.phase === "thinking" ? "work" : "setup";
    Object.assign(next, appendUiStep(next, kind, step));
  }

  if (next.thinkingStartedAt && next.thinkingCompletedAt) {
    const started = new Date(next.thinkingStartedAt).getTime();
    const completed = new Date(next.thinkingCompletedAt).getTime();
    if (Number.isFinite(started) && Number.isFinite(completed) && completed >= started) {
      next.thinkingTimeSec = Math.max(1, Math.round((completed - started) / 1000));
    }
  }

  return {
    ...metadata,
    uiSummary: next,
  };
}

export class RunPersistence {
  readonly runId: string;
  readonly taskId: string;
  #writeChain: Promise<unknown> = Promise.resolve();

  constructor(options: RunPersistenceOptions) {
    this.runId = options.runId;
    this.taskId = options.taskId;
  }

  enqueue<TValue>(work: () => Promise<TValue>) {
    const next = this.#writeChain.then(work);
    this.#writeChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  flush() {
    return this.#writeChain;
  }

  appendEvent(input: EventInput) {
    return this.enqueue(async () => {
      const message = input.message === undefined ? null : redactSensitiveData(input.message);
      const payload = input.payload === undefined ? null : redactSensitiveData(input.payload);

      await appendRunEvent(this.runId, {
        eventType: input.eventType,
        level: input.level ?? null,
        message,
        payload,
      });

      await updateRunMetadata(this.runId, (metadata) =>
        redactSensitiveData(
          withUiSummary(metadata as Record<string, unknown>, {
            eventType: input.eventType,
            message,
            payload,
          }),
        ),
      );
    });
  }

  appendLog(message: string, payload: Record<string, unknown>) {
    return this.appendEvent({
      eventType: "run.log",
      level: payload.stream === "stderr" ? "warn" : "info",
      message,
      payload,
    });
  }

  recordWorkspacePath(workspacePath: string) {
    return this.enqueue(() =>
      updateRun(this.runId, {
        updatedAt: new Date(),
        workspacePath,
      }),
    );
  }

  recordControlIntent(action: ControlAction, payload: ControlIntentPayload) {
    return this.enqueue(() =>
      updateRunMetadata(this.runId, (metadata) =>
        redactSensitiveData(withControlIntent(metadata, action, payload)),
      ),
    );
  }

  markControlApplied(action: ControlAction, payload: ControlIntentPayload) {
    return this.enqueue(() =>
      updateRunMetadata(this.runId, (metadata) =>
        redactSensitiveData(
          withControlIntent(metadata, action, {
            ...payload,
            applied: true,
            appliedAt: new Date().toISOString(),
          }),
        ),
      ),
    );
  }

  transitionStatus(status: RunStatus, options: StatusTransitionOptions) {
    return this.enqueue(async () => {
      const now = new Date();
      const runValues: Partial<Parameters<typeof updateRun>[1]> = {
        status,
        updatedAt: now,
      };

      if (status === "provisioning") {
        runValues.startedAt = now;
        runValues.completedAt = null;
        runValues.failedAt = null;
        runValues.errorMessage = null;
      }

      if (status === "completed") {
        runValues.completedAt = now;
        runValues.failedAt = null;
        runValues.errorMessage = null;
      }

      if (status === "failed") {
        runValues.failedAt = now;
        runValues.errorMessage = redactString(options.errorMessage ?? options.message);
      }

      if (status === "cancelled") {
        runValues.completedAt = now;
      }

      await updateRun(this.runId, runValues as Parameters<typeof updateRun>[1]);

      if (options.taskStatus) {
        await updateTask(this.taskId, {
          status: options.taskStatus,
          updatedAt: now,
        });
      }

      await appendRunEvent(this.runId, {
        eventType: "run.status_changed",
        level: options.level ?? "info",
        message: redactString(options.message),
        payload: redactSensitiveData({
          status,
          ...options.payload,
        }),
      });
    });
  }
}
