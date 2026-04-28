import { Effect } from "effect";

import type { ExecutionCommand, RunStatus } from "@agent-center/shared";

import type { WorkspaceHandle } from "./backends/types";
import { CancelledError } from "./errors";

type TaskStatus = "cancelled" | "completed" | "failed" | "running";
type CleanupStatus = "cancelled" | "completed" | "failed";

interface RunFlowDeps {
  agentProvider: string;
  commands: ExecutionCommand[];
  getReusableWorkspace: () => Promise<WorkspaceHandle | null>;
  createWorkspace: () => Promise<WorkspaceHandle>;
  appendCompletedEvent: () => Promise<void>;
  cleanupWorkspace: (status: CleanupStatus) => Promise<void>;
  appendFailedEvent: (message: string) => Promise<void>;
  executeClaudeAgent: () => Promise<void>;
  executeCodexAgent: () => Promise<void>;
  executeOpenCodeAgent: () => Promise<void>;
  executeCursorAgent: () => Promise<void>;
  executeCommand: (command: ExecutionCommand, index: number, total: number) => Promise<void>;
  getFailureMessage: (error: unknown) => string;
  hasRepository: boolean;
  markRunStarted: () => void;
  onWorkspaceCreated: (workspace: WorkspaceHandle) => Promise<void>;
  onWorkspaceReused: (workspace: WorkspaceHandle) => Promise<void>;
  prepareBranch: () => Promise<void>;
  cloneRepository: () => Promise<void>;
  transitionStatus: (
    status: RunStatus,
    message: string,
    taskStatus?: TaskStatus,
    errorMessage?: string,
  ) => Promise<void>;
  waitUntilRunnable: () => Promise<void>;
}

function fromPromise<A>(operation: () => Promise<A>) {
  return Effect.tryPromise({
    try: operation,
    catch: (error) => (error instanceof Error ? error : new Error("Run flow step failed")),
  });
}

export function runFlow(deps: RunFlowDeps) {
  const runBody = Effect.gen(function* () {
    deps.markRunStarted();

    const reusableWorkspace = yield* fromPromise(deps.getReusableWorkspace);

    if (reusableWorkspace) {
      yield* fromPromise(() => deps.onWorkspaceReused(reusableWorkspace));
      if (deps.hasRepository) {
        yield* fromPromise(() =>
          deps.transitionStatus("cloning", "Refreshing repository workspace"),
        );
        yield* fromPromise(deps.waitUntilRunnable);
        yield* fromPromise(deps.prepareBranch);
      }
    } else {
      yield* fromPromise(() =>
        deps.transitionStatus("provisioning", "Provisioning host-local workspace", "running"),
      );
      yield* fromPromise(deps.waitUntilRunnable);

      const workspaceHandle = yield* fromPromise(deps.createWorkspace);
      yield* fromPromise(() => deps.onWorkspaceCreated(workspaceHandle));

      if (deps.hasRepository) {
        yield* fromPromise(() =>
          deps.transitionStatus("cloning", "Cloning repository into local workspace"),
        );
        yield* fromPromise(deps.waitUntilRunnable);
        yield* fromPromise(deps.cloneRepository);
        yield* fromPromise(deps.prepareBranch);
      }
    }

    if (deps.agentProvider === "claude") {
      yield* fromPromise(() =>
        deps.transitionStatus("running", "Starting Claude Code agent session"),
      );
      yield* fromPromise(deps.waitUntilRunnable);
      yield* fromPromise(deps.executeClaudeAgent);
    }

    if (deps.agentProvider === "codex") {
      yield* fromPromise(() => deps.transitionStatus("running", "Starting Codex agent session"));
      yield* fromPromise(deps.waitUntilRunnable);
      yield* fromPromise(deps.executeCodexAgent);
    }

    if (deps.agentProvider === "opencode") {
      yield* fromPromise(() => deps.transitionStatus("running", "Starting OpenCode agent session"));
      yield* fromPromise(deps.waitUntilRunnable);
      yield* fromPromise(deps.executeOpenCodeAgent);
    }

    if (deps.agentProvider === "cursor") {
      yield* fromPromise(() => deps.transitionStatus("running", "Starting Cursor agent session"));
      yield* fromPromise(deps.waitUntilRunnable);
      yield* fromPromise(deps.executeCursorAgent);
    }

    if (deps.commands.length === 0 && deps.agentProvider === "none") {
      yield* Effect.fail(new Error("Run has no commands configured"));
    }

    if (deps.commands.length > 0) {
      yield* fromPromise(() =>
        deps.transitionStatus("running", `Executing ${deps.commands.length} configured command(s)`),
      );
    }

    for (const [index, command] of deps.commands.entries()) {
      yield* fromPromise(deps.waitUntilRunnable);
      yield* fromPromise(() => deps.executeCommand(command, index + 1, deps.commands.length));
    }

    yield* fromPromise(() =>
      deps.transitionStatus("completed", "Run completed successfully", "completed"),
    );
    yield* fromPromise(deps.appendCompletedEvent);
    yield* fromPromise(() => deps.cleanupWorkspace("completed"));
  });

  return runBody.pipe(
    Effect.catchAll((error) => {
      if (error instanceof CancelledError) {
        return Effect.gen(function* () {
          yield* fromPromise(() => deps.transitionStatus("cancelled", error.message, "cancelled"));
          yield* fromPromise(() => deps.cleanupWorkspace("cancelled"));
        });
      }

      const message = deps.getFailureMessage(error);
      return Effect.gen(function* () {
        yield* fromPromise(() => deps.transitionStatus("failed", message, "failed", message));
        yield* fromPromise(() => deps.appendFailedEvent(message));
        yield* fromPromise(() => deps.cleanupWorkspace("failed"));
      });
    }),
  );
}
