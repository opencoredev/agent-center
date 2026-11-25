import { existsSync } from "node:fs";

import { Effect } from "effect";

import { createGitHubProvider } from "../../../../../packages/github/src/index.ts";

import { GitCommandError, RunnerStateError, inferGitHint, toLineTail } from "../../effect/errors";
import { runEffectOrThrow } from "../../effect/runtime";
import { runnerRuntimeEnv } from "../../env";
import { InternalApiAuthError, fetchInternalApiJson } from "../../lib/internal-api";
import { ensureRunnerApiToken, refreshRunnerApiToken } from "../../lib/runner-bootstrap";
import { shellQuote } from "../../lib/shell";
import type { LoadedRunTarget } from "../../repositories/run-repository";
import type { CommandExecutionController } from "../execution/command-executor";
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
  ].filter((value): value is string => Boolean(value));

  return preferred.find((value) => existsSync(value)) ?? "git";
}

interface GitRemote {
  url: string;
  env: Record<string, string>;
}

/**
 * Moves credentials out of a clone URL and into a per-command HTTP header, so git never
 * writes them to `.git/config` where workspace processes could read them.
 */
function toGitRemote(rawUrl: string): GitRemote {
  const url = new URL(rawUrl);

  if (!url.username && !url.password) {
    return { url: rawUrl, env: {} };
  }

  const credentials = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
  url.username = "";
  url.password = "";

  // Workspace config can name hooks, helpers and transports that would inherit the header,
  // so authenticated commands override them.
  const config: Array<[string, string]> = [
    [
      `http.${url.origin}/.extraHeader`,
      `Authorization: Basic ${Buffer.from(credentials).toString("base64")}`,
    ],
    ["core.hooksPath", "/dev/null"],
    ["core.fsmonitor", "false"],
    ["core.askPass", ""],
    ["credential.helper", ""],
    ["protocol.allow", "never"],
    ...["ext", "fd", "file", "git", "http", "ssh"].map((name): [string, string] => [
      `protocol.${name}.allow`,
      "never",
    ]),
    ["protocol.https.allow", "always"],
    ["http.sslVerify", "true"],
  ];
  const env: Record<string, string> = { GIT_CONFIG_COUNT: String(config.length) };

  for (const [index, [key, value]] of config.entries()) {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = value;
  }

  return { url: url.toString(), env };
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

  #resolveRemoteEffect(target: LoadedRunTarget) {
    return Effect.gen(this, function* () {
      const repoConnection = target.repoConnection;

      if (!repoConnection) {
        return null;
      }

      if (repoConnection.provider !== "github") {
        return yield* new RunnerStateError({
          message: "Runner only supports GitHub clone operations right now.",
          hint: "Reconnect the repository with the GitHub provider before retrying.",
        });
      }

      const token = yield* Effect.tryPromise({
        try: () => this.#resolveRepositoryToken(target),
        catch: (error) =>
          new RunnerStateError({
            message:
              error instanceof Error
                ? error.message
                : "Runner could not obtain a GitHub installation token for this repository.",
            hint: "Check the runner registration state and GitHub App installation, then retry the task.",
          }),
      });

      const cloneUrl = this.#githubProvider.buildCloneUrl({
        authType: repoConnection.authType,
        connectionMetadata: repoConnection.connectionMetadata,
        owner: repoConnection.owner,
        repo: repoConnection.repo,
        token,
      });

      return { ...toGitRemote(cloneUrl.unwrap()), redactedUrl: cloneUrl.redactedUrl };
    });
  }

  #cloneRepositoryEffect(target: LoadedRunTarget, context: GitStepContext) {
    return Effect.gen(this, function* () {
      const repoConnection = target.repoConnection;
      const remote = yield* this.#resolveRemoteEffect(target);

      if (!repoConnection || !remote) {
        return null;
      }

      yield* Effect.tryPromise(() =>
        context.persistence.appendEvent({
          eventType: "repo.clone.started",
          level: "info",
          message: `Cloning ${repoConnection.owner}/${repoConnection.repo}`,
          payload: {
            cloneUrl: remote.redactedUrl,
            provider: repoConnection.provider,
          },
        }),
      );

      yield* this.#runGitCommandEffect(
        `${shellQuote(this.#gitBinary)} clone --origin origin ${shellQuote(remote.url)} .`,
        context,
        "clone",
        5 * 60_000,
        true,
        remote.env,
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

      return remote;
    });
  }

  async #resolveRepositoryToken(target: LoadedRunTarget) {
    const repoConnection = target.repoConnection;

    if (!repoConnection) {
      return undefined;
    }

    if (repoConnection.authType !== "github_app_installation") {
      return undefined;
    }

    await ensureRunnerApiToken({
      workspaceId: target.workspace.id,
      runnerName: "Local Runner",
    });

    const path = `/internal/github/repo-connections/${repoConnection.id}/installation-token`;
    let response: { data: { token: string } };

    try {
      response = await fetchInternalApiJson<{ data: { token: string } }>(path, undefined, {
        baseUrl: runnerRuntimeEnv.RUNNER_API_URL,
        token: runnerRuntimeEnv.RUNNER_API_TOKEN,
      });
    } catch (error) {
      if (!(error instanceof InternalApiAuthError) || error.code !== "runner_unauthorized") {
        throw error;
      }

      await refreshRunnerApiToken({
        workspaceId: target.workspace.id,
        runnerName: "Local Runner",
      });

      response = await fetchInternalApiJson<{ data: { token: string } }>(path, undefined, {
        baseUrl: runnerRuntimeEnv.RUNNER_API_URL,
        token: runnerRuntimeEnv.RUNNER_API_TOKEN,
      });
    }

    return response.data.token;
  }

  #prepareBranchEffect(target: LoadedRunTarget, context: GitStepContext) {
    return Effect.gen(this, function* () {
      if (!target.repoConnection) {
        return;
      }

      const hasGitRepo = yield* this.#runGitCommandEffect(
        `${shellQuote(this.#gitBinary)} rev-parse --is-inside-work-tree`,
        context,
        "git-check",
        undefined,
        false,
      ).pipe(Effect.map((result) => result.exitCode === 0));

      const remote = hasGitRepo
        ? yield* this.#resolveRemoteEffect(target)
        : yield* this.#cloneRepositoryEffect(target, context);

      if (hasGitRepo && remote) {
        // Older clones kept the token in the origin URL; replace it with the plain URL.
        yield* this.#runGitCommandEffect(
          `${shellQuote(this.#gitBinary)} remote set-url origin ${shellQuote(remote.url)}`,
          context,
          "git",
        );
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
        undefined,
        true,
        remote?.env,
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
    env: Record<string, string> = {},
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
            ...env,
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
