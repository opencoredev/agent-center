import { describe, expect, test } from "bun:test";

import {
  getRunnerErrorMessage,
  GitCommandError,
  inferGitHint,
  WorkspaceOperationError,
} from "../effect/errors";

describe("effect error helpers", () => {
  test("adds actionable guidance for missing Xcode license", () => {
    const hint = inferGitHint("git clone https://github.com/openai/openai.git .", [
      "xcodebuild: error: The license agreements are not accepted.",
    ]);

    expect(hint).toContain("xcodebuild -license");
  });

  test("renders workspace errors with path and remediation", () => {
    const message = getRunnerErrorMessage(
      new WorkspaceOperationError({
        message: "Runner could not create the workspace for run run_123.",
        operation: "create",
        workspacePath: "/tmp/agent-center/run_123",
        hint: "Fix permissions and retry.",
      }),
    );

    expect(message).toContain("Runner could not create the workspace");
    expect(message).toContain("/tmp/agent-center/run_123");
    expect(message).toContain("Fix permissions and retry");
  });

  test("renders git errors with recent output and remediation", () => {
    const message = getRunnerErrorMessage(
      new GitCommandError({
        command: "git fetch origin --prune",
        exitCode: 128,
        hint: "Reconnect the repository and retry.",
        message: "Git fetch failed with exit code 128.",
        phase: "git",
        stderrTail: ["fatal: Authentication failed"],
        stdoutTail: [],
      }),
    );

    expect(message).toContain("Git fetch failed with exit code 128.");
    expect(message).toContain("fatal: Authentication failed");
    expect(message).toContain("Reconnect the repository and retry.");
  });
});
