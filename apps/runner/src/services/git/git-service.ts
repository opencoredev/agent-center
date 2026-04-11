import { Effect } from "effect";

import { createGitHubProvider } from "../../../../../packages/github/src/index.ts";

import {
  GitCommandError,
  RunnerStateError,
  inferGitHint,
  toLineTail,
} from "../../effect/errors";
import { runEffectOrThrow } from "../../effect/runtime";
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

function resolveGitBinary() {
  const configured = process.env.RUNNER_GIT_BIN?.trim();

  if (configured) {
    return configured;
  }

  const preferred = [
    "/opt/homebrew/bin/git",
    process.env.HOME ? `${process.env.HOME}/.local/bin/git` : null,
    "git",
  ].filter((value): value is string => Boolean(value));

  return preferred[0] ?? "git";
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
  #gitBinary = resolveGitBinary();

  constructor(executor: CommandExecutor) {
    this.#executor = executor;
  }

  async cloneRepository(target: LoadedRunTarget, context: GitStepContext) {
    await runEffectOrThrow(this.#cloneRepositoryEffect(target, context), "Repository clone");
  }

  async prepareBranch(target: LoadedRunTarget, context: GitStepContext) {
    await runEffectOrThrow(this.#prepareBranchEffect(target, context), "Branch preparation");
  }

  async #runGitCheck(command: string, context: GitStepContext) {
    return runEffectOrThrow(
      this.#runGitCommandEffect(command, context, "git-check", undefined, false).pipe(
        Effect.map((result) => result.exitCode === 0),
      ),
      "Git check",
    );
  }

  #cloneRepositoryEffect(target: LoadedRunTarget, context: GitStepContext) {
    return Effect.gen(this, function* () {
      const repoConnection = target.repoConnection;

      if (!repoConnection) {
        return;
      }

      if (repoConnection.provider !== "github") {
        return yield* new RunnerStateError({
          message: "Runner only supports GitHub clone operations right now.",
          hint: "Reconnect the repository with the GitHub provider before retrying.",
        });
      }

      const cloneUrl = this.#githubProvider.buildCloneUrl({
        authType: repoConnection.authType,
        connectionMetadata: repoConnection.connectionMetadata,
        owner: repoConnection.owner,
        repo: repoConnection.repo,
      });

      yield* Effect.tryPromise(() =>
        context.persistence.appendEvent({
          eventType: "repo.clone.started",
          level: "info",
          message: `Cloning ${repoConnection.owner}/${repoConnection.repo}`,
          payload: {
            cloneUrl: cloneUrl.redactedUrl,
            provider: repoConnection.provider,
          },
        }),
      );

      yield* this.#runGitCommandEffect(
        `${shellQuote(this.#gitBinary)} clone --origin origin ${shellQuote(cloneUrl.unwrap())} .`,
        context,
        "clone",
        5 * 60_000,
      );

      yield* Effect.tryPromise(() =>
        context.persistence.appendEvent({
          eventType: "repo.clone.finished",
          level: "info",
          message: `Clone completed for ${repoConnection.owner}/${repoConnection.repo}`,
          payload: {
            provider: repoConnection.provider,
            workspacePath: context.workspacePath,
          },
        }),
      );
    });
  }

  #prepareBranchEffect(target: LoadedRunTarget, context: GitStepContext) {
    return Effect.gen(this, function* () {
      if (!target.repoConnection) {
        return;
      }

      const baseBranch =
        target.run.baseBranch ??
        target.repoConnection.defaultBranch ??
        target.project?.defaultBranch ??
        "main";
      const branchName = target.run.branchName;

      yield* this.#runGitCommandEffect(
        `${shellQuote(this.#gitBinary)} fetch origin --prune`,
        context,
        "git",
      );

      if (branchName) {
        const hasRemoteBranch = yield* this.#runGitCommandEffect(
          `${shellQuote(this.#gitBinary)} show-ref --verify --quiet ${shellQuote(`refs/remotes/origin/${branchName}`)}`,
          context,
          "git-check",
          undefined,
          false,
        ).pipe(Effect.map((result) => result.exitCode === 0));

        if (hasRemoteBranch) {
          yield* this.#runGitCommandEffect(
            `${shellQuote(this.#gitBinary)} checkout -B ${shellQuote(branchName)} ${shellQuote(`origin/${branchName}`)}`,
            context,
            "git",
          );

          return;
        }

        yield* this.#runGitCommandEffect(
          `${shellQuote(this.#gitBinary)} checkout -B ${shellQuote(branchName)} ${shellQuote(`origin/${baseBranch}`)}`,
          context,
          "git",
        );

        return;
      }

      yield* this.#runGitCommandEffect(
        `${shellQuote(this.#gitBinary)} checkout -B ${shellQuote(baseBranch)} ${shellQuote(`origin/${baseBranch}`)}`,
        context,
        "git",
      );
    });
  }

  #runGitCommandEffect(
    command: string,
    context: GitStepContext,
    phase: string,
    timeoutMs = 60_000,
    rejectOnFailure = true,
  ) {
    return Effect.tryPromise({
      try: async () => {
        const stderrLines: string[] = [];
        const stdoutLines: string[] = [];
        const result = await this.#executor.execute({
          command,
          control: context.control,
          cwd: context.workspacePath,
          env: {
            GIT_TERMINAL_PROMPT: "0",
          },
          onStderrLine: async (line) => {
            stderrLines.push(line);
            await context.persistence.appendLog(line, buildGitLogPayload(phase, "stderr"));
          },
          onStdoutLine: async (line) => {
            stdoutLines.push(line);
            await context.persistence.appendLog(line, buildGitLogPayload(phase, "stdout"));
          },
          timeoutMs,
        });

        if (rejectOnFailure && result.exitCode !== 0) {
          const tail = [...toLineTail(stderrLines), ...toLineTail(stdoutLines)];

          throw new GitCommandError({
            command,
            exitCode: result.exitCode,
            hint: inferGitHint(command, tail),
            message: `Git ${phase} failed with exit code ${result.exitCode}.`,
            phase,
            stderrTail: toLineTail(stderrLines),
            stdoutTail: toLineTail(stdoutLines),
          });
        }

        return result;
      },
      catch: (error) => {
        if (error instanceof GitCommandError) {
          return error;
        }

        return new RunnerStateError({
          message: error instanceof Error ? error.message : `Git ${phase} failed unexpectedly.`,
          hint: "Check the run logs for the failing git step, then retry the task.",
        });
      },
    });
  }
}
