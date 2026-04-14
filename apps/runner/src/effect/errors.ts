import { Data } from "effect";

const MAX_TAIL_LINES = 8;

export class RunnerStateError extends Data.TaggedError("RunnerStateError")<{
  readonly message: string;
  readonly hint?: string;
}> {}

export class GitCommandError extends Data.TaggedError("GitCommandError")<{
  readonly command: string;
  readonly exitCode: number | null;
  readonly hint?: string;
  readonly message: string;
  readonly phase: string;
  readonly stderrTail: ReadonlyArray<string>;
  readonly stdoutTail: ReadonlyArray<string>;
}> {}

export class WorkspaceOperationError extends Data.TaggedError("WorkspaceOperationError")<{
  readonly hint?: string;
  readonly message: string;
  readonly operation: "cleanup" | "create" | "create-root";
  readonly workspacePath: string;
}> {}

export function inferGitHint(command: string, lines: ReadonlyArray<string>) {
  const text = [command, ...lines].join("\n");

  if (
    text.includes("xcodebuild -license") ||
    text.includes("Xcode license agreements") ||
    text.includes("license agreements are not accepted")
  ) {
    return "Run `sudo xcodebuild -license` on this machine, then retry the task.";
  }

  if (
    text.includes("Authentication failed") ||
    text.includes("could not read Username") ||
    text.includes("Repository not found")
  ) {
    return "The repository credentials look invalid. Reconnect the repository and retry.";
  }

  if (text.includes("not a git repository")) {
    return "Repository setup did not finish cleanly. Retry the task to recreate the workspace.";
  }

  if (text.includes("couldn't find remote ref") || text.includes("pathspec")) {
    return "The requested branch does not exist on origin. Pick an existing branch or update the repository settings.";
  }

  return undefined;
}

export function toLineTail(lines: string[]) {
  return lines.slice(-MAX_TAIL_LINES);
}

export function getRunnerErrorMessage(error: unknown) {
  if (error instanceof GitCommandError) {
    const detail = error.stderrTail.join("\n") || error.stdoutTail.join("\n");

    return [
      error.message,
      detail ? `Recent output:\n${detail}` : null,
      error.hint ? `What to do:\n${error.hint}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n\n");
  }

  if (error instanceof RunnerStateError) {
    return [error.message, error.hint ? `What to do:\n${error.hint}` : null]
      .filter((value): value is string => Boolean(value))
      .join("\n\n");
  }

  if (error instanceof WorkspaceOperationError) {
    return [
      error.message,
      `Workspace path:\n${error.workspacePath}`,
      error.hint ? `What to do:\n${error.hint}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Run failed";
}
