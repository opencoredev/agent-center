import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { Effect } from "effect";

import { WorkspaceOperationError } from "../../effect/errors";
import { runEffectOrThrow } from "../../effect/runtime";

interface WorkspaceServiceOptions {
  cleanupMode: "delete_on_completion" | "retain";
  workspaceRoot: string;
}

export class WorkspaceService {
  readonly cleanupMode: WorkspaceServiceOptions["cleanupMode"];
  readonly workspaceRoot: string;

  constructor(options: WorkspaceServiceOptions) {
    this.cleanupMode = options.cleanupMode;
    this.workspaceRoot = options.workspaceRoot;
  }

  async createWorkspace(runId: string) {
    const workspaceRoot = this.workspaceRoot;
    const workspacePath = join(workspaceRoot, runId);

    return runEffectOrThrow(
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () =>
            mkdir(workspaceRoot, {
              recursive: true,
            }),
          catch: (error) =>
            new WorkspaceOperationError({
              message: `Runner could not prepare the workspace root before starting run ${runId}.`,
              operation: "create-root",
              workspacePath: workspaceRoot,
              hint:
                error instanceof Error
                  ? `Filesystem error: ${error.message}. Check that the runner process can write to this directory.`
                  : "Check that the runner process can write to this directory.",
            }),
        });

        yield* Effect.tryPromise({
          try: () =>
            mkdir(workspacePath, {
              recursive: true,
            }),
          catch: (error) =>
            new WorkspaceOperationError({
              message: `Runner could not create the workspace for run ${runId}.`,
              operation: "create",
              workspacePath,
              hint:
                error instanceof Error
                  ? `Filesystem error: ${error.message}. Free the directory or fix permissions, then retry.`
                  : "Free the directory or fix permissions, then retry.",
            }),
        });

        return workspacePath;
      }),
      "Workspace creation",
    );
  }

  async cleanupWorkspace(workspacePath: string, status: "cancelled" | "completed" | "failed") {
    const cleanupMode = this.cleanupMode;

    return runEffectOrThrow(
      Effect.gen(function* () {
        if (cleanupMode !== "delete_on_completion") {
          return {
            attempted: false,
            reason: "cleanup mode is retain",
          };
        }

        if (status === "failed") {
          return {
            attempted: false,
            reason: "failed workspaces are retained for debugging",
          };
        }

        yield* Effect.tryPromise({
          try: () =>
            rm(workspacePath, {
              force: true,
              recursive: true,
            }),
          catch: (error) =>
            new WorkspaceOperationError({
              message: `Runner could not clean up workspace ${workspacePath}.`,
              operation: "cleanup",
              workspacePath,
              hint:
                error instanceof Error
                  ? `Filesystem error: ${error.message}. Remove the workspace manually or stop the process holding it open.`
                  : "Remove the workspace manually or stop the process holding it open.",
            }),
        });

        return {
          attempted: true,
          reason: null,
        };
      }),
      "Workspace cleanup",
    );
  }
}
