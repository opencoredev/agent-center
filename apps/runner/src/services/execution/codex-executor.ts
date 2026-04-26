import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildChildProcessEnv } from "./command-executor";

export interface CodexExecutionRequest {
  cwd: string;
  model?: string;
  permissionMode: "yolo" | "safe" | "custom";
  prompt: string;
  env?: Record<string, string>;
  authJson?: string | null;
  onEvent: (event: CodexEvent) => Promise<void> | void;
}

export interface CodexEvent {
  type: "assistant_message" | "assistant_message_delta" | "result" | "error" | "log";
  message: string;
  payload?: Record<string, unknown>;
}

export interface CodexExecutionResult {
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface CodexExecutionHandle {
  result: Promise<CodexExecutionResult>;
  interrupt: () => void;
  close: () => void;
}

interface AuthSetup {
  cleanup: () => Promise<void>;
  env: Record<string, string>;
}

export function startCodexAgent(request: CodexExecutionRequest): CodexExecutionHandle {
  const controller = new AbortController();
  const result = runCodexAgent(request, controller);

  return {
    result,
    interrupt: () => controller.abort(),
    close: () => controller.abort(),
  };
}

async function runCodexAgent(
  request: CodexExecutionRequest,
  controller: AbortController,
): Promise<CodexExecutionResult> {
  const startedAt = Date.now();
  let authSetup: AuthSetup | null = null;
  let outputFile: string | null = null;

  try {
    authSetup = await prepareAuth(request.authJson ?? null);
    outputFile = join(tmpdir(), `agent-center-codex-${crypto.randomUUID()}.txt`);

    const cmd = buildCodexCommand(request, outputFile);
    const subprocess = Bun.spawn({
      cmd,
      cwd: request.cwd,
      env: buildChildProcessEnv({
        ...request.env,
        ...authSetup.env,
      }),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal,
    });

    void pipeStream(subprocess.stdout, async (line) => {
      const parsed = parseCodexJsonLine(line);
      if (parsed?.type === "error") {
        await request.onEvent({
          type: "error",
          message: parsed.message,
          payload: parsed.payload,
        });
        return;
      }

      if (parsed?.type === "assistant_message_delta") {
        await request.onEvent({
          type: "assistant_message_delta",
          message: parsed.message,
          payload: parsed.payload,
        });
        return;
      }

      await request.onEvent({
        type: "log",
        message: parsed?.message ?? line,
        payload: parsed?.payload,
      });
    });

    void pipeStream(subprocess.stderr, async (line) => {
      await request.onEvent({
        type: "log",
        message: line,
        payload: { stream: "stderr" },
      });
    });

    const exitCode = await subprocess.exited;
    const finalMessage = outputFile ? await readLastMessage(outputFile) : null;

    if (finalMessage) {
      await request.onEvent({
        type: "assistant_message",
        message: finalMessage,
      });
    }

    await request.onEvent({
      type: exitCode === 0 ? "result" : "error",
      message: exitCode === 0 ? "Codex session completed" : `Codex exited with code ${exitCode}`,
      payload: { exitCode },
    });

    if (exitCode !== 0) {
      return {
        durationMs: Date.now() - startedAt,
        success: false,
        error: `Codex exited with code ${exitCode}`,
      };
    }

    return {
      durationMs: Date.now() - startedAt,
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Codex execution error";
    await request.onEvent({
      type: "error",
      message,
    });
    return {
      durationMs: Date.now() - startedAt,
      success: false,
      error: message,
    };
  } finally {
    await authSetup?.cleanup();
    if (outputFile) {
      await rm(outputFile, { force: true }).catch(() => undefined);
    }
  }
}

function buildCodexCommand(request: CodexExecutionRequest, outputFile: string) {
  const cmd = [
    "codex",
    "exec",
    "--skip-git-repo-check",
    "--json",
    "--output-last-message",
    outputFile,
    "--model",
    request.model ?? "gpt-5.4",
  ];

  if (request.permissionMode === "yolo") {
    cmd.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    cmd.push("--sandbox", "workspace-write");
  }

  cmd.push(request.prompt);
  return cmd;
}

async function prepareAuth(authJson: string | null): Promise<AuthSetup> {
  if (!authJson) {
    return {
      env: {},
      cleanup: async () => undefined,
    };
  }

  const codexHome = await mkdtemp(join(tmpdir(), "agent-center-codex-home-"));
  await writeFile(join(codexHome, "auth.json"), authJson, "utf8");

  return {
    env: { CODEX_HOME: codexHome },
    cleanup: async () => {
      await rm(codexHome, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

async function readLastMessage(outputFile: string) {
  try {
    const file = await stat(outputFile);
    if (!file.isFile() || file.size === 0) {
      return null;
    }

    const content = await readFile(outputFile, "utf8");
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function pipeStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  onLine: (line: string) => Promise<void>,
) {
  if (!stream) return;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      buffer += decoder.decode(value, { stream: true });
    }

    while (true) {
      const index = buffer.indexOf("\n");
      if (index === -1) break;
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      if (line) {
        await onLine(line);
      }
    }
  }

  buffer += decoder.decode();

  const lastLine = buffer.trim();
  if (lastLine) {
    await onLine(lastLine);
  }
}

export function parseCodexJsonLine(line: string): {
  type: "log" | "error" | "assistant_message_delta";
  message: string;
  payload?: Record<string, unknown>;
} | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const item =
      typeof parsed.item === "object" && parsed.item !== null && !Array.isArray(parsed.item)
        ? (parsed.item as Record<string, unknown>)
        : null;
    const itemType = typeof item?.type === "string" ? item.type : null;
    const itemText = typeof item?.text === "string" ? item.text : null;

    if (itemType === "agent_message" && itemText && itemText.trim().length > 0) {
      return {
        type: "assistant_message_delta",
        message: itemText,
        payload: {
          ...parsed,
          assistantDelta: {
            mode: "replace",
            text: itemText,
          },
        },
      };
    }

    if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
      return {
        type: "assistant_message_delta",
        message: parsed.delta,
        payload: {
          ...parsed,
          assistantDelta: {
            mode: "append",
            text: parsed.delta,
          },
        },
      };
    }

    const message = typeof parsed.message === "string" ? parsed.message : line;
    return {
      type: parsed.type === "error" ? "error" : "log",
      message,
      payload: parsed,
    };
  } catch {
    return null;
  }
}
