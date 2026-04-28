import { buildChildProcessEnv } from "./command-executor";

export interface CliAgentExecutionRequest {
  cwd: string;
  model?: string;
  prompt: string;
  env?: Record<string, string>;
  onEvent: (event: CliAgentEvent) => Promise<void> | void;
}

export interface CliAgentEvent {
  type: "assistant_message" | "result" | "error" | "log";
  message: string;
  payload?: Record<string, unknown>;
}

export interface CliAgentExecutionResult {
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface CliAgentExecutionHandle {
  result: Promise<CliAgentExecutionResult>;
  interrupt: () => void;
  close: () => void;
}

interface CliAgentDefinition {
  displayName: string;
  binaryName: string;
  loginCommand: string;
  buildCommand: (request: CliAgentExecutionRequest) => string[];
}

export function startCliAgent(
  definition: CliAgentDefinition,
  request: CliAgentExecutionRequest,
): CliAgentExecutionHandle {
  const controller = new AbortController();
  const result = runCliAgent(definition, request, controller);

  return {
    result,
    interrupt: () => controller.abort(),
    close: () => controller.abort(),
  };
}

export async function executeCliAgent(
  definition: CliAgentDefinition,
  request: CliAgentExecutionRequest,
): Promise<CliAgentExecutionResult> {
  const handle = startCliAgent(definition, request);
  const result = await handle.result;

  if (!result.success) {
    throw new Error(result.error ?? `${definition.displayName} agent session failed`);
  }

  return result;
}

async function runCliAgent(
  definition: CliAgentDefinition,
  request: CliAgentExecutionRequest,
  controller: AbortController,
): Promise<CliAgentExecutionResult> {
  const startedAt = Date.now();
  const command = definition.buildCommand(request);

  try {
    const subprocess = Bun.spawn({
      cmd: command,
      cwd: request.cwd,
      env: buildChildProcessEnv(request.env),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal,
    });

    void pipeStream(subprocess.stdout, async (line) => {
      await request.onEvent({
        type: "log",
        message: line,
        payload: { stream: "stdout" },
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

    await request.onEvent({
      type: exitCode === 0 ? "result" : "error",
      message:
        exitCode === 0
          ? `${definition.displayName} session completed`
          : `${definition.displayName} exited with code ${exitCode}`,
      payload: { command: command[0], exitCode },
    });

    if (exitCode !== 0) {
      return {
        durationMs: Date.now() - startedAt,
        success: false,
        error: `${definition.displayName} exited with code ${exitCode}`,
      };
    }

    return {
      durationMs: Date.now() - startedAt,
      success: true,
    };
  } catch (error) {
    const message = formatCliAgentError(definition, error);
    await request.onEvent({
      type: "error",
      message,
      payload: { command: command[0] },
    });
    return {
      durationMs: Date.now() - startedAt,
      success: false,
      error: message,
    };
  }
}

function formatCliAgentError(definition: CliAgentDefinition, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;

  if (code === "ENOENT" || message.includes("ENOENT") || message.includes("not found")) {
    return `${definition.displayName} CLI binary "${definition.binaryName}" was not found on the runner host. Install it and run \`${definition.loginCommand}\` before launching ${definition.displayName} runs.`;
  }

  return message || `Unknown ${definition.displayName} execution error`;
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
