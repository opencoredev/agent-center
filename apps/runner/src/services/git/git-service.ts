import { createGitHubProvider } from "../../../../../packages/github/src/index.ts";

import { shellQuote } from "../../lib/shell";
import type { LoadedRunTarget } from "../../repositories/run-repository";
import type {
  CommandExecutionController,
} from "../execution/command-executor";
import { CommandExecutor } from "../execution/command-executor";
import { RunPersistence } from "../execution/persistence";

interface GitStepContext {
  control: CommandExecutionController;
  persistence: RunPersistence;
  workspacePath: string;
}

function buildGitLogPayload(phase: string, stream: "stderr" | "stdout") {
  return {
    phase,
    source: "git",
    stream,
  };
}

export class GitService {
  #executor: CommandExecutor;
  #githubProvider = createGitHubProvider();

  constructor(executor: CommandExecutor) {
    this.#executor = executor;
  }

  async cloneRepository(target: LoadedRunTarget, context: GitStepContext) {
    const repoConnection = target.repoConnection;

    if (!repoConnection) {
      return;
    }

    if (repoConnection.provider !== "github") {
      throw new Error(`Runner only supports github clone operations in this phase`);
    }

    const cloneUrl = this.#githubProvider.buildCloneUrl({
      authType: repoConnection.authType,
      connectionMetadata: repoConnection.connectionMetadata,
      owner: repoConnection.owner,
      repo: repoConnection.repo,
    });

    await context.persistence.appendEvent({
      eventType: "repo.clone.started",
      level: "info",
      message: `Cloning ${repoConnection.owner}/${repoConnection.repo}`,
      payload: {
        cloneUrl: cloneUrl.redactedUrl,
        provider: repoConnection.provider,
      },
    });

    await this.#runGitCommand(
      `git clone --origin origin ${shellQuote(cloneUrl.unwrap())} .`,
      context,
      "clone",
      5 * 60_000,
    );

    await context.persistence.appendEvent({
      eventType: "repo.clone.finished",
      level: "info",
      message: `Clone completed for ${repoConnection.owner}/${repoConnection.repo}`,
      payload: {
        provider: repoConnection.provider,
        workspacePath: context.workspacePath,
      },
    });
  }

  async prepareBranch(target: LoadedRunTarget, context: GitStepContext) {
    if (!target.repoConnection) {
      return;
    }

    const baseBranch =
      target.run.baseBranch ??
      target.repoConnection.defaultBranch ??
      target.project?.defaultBranch ??
      "main";
    const branchName = target.run.branchName;

    await this.#runGitCommand("git fetch origin --prune", context, "git");

    if (branchName) {
      const hasRemoteBranch = await this.#runGitCheck(
        `git show-ref --verify --quiet ${shellQuote(`refs/remotes/origin/${branchName}`)}`,
        context,
      );

      if (hasRemoteBranch) {
        await this.#runGitCommand(
          `git checkout -B ${shellQuote(branchName)} ${shellQuote(`origin/${branchName}`)}`,
          context,
          "git",
        );

        return;
      }

      await this.#runGitCommand(
        `git checkout -B ${shellQuote(branchName)} ${shellQuote(`origin/${baseBranch}`)}`,
        context,
        "git",
      );

      return;
    }

    await this.#runGitCommand(
      `git checkout -B ${shellQuote(baseBranch)} ${shellQuote(`origin/${baseBranch}`)}`,
      context,
      "git",
    );
  }

  async #runGitCheck(command: string, context: GitStepContext) {
    const result = await this.#runGitCommand(command, context, "git-check", undefined, false);
    return result.exitCode === 0;
  }

  async #runGitCommand(
    command: string,
    context: GitStepContext,
    phase: string,
    timeoutMs = 60_000,
    rejectOnFailure = true,
  ) {
    const result = await this.#executor.execute({
      command,
      control: context.control,
      cwd: context.workspacePath,
      env: {
        GIT_TERMINAL_PROMPT: "0",
      },
      onStderrLine: async (line) => {
        await context.persistence.appendLog(line, buildGitLogPayload(phase, "stderr"));
      },
      onStdoutLine: async (line) => {
        await context.persistence.appendLog(line, buildGitLogPayload(phase, "stdout"));
      },
      timeoutMs,
    });

    if (rejectOnFailure && result.exitCode !== 0) {
      throw new Error(`Git command failed (${result.exitCode}): ${command}`);
    }

    return result;
  }
}
