import { describe, expect, mock, test } from "bun:test";
import { Effect } from "effect";

import { runFlow } from "../services/execution/run-flow";

describe("runFlow", () => {
  test("completes a codex-only run and cleans up the workspace", async () => {
    const transitionStatus = mock(async () => undefined);
    const cleanupWorkspace = mock(async () => undefined);
    const appendCompletedEvent = mock(async () => undefined);

    await Effect.runPromise(
      runFlow({
        agentProvider: "codex",
        commands: [],
        getReusableWorkspace: async () => null,
        createWorkspace: async () => ({ id: "run-1", path: "/tmp/run-1", backend: "local" }),
        appendCompletedEvent,
        appendFailedEvent: async () => undefined,
        cleanupWorkspace,
        executeClaudeAgent: async () => undefined,
        executeCodexAgent: async () => undefined,
        executeCommand: async () => undefined,
        getFailureMessage: (error) => error instanceof Error ? error.message : "Run failed",
        hasRepository: false,
        markRunStarted: () => undefined,
        onWorkspaceCreated: async () => undefined,
        onWorkspaceReused: async () => undefined,
        prepareBranch: async () => undefined,
        cloneRepository: async () => undefined,
        transitionStatus,
        waitUntilRunnable: async () => undefined,
      }),
    );

    expect(transitionStatus).toHaveBeenCalledWith("provisioning", "Provisioning host-local workspace", "running");
    expect(transitionStatus).toHaveBeenCalledWith("running", "Starting Codex agent session");
    expect(transitionStatus).toHaveBeenCalledWith("completed", "Run completed successfully", "completed");
    expect(appendCompletedEvent).toHaveBeenCalledTimes(1);
    expect(cleanupWorkspace).toHaveBeenCalledWith("completed");
  });

  test("records a failed event when a run step throws", async () => {
    const transitionStatus = mock(async () => undefined);
    const appendFailedEvent = mock(async () => undefined);
    const cleanupWorkspace = mock(async () => undefined);

    await Effect.runPromise(
      runFlow({
        agentProvider: "none",
        commands: [],
        getReusableWorkspace: async () => null,
        createWorkspace: async () => ({ id: "run-2", path: "/tmp/run-2", backend: "local" }),
        appendCompletedEvent: async () => undefined,
        appendFailedEvent,
        cleanupWorkspace,
        executeClaudeAgent: async () => undefined,
        executeCodexAgent: async () => undefined,
        executeCommand: async () => undefined,
        getFailureMessage: (error) => error instanceof Error ? error.message : "Readable failure",
        hasRepository: false,
        markRunStarted: () => undefined,
        onWorkspaceCreated: async () => undefined,
        onWorkspaceReused: async () => undefined,
        prepareBranch: async () => undefined,
        cloneRepository: async () => undefined,
        transitionStatus,
        waitUntilRunnable: async () => undefined,
      }),
    );

    expect(transitionStatus).toHaveBeenCalledWith("failed", "Run has no commands configured", "failed", "Run has no commands configured");
    expect(appendFailedEvent).toHaveBeenCalledWith("Run has no commands configured");
    expect(cleanupWorkspace).toHaveBeenCalledWith("failed");
  });

  test("re-prepares the repository when reusing an existing workspace", async () => {
    const transitionStatus = mock(async () => undefined);
    const prepareBranch = mock(async () => undefined);

    await Effect.runPromise(
      runFlow({
        agentProvider: "none",
        commands: [{ command: "echo ok" } as any],
        getReusableWorkspace: async () => ({ id: "run-3", path: "/tmp/run-3", backend: "local" }),
        createWorkspace: async () => ({ id: "run-3", path: "/tmp/run-3", backend: "local" }),
        appendCompletedEvent: async () => undefined,
        appendFailedEvent: async () => undefined,
        cleanupWorkspace: async () => undefined,
        executeClaudeAgent: async () => undefined,
        executeCodexAgent: async () => undefined,
        executeCommand: async () => undefined,
        getFailureMessage: (error) => error instanceof Error ? error.message : "Run failed",
        hasRepository: true,
        markRunStarted: () => undefined,
        onWorkspaceCreated: async () => undefined,
        onWorkspaceReused: async () => undefined,
        prepareBranch,
        cloneRepository: async () => undefined,
        transitionStatus,
        waitUntilRunnable: async () => undefined,
      }),
    );

    expect(transitionStatus).toHaveBeenCalledWith("cloning", "Refreshing repository workspace");
    expect(prepareBranch).toHaveBeenCalledTimes(1);
  });
});
