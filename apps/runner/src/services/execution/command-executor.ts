import { CommandTimedOutError } from "./errors";

export interface ControlledSubprocess {
  pid: number;
  kill(signal?: number | NodeJS.Signals): void;
}

export interface CommandExecutionController {
  attachProcess(process: ControlledSubprocess): void;
  detachProcess(process: ControlledSubprocess): void;
  isCancelRequested(): boolean;
  terminateProcess(signal?: NodeJS.Signals): void;
}

export interface CommandExecutionRequest {
  command: string;
  control: CommandExecutionController;
  cwd: string;
  env?: Record<string, string>;
  onStderrLine?: (line: string) => Promise<void> | void;
  onStdoutLine?: (line: string) => Promise<void> | void;
  timeoutMs?: number;
}

export interface CommandExecutionResult {
  durationMs: number;
  exitCode: number;
}

const DEFAULT_CHILD_PATH = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";
const CHILD_ENV_ALLOWLIST = [
  "CI",
  "FORCE_COLOR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NO_COLOR",
  "PATH",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
] as const;

export function buildChildProcessEnv(
  explicitEnv: Record<string, string> | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  env.PATH ??= DEFAULT_CHILD_PATH;

  if (explicitEnv) {
    for (const [key, value] of Object.entries(explicitEnv)) {
      env[key] = value;
    }
  }

  return env;
}

async function consumeStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  onLine: ((line: string) => Promise<void> | void) | undefined,
) {
  if (!stream || !onLine) {
    return;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value) {
      buffer += decoder.decode(value, {
        stream: true,
      });
    }

    while (true) {
      const nextLineBreak = buffer.indexOf("\n");
      if (nextLineBreak === -1) {
        break;
      }

      const line = buffer.slice(0, nextLineBreak).replace(/\r$/, "");
      buffer = buffer.slice(nextLineBreak + 1);
      await onLine(line);
    }
  }

  if (buffer.length > 0) {
    await onLine(buffer.replace(/\r$/, ""));
  }
}

export class CommandExecutor {
  async execute(request: CommandExecutionRequest): Promise<CommandExecutionResult> {
    const startedAt = Date.now();
    const subprocess = Bun.spawn({
      cmd: ["/bin/zsh", "-lc", request.command],
      cwd: request.cwd,
      env: buildChildProcessEnv(request.env),
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
    });

    request.control.attachProcess(subprocess);

    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (request.timeoutMs !== undefined) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        request.control.terminateProcess("SIGTERM");

        setTimeout(() => {
          request.control.terminateProcess("SIGKILL");
        }, 2_000).unref();
      }, request.timeoutMs);
    }

    const stdoutPromise = consumeStream(subprocess.stdout, request.onStdoutLine);
    const stderrPromise = consumeStream(subprocess.stderr, request.onStderrLine);
    const exitCode = await subprocess.exited;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    await Promise.all([stdoutPromise, stderrPromise]);
    request.control.detachProcess(subprocess);

    if (timedOut) {
      throw new CommandTimedOutError(`Command timed out after ${request.timeoutMs}ms`);
    }

    return {
      durationMs: Date.now() - startedAt,
      exitCode,
    };
  }
}
