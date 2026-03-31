import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

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
    await mkdir(this.workspaceRoot, {
      recursive: true,
    });

    const workspacePath = join(this.workspaceRoot, runId);
    await mkdir(workspacePath, {
      recursive: true,
    });

    return workspacePath;
  }

  async cleanupWorkspace(workspacePath: string, status: "cancelled" | "completed" | "failed") {
    if (this.cleanupMode !== "delete_on_completion") {
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

    await rm(workspacePath, {
      force: true,
      recursive: true,
    });

    return {
      attempted: true,
      reason: null,
    };
  }
}
