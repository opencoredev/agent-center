import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { createGitHubProvider } from "@agent-center/github";
import type {
  DomainMetadata,
  ExecutionConfig,
  ExecutionPolicy,
  PermissionMode,
  RunStatus,
  SandboxSize,
} from "@agent-center/shared";

import { ApiError, conflictError, notFoundError } from "../http/errors";
import {
  appendRunEvent,
  createRunRecord,
  findLatestRunForTask,
  findRunById,
  listRunEvents,
  listRunLogEvents,
  listRunsForTask,
  updateRun,
} from "../repositories/run-repository";
import { findTaskById, updateTask } from "../repositories/task-repository";
import { findWorkspaceById } from "../repositories/workspace-repository";
import {
  assertLaunchReadyExecutionConfig,
  isActiveRunStatus,
  mergeMetadata,
  withControlIntent,
  withoutControlMetadata,
} from "./helpers";
import { githubAppService } from "./github-app-service";
import { repoConnectionService } from "./repo-connection-service";
import { serializePublicationState, serializeRun, serializeRunEvent, serializeTask } from "./serializers";

interface RunCreateRequest {
  taskId: string;
  prompt?: string | null;
  baseBranch?: string | null;
  branchName?: string | null;
  sandboxSize?: SandboxSize;
  permissionMode?: PermissionMode;
  policy?: ExecutionPolicy;
  config?: ExecutionConfig;
  metadata?: DomainMetadata;
}

interface RunControlResponse {
  control: {
    accepted: true;
    applied: false;
    reason: string | null | undefined;
    requestedStatus: "paused" | "running";
  };
  run: ReturnType<typeof serializeRun>;
  statusCode: 202;
}

interface RunDiffResponse {
  available: boolean;
  error: string | null;
  hasChanges: boolean;
  patch: string | null;
  stats: string | null;
  statusLines: string[];
  workspacePath: string | null;
}

const MAX_UNTRACKED_DIFF_FILES = 20;
const githubProvider = createGitHubProvider();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function normalizeBranchName(value: string | null | undefined) {
  const branch = getString(value);

  if (!branch) {
    return null;
  }

  return branch.replace(/^refs\/heads\//, "");
}

function buildPublicationMetadata(
  currentMetadata: DomainMetadata | null | undefined,
  publication: Record<string, unknown>,
): DomainMetadata {
  return {
    ...(asRecord(currentMetadata) ?? {}),
    publication,
  };
}

interface PublicationChange {
  code: string;
  label: string;
  path: string;
  previousPath: string | null;
}

interface PublicationCommitAuthor {
  email: string;
  id: number | null;
  login: string | null;
  name: string;
  source: "fallback" | "github_app_bot";
}

interface PublicationContent {
  body: string;
  commitMessage: string;
  summary: string;
  title: string;
}

async function assertWorkspaceAccess(workspaceId: string, userId?: string) {
  if (!userId) {
    return;
  }

  const workspace = await findWorkspaceById(workspaceId);

  if (workspace === undefined) {
    throw notFoundError("workspace", workspaceId);
  }

  if (workspace.ownerId !== userId) {
    throw new ApiError(403, "workspace_forbidden", "You do not have access to this workspace", {
      workspaceId,
    });
  }
}

function resolvePublicationTitle(input: {
  generatedTitle: string;
  runConfig: ExecutionConfig;
  taskConfig: ExecutionConfig;
  prompts: string[];
}) {
  const configuredTitle = getString(input.runConfig.prTitle) ?? getString(input.taskConfig.prTitle);

  if (configuredTitle && !input.prompts.some((prompt) => normalizeText(prompt) === normalizeText(configuredTitle))) {
    return configuredTitle;
  }

  return input.generatedTitle;
}

function resolvePublicationBody(input: {
  generatedBody: string;
  runConfig: ExecutionConfig;
  taskConfig: ExecutionConfig;
  prompts: string[];
}) {
  const configuredBody = getString(input.runConfig.prBody) ?? getString(input.taskConfig.prBody);

  if (configuredBody && !input.prompts.some((prompt) => normalizeText(prompt) === normalizeText(configuredBody))) {
    return configuredBody;
  }

  return input.generatedBody;
}

function resolveCommitMessage(input: {
  generatedCommitMessage: string;
  runConfig: ExecutionConfig;
  taskConfig: ExecutionConfig;
  prompts: string[];
}) {
  const configuredCommitMessage =
    getString(input.runConfig.commitMessage) ?? getString(input.taskConfig.commitMessage);
  const normalizedCommitMessage = normalizeText(configuredCommitMessage);

  if (
    configuredCommitMessage &&
    !/^chore:\s+publish\b/.test(normalizedCommitMessage) &&
    !input.prompts.some((prompt) => normalizeText(prompt) === normalizedCommitMessage)
  ) {
    return configuredCommitMessage;
  }

  return (
    input.generatedCommitMessage
  );
}

function unquoteGitPath(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

function parsePublicationChanges(statusLines: string[]) {
  return statusLines
    .map((line) => {
      if (line.startsWith("?? ")) {
        return {
          code: "??",
          label: "added",
          path: unquoteGitPath(line.slice(3)),
          previousPath: null,
        } satisfies PublicationChange;
      }

      const match = line.match(/^(.{1,2})\s+(.*)$/);
      const statusCode = match?.[1] ?? line.slice(0, 2);
      const rawPath = match?.[2]?.trim() ?? line.slice(2).trim();

      if (!rawPath) {
        return null;
      }

      const [previousPath, currentPath] = rawPath.includes(" -> ")
        ? rawPath.split(/\s+->\s+/, 2)
        : [null, rawPath];
      const normalizedCode = statusCode.trim();
      const label = normalizedCode.includes("R")
        ? "renamed"
        : normalizedCode.includes("D")
          ? "deleted"
          : normalizedCode.includes("A")
            ? "added"
            : "modified";

      return {
        code: statusCode,
        label,
        path: unquoteGitPath(currentPath ?? rawPath),
        previousPath: previousPath ? unquoteGitPath(previousPath) : null,
      } satisfies PublicationChange;
    })
    .filter((change): change is PublicationChange => Boolean(change));
}

function describeChangedFiles(changes: PublicationChange[]) {
  const firstChange = changes[0];

  if (!firstChange) {
    return "repository updates";
  }

  const secondChange = changes[1];
  const firstFile = firstChange.path.split("/").at(-1) ?? firstChange.path;

  if (changes.length === 1) {
    return `\`${firstFile}\``;
  }

  if (changes.length === 2 && secondChange) {
    const secondFile = secondChange.path.split("/").at(-1) ?? secondChange.path;
    return `\`${firstFile}\` and \`${secondFile}\``;
  }

  return `\`${firstFile}\` and ${changes.length - 1} other file${changes.length - 1 === 1 ? "" : "s"}`;
}

function inferChangeVerb(changes: PublicationChange[]) {
  if (changes.length === 0) {
    return "update";
  }

  const labels = new Set(changes.map((change) => change.label));

  if (labels.size === 1) {
    if (labels.has("added")) {
      return "add";
    }

    if (labels.has("deleted")) {
      return "remove";
    }

    if (labels.has("renamed")) {
      return "rename";
    }
  }

  return "update";
}

function capitalize(value: string) {
  return value.length > 0 ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

function extractAssistantSummary(values: unknown[]) {
  const seen = new Set<string>();

  for (const value of values) {
    const candidate = getString(value);

    if (!candidate) {
      continue;
    }

    const normalized = normalizeText(candidate);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);

    if (candidate.length <= 240 && !candidate.includes("\n")) {
      return candidate;
    }
  }

  return null;
}

function inferCommitType(summary: string | null, changes: PublicationChange[]) {
  const normalizedSummary = normalizeText(summary);

  if (/\b(fix|bug|regression|correct|repair)\b/.test(normalizedSummary)) {
    return "fix";
  }

  if (/\b(add|introduce|support|create|implement)\b/.test(normalizedSummary)) {
    return "feat";
  }

  if (changes.every((change) => change.label === "added")) {
    return "feat";
  }

  return "chore";
}

function buildPublicationContent(input: {
  statusLines: string[];
  assistantSummary: string | null;
  originalTask: string;
}) {
  const changes = parsePublicationChanges(input.statusLines);
  const filesDescription = describeChangedFiles(changes);
  const verb = inferChangeVerb(changes);
  const fallbackSummary = `${capitalize(verb)} ${filesDescription}`;
  const summary = truncateText(input.assistantSummary ?? fallbackSummary, 120);
  const title = truncateText(input.assistantSummary ?? fallbackSummary, 72);
  const commitSubject = truncateText(
    input.assistantSummary ? normalizeText(input.assistantSummary) : `${verb} ${filesDescription}`,
    64,
  );
  const commitMessage = `${inferCommitType(input.assistantSummary, changes)}: ${commitSubject}`;
  const changedFilesSection =
    changes.length > 0
      ? changes
          .map((change) =>
            `- \`${change.code}\` \`${change.path}\`${change.previousPath ? ` (from \`${change.previousPath}\`)` : ""}`,
          )
          .join("\n")
      : "- No file-level status details were available.";
  const summaryLines = [input.assistantSummary ? `- ${truncateText(input.assistantSummary, 240)}` : null]
    .filter((line): line is string => Boolean(line));

  if (!input.assistantSummary) {
    summaryLines.push(`- ${capitalize(verb)} ${filesDescription}.`);
  }

  summaryLines.push(`- Changed ${changes.length || input.statusLines.length || 0} file${changes.length === 1 ? "" : "s"}.`);

  return {
    title,
    summary,
    commitMessage,
    body: [
      "## Summary",
      ...summaryLines,
      "",
      "## Files Changed",
      changedFilesSection,
      "",
      "<details>",
      "<summary>Original task</summary>",
      "",
      input.originalTask,
      "",
      "</details>",
    ].join("\n"),
  } satisfies PublicationContent;
}

async function runGitCommand(workspacePath: string, args: string[]) {
  const subprocess = Bun.spawn({
    cmd: ["git", ...args],
    cwd: workspacePath,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    subprocess.stdout ? new Response(subprocess.stdout).text() : Promise.resolve(""),
    subprocess.stderr ? new Response(subprocess.stderr).text() : Promise.resolve(""),
    subprocess.exited,
  ]);

  return {
    exitCode,
    stderr: stderr.trim(),
    stdout: stdout.trim(),
  };
}

async function runGitCommandChecked(workspacePath: string, args: string[], message: string) {
  const result = await runGitCommand(workspacePath, args);

  if (result.exitCode !== 0) {
    throw new ApiError(500, "git_command_failed", message, {
      args,
      stderr: result.stderr,
      stdout: result.stdout,
      workspacePath,
    });
  }

  return result;
}

async function getUntrackedFiles(workspacePath: string) {
  const status = await runGitCommand(workspacePath, ["status", "--short", "--untracked-files=all"]);

  return status.stdout
    .split("\n")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).trim())
    .map(unquoteGitPath)
    .filter(Boolean);
}

async function buildUntrackedDiff(workspacePath: string, files: string[]) {
  const patches: string[] = [];
  const stats: string[] = [];

  for (const file of files.slice(0, MAX_UNTRACKED_DIFF_FILES)) {
    const patch = await runGitCommand(workspacePath, ["diff", "--patch", "--no-index", "--", "/dev/null", file]);
    if (patch.stdout) {
      patches.push(patch.stdout);
    }

    const stat = await runGitCommand(workspacePath, ["diff", "--stat", "--no-index", "--", "/dev/null", file]);
    if (stat.stdout) {
      stats.push(stat.stdout);
    }
  }

  return {
    patch: patches.join("\n"),
    stats: stats.join("\n"),
  };
}

function resolveWorkspacePath(workspacePath: string) {
  const candidates = isAbsolute(workspacePath)
    ? [workspacePath]
    : [
        resolve(process.cwd(), workspacePath),
        resolve(process.cwd(), "..", "runner", workspacePath),
        resolve(process.cwd(), "..", "..", "apps", "runner", workspacePath),
      ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function readWorkspaceDiff(workspacePath: string): Promise<RunDiffResponse> {
  const resolvedWorkspacePath = resolveWorkspacePath(workspacePath);
  if (!resolvedWorkspacePath) {
    return {
      available: false,
      error: "Run workspace is not accessible from the API process in this deployment.",
      hasChanges: false,
      patch: null,
      stats: null,
      statusLines: [],
      workspacePath: null,
    };
  }

  const status = await runGitCommand(resolvedWorkspacePath, ["status", "--short", "--untracked-files=all"]);

  if (status.exitCode !== 0) {
    return {
      available: false,
      error: status.stderr || "Git status failed for this run workspace.",
      hasChanges: false,
      patch: null,
      stats: null,
      statusLines: [],
      workspacePath: resolvedWorkspacePath,
    };
  }

  const untrackedFiles = await getUntrackedFiles(resolvedWorkspacePath);

  let patch = await runGitCommand(resolvedWorkspacePath, ["diff", "--patch", "--minimal", "HEAD", "--"]);
  let stats = await runGitCommand(resolvedWorkspacePath, ["diff", "--stat", "--minimal", "HEAD", "--"]);

  let missingHead =
    patch.exitCode !== 0 &&
    (patch.stderr.includes("ambiguous argument 'HEAD'") || patch.stderr.includes("bad revision 'HEAD'"));

  if (missingHead) {
    patch = await runGitCommand(resolvedWorkspacePath, ["diff", "--patch", "--minimal", "--"]);
    stats = await runGitCommand(resolvedWorkspacePath, ["diff", "--stat", "--minimal", "--"]);
    missingHead = false;
  }

  const untrackedDiff = await buildUntrackedDiff(resolvedWorkspacePath, untrackedFiles);
  const combinedPatch = [patch.stdout, untrackedDiff.patch].filter(Boolean).join("\n");
  const truncatedUntrackedCount = Math.max(0, untrackedFiles.length - MAX_UNTRACKED_DIFF_FILES);
  const combinedStats = [
    stats.stdout,
    untrackedDiff.stats,
    truncatedUntrackedCount > 0
      ? `... ${truncatedUntrackedCount} additional untracked file${truncatedUntrackedCount === 1 ? "" : "s"} omitted`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    available: true,
    error:
      patch.exitCode !== 0 && !missingHead
        ? (patch.stderr || "Git diff failed for this run workspace.")
        : null,
    hasChanges: status.stdout.length > 0 || combinedPatch.length > 0,
    patch: combinedPatch || null,
    stats: combinedStats || null,
    statusLines: status.stdout.length > 0 ? status.stdout.split("\n").filter(Boolean) : [],
    workspacePath: resolvedWorkspacePath,
  };
}

function slugifyBranchSegment(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, 32) || "task";
}

function resolvePublishBranchName(input: {
  currentBranchName: string | null;
  baseBranch: string;
  taskId: string;
  runId: string;
  taskTitle: string;
}) {
  if (input.currentBranchName && input.currentBranchName !== input.baseBranch) {
    return input.currentBranchName;
  }

  return `agent-center/${slugifyBranchSegment(input.taskTitle)}-${input.taskId.slice(0, 8)}-${input.runId.slice(0, 8)}`;
}

async function resolvePublicationCommitAuthor(input: {
  authType: string;
  installationId: number | null;
  token?: string;
}) {
  const fallbackAuthor = {
    email: "automation@agent.center",
    id: null,
    login: null,
    name: "Agent Center",
    source: "fallback",
  } satisfies PublicationCommitAuthor;

  if (input.authType !== "github_app_installation" || !input.installationId || !input.token) {
    return fallbackAuthor;
  }

  const botAuthor = await githubAppService.resolveBotCommitAuthor({
    installationId: input.installationId,
    token: input.token,
  });

  return botAuthor ?? fallbackAuthor;
}

async function getCurrentBranchName(workspacePath: string) {
  const result = await runGitCommand(workspacePath, ["rev-parse", "--abbrev-ref", "HEAD"]);

  if (result.exitCode !== 0) {
    throw new ApiError(500, "git_branch_resolution_failed", "Failed to resolve the current git branch", {
      stderr: result.stderr,
      stdout: result.stdout,
      workspacePath,
    });
  }

  const branch = normalizeBranchName(result.stdout);
  return branch === "HEAD" ? null : branch;
}

async function checkoutPublishBranch(workspacePath: string, branchName: string) {
  await runGitCommandChecked(
    workspacePath,
    ["checkout", "-B", branchName],
    "Failed to create or switch to the publish branch",
  );
}

async function stageAndCommitChanges(
  workspacePath: string,
  commitMessage: string,
  commitAuthor: PublicationCommitAuthor,
) {
  await runGitCommandChecked(workspacePath, ["add", "-A"], "Failed to stage workspace changes for publication");

  const cachedDiff = await runGitCommand(workspacePath, ["diff", "--cached", "--quiet"]);

  if (cachedDiff.exitCode === 0) {
    return {
      committed: false,
      commitSha: null,
    };
  }

  if (cachedDiff.exitCode !== 1) {
    throw new ApiError(500, "git_diff_failed", "Failed to inspect staged workspace changes", {
      stderr: cachedDiff.stderr,
      stdout: cachedDiff.stdout,
      workspacePath,
    });
  }

  await runGitCommandChecked(
    workspacePath,
    [
      "-c",
      `user.name=${commitAuthor.name}`,
      "-c",
      `user.email=${commitAuthor.email}`,
      "commit",
      "-m",
      commitMessage,
    ],
    "Failed to create a git commit for publication",
  );

  const commitSha = (
    await runGitCommandChecked(
      workspacePath,
      ["rev-parse", "HEAD"],
      "Failed to resolve the publication commit SHA",
    )
  ).stdout;

  return {
    committed: true,
    commitSha: getString(commitSha),
  };
}

async function countAheadCommits(workspacePath: string, baseBranch: string) {
  const remoteBase = `origin/${baseBranch}`;
  const remoteRef = await runGitCommand(workspacePath, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/remotes/${remoteBase}`,
  ]);

  if (remoteRef.exitCode !== 0) {
    return 0;
  }

  const result = await runGitCommandChecked(
    workspacePath,
    ["rev-list", "--count", `${remoteBase}..HEAD`],
    "Failed to compare the publish branch against the base branch",
  );

  return Number.parseInt(result.stdout, 10) || 0;
}

async function pushPublishBranch(input: {
  workspacePath: string;
  owner: string;
  repo: string;
  authType: string;
  connectionMetadata: Record<string, unknown> | null;
  branchName: string;
  token?: string;
}) {
  const cloneUrl = githubProvider.buildCloneUrl({
    owner: input.owner,
    repo: input.repo,
    authType: input.authType,
    connectionMetadata: input.connectionMetadata,
    token: input.token,
  });
  const pushMetadata = githubProvider.buildBranchPushMetadata({
    branchName: input.branchName,
  });

  await runGitCommandChecked(
    input.workspacePath,
    ["push", cloneUrl.unwrap(), pushMetadata.refspec],
    "Failed to push the publish branch to GitHub",
  );
}

function assertPauseable(status: RunStatus) {
  if (!["queued", "provisioning", "cloning", "running"].includes(status)) {
    throw conflictError(`Run cannot be paused from status "${status}"`, {
      status,
    });
  }
}

export const runService = {
  async create(input: RunCreateRequest, source: "api" | "retry" = "api") {
    const task = await findTaskById(input.taskId);

    if (task === undefined) {
      throw notFoundError("task", input.taskId);
    }

    const latestRun = await findLatestRunForTask(task.id);

    if (latestRun !== undefined && isActiveRunStatus(latestRun.status)) {
      throw conflictError("Task already has an active run", {
        runId: latestRun.id,
        status: latestRun.status,
        taskId: task.id,
      });
    }

    const nextConfig = input.config ?? task.config;
    assertLaunchReadyExecutionConfig(nextConfig);
    const reusableWorkspacePath = latestRun?.workspacePath ?? null;

    const run = await createRunRecord({
      taskId: task.id,
      repoConnectionId: task.repoConnectionId,
      prompt: input.prompt ?? task.prompt,
      baseBranch: input.baseBranch ?? task.baseBranch,
      branchName: input.branchName ?? task.branchName,
      sandboxSize: input.sandboxSize ?? task.sandboxSize,
      permissionMode: input.permissionMode ?? task.permissionMode,
      policy: input.policy ?? task.policy,
      config: nextConfig,
      metadata: mergeMetadata(withoutControlMetadata(task.metadata), input.metadata),
      workspacePath: reusableWorkspacePath,
      source,
    });

    return serializeRun(run);
  },

  async getById(runId: string) {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    return serializeRun(run);
  },

  async listByTask(taskId: string) {
    const task = await findTaskById(taskId);

    if (task === undefined) {
      throw notFoundError("task", taskId);
    }

    const taskRuns = await listRunsForTask(taskId);
    return taskRuns.map(serializeRun);
  },

  async listEvents(runId: string) {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    const events = await listRunEvents(runId);

    return events.map(serializeRunEvent);
  },

  async listLogs(runId: string) {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    const events = await listRunLogEvents(runId);

    return events.map(serializeRunEvent);
  },

  async getDiff(runId: string): Promise<RunDiffResponse> {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    if (!run.workspacePath) {
      return {
        available: false,
        error: "No workspace is available for this run yet.",
        hasChanges: false,
        patch: null,
        stats: null,
        statusLines: [],
        workspacePath: null,
      };
    }

    return readWorkspaceDiff(run.workspacePath);
  },

  async publish(runId: string, userId?: string) {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    const task = await findTaskById(run.taskId);

    if (task === undefined) {
      throw notFoundError("task", run.taskId);
    }

    await assertWorkspaceAccess(task.workspaceId, userId);

    if (run.status !== "completed") {
      throw conflictError(`Run cannot be published from status "${run.status}"`, {
        runId,
        status: run.status,
      });
    }

    if (!run.repoConnectionId) {
      throw new ApiError(
        409,
        "run_repo_connection_required",
        "Run does not have a connected repository to publish to",
        { runId },
      );
    }

    const repoConnection = await repoConnectionService.assertWithinWorkspace(
      task.workspaceId,
      run.repoConnectionId,
      task.projectId,
    );

    if (repoConnection.provider !== "github") {
      throw new ApiError(
        409,
        "repo_connection_provider_unsupported",
        "Only GitHub-backed repo connections can publish draft pull requests",
        {
          provider: repoConnection.provider,
          repoConnectionId: repoConnection.id,
        },
      );
    }

    const existingPublication = serializePublicationState(run.metadata);

    if (
      existingPublication.status === "published" &&
      existingPublication.pullRequest?.id &&
      existingPublication.pullRequest.htmlUrl
    ) {
      return {
        publication: existingPublication,
        run: serializeRun(run),
        task: serializeTask(task),
      };
    }

    if (!run.workspacePath) {
      throw new ApiError(
        409,
        "run_workspace_required",
        "Run does not have a workspace available for publication",
        { runId },
      );
    }

    const diff = await readWorkspaceDiff(run.workspacePath);

    if (!diff.available || !diff.workspacePath) {
      throw new ApiError(
        409,
        "run_workspace_unavailable",
        diff.error ?? "Run workspace is not accessible from the API process in this deployment.",
        {
          runId,
        },
      );
    }

    const baseBranch = normalizeBranchName(run.baseBranch ?? task.baseBranch ?? repoConnection.defaultBranch);

    if (!baseBranch) {
      throw new ApiError(
        409,
        "run_publish_base_branch_missing",
        "Run is missing a base branch for pull request publication",
        {
          runId,
          taskId: task.id,
          repoConnectionId: repoConnection.id,
        },
      );
    }

    const currentBranchName =
      normalizeBranchName(run.branchName ?? task.branchName) ?? (await getCurrentBranchName(diff.workspacePath));
    const publishBranch = resolvePublishBranchName({
      currentBranchName,
      baseBranch,
      taskId: task.id,
      runId: run.id,
      taskTitle: task.title,
    });
    const attemptedAt = new Date().toISOString();
    const prompts = [run.prompt, task.prompt].filter((prompt): prompt is string => Boolean(getString(prompt)));
    const assistantSummary = extractAssistantSummary([
      asRecord(run.metadata)?.assistantSummary,
      asRecord(run.metadata)?.finalAssistantMessage,
      asRecord(run.metadata)?.summary,
      asRecord(asRecord(run.metadata)?.result)?.summary,
      asRecord(task.metadata)?.assistantSummary,
      asRecord(task.metadata)?.finalAssistantMessage,
      asRecord(task.metadata)?.summary,
      asRecord(asRecord(task.metadata)?.result)?.summary,
    ]);
    const generatedPublicationContent = buildPublicationContent({
      statusLines: diff.statusLines,
      assistantSummary,
      originalTask: getString(run.prompt) ?? getString(task.prompt) ?? task.title,
    });
    const title = resolvePublicationTitle({
      generatedTitle: generatedPublicationContent.title,
      runConfig: run.config,
      taskConfig: task.config,
      prompts,
    });
    const body = resolvePublicationBody({
      generatedBody: generatedPublicationContent.body,
      runConfig: run.config,
      taskConfig: task.config,
      prompts,
    });
    const commitMessage = resolveCommitMessage({
      generatedCommitMessage: generatedPublicationContent.commitMessage,
      runConfig: run.config,
      taskConfig: task.config,
      prompts,
    });

    try {
      const installationId = Number(
        (repoConnection.connectionMetadata as Record<string, unknown> | null)?.installationId,
      );
      const token =
        repoConnection.authType === "github_app_installation" &&
        Number.isInteger(installationId) &&
        installationId > 0
          ? (await githubAppService.getInstallationAccessToken(installationId)).token
          : undefined;
      const commitAuthor = await resolvePublicationCommitAuthor({
        authType: repoConnection.authType,
        installationId: Number.isInteger(installationId) && installationId > 0 ? installationId : null,
        token,
      });

      await checkoutPublishBranch(diff.workspacePath, publishBranch);

      const commitResult = await stageAndCommitChanges(diff.workspacePath, commitMessage, commitAuthor);
      const aheadCommits = await countAheadCommits(diff.workspacePath, baseBranch);

      if (!commitResult.committed && aheadCommits === 0) {
        throw new ApiError(
          409,
          "run_publish_no_changes",
          "Run workspace has no publishable changes to commit or push",
          {
            runId,
            workspacePath: diff.workspacePath,
          },
        );
      }

      await pushPublishBranch({
        workspacePath: diff.workspacePath,
        owner: repoConnection.owner,
        repo: repoConnection.repo,
        authType: repoConnection.authType,
        connectionMetadata: repoConnection.connectionMetadata as Record<string, unknown> | null,
        branchName: publishBranch,
        token,
      });

      if (commitResult.committed) {
        await appendRunEvent(run.id, {
          eventType: "git.commit.created",
          level: "info",
          message: `Publication commit created on ${publishBranch}`,
          payload: {
            branchName: publishBranch,
            commitMessage,
            commitSha: commitResult.commitSha,
            commitAuthor,
            taskId: task.id,
          },
        });
      }

      await appendRunEvent(run.id, {
        eventType: "git.branch.pushed",
        level: "info",
        message: `Publication branch pushed: ${publishBranch}`,
        payload: {
          aheadCommits,
          branchName: publishBranch,
          taskId: task.id,
        },
      });

      const pullRequest = await githubProvider.createPullRequest({
        owner: repoConnection.owner,
        repo: repoConnection.repo,
        authType: repoConnection.authType,
        connectionMetadata: repoConnection.connectionMetadata,
        token,
        title,
        body,
        head: publishBranch,
        base: baseBranch,
        draft: true,
      });

      const publishedAt = new Date().toISOString();
      const publication = {
        status: "published",
        provider: "github",
        attemptedAt,
        publishedAt,
        error: null,
        summary: generatedPublicationContent.summary,
        commitMessage,
        commitSha: commitResult.commitSha,
        commitAuthor,
        headBranch: publishBranch,
        baseBranch,
        pullRequest,
      } satisfies Record<string, unknown>;

      const updatedRun = await updateRun(run.id, {
        branchName: publishBranch,
        baseBranch,
        metadata: buildPublicationMetadata(run.metadata, publication),
        updatedAt: new Date(),
      });
      const updatedTask = await updateTask(task.id, {
        branchName: publishBranch,
        baseBranch,
        metadata: buildPublicationMetadata(task.metadata, publication),
        updatedAt: new Date(),
      });

      await appendRunEvent(run.id, {
        eventType: "git.pr.opened",
        level: "info",
        message: `Draft pull request published: #${pullRequest.number}`,
        payload: {
          publication,
          taskId: task.id,
        },
      });

      return {
        publication: serializePublicationState(updatedRun.metadata),
        run: serializeRun(updatedRun),
        task: serializeTask(updatedTask),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish draft pull request";
      const failedPublication = {
        status: "failed",
        provider: "github",
        attemptedAt,
        publishedAt: null,
        error: message,
        headBranch: publishBranch,
        baseBranch,
        pullRequest: null,
      } satisfies Record<string, unknown>;

      await Promise.all([
        updateRun(run.id, {
          branchName: publishBranch,
          baseBranch,
          metadata: buildPublicationMetadata(run.metadata, failedPublication),
          updatedAt: new Date(),
        }),
        updateTask(task.id, {
          branchName: publishBranch,
          baseBranch,
          metadata: buildPublicationMetadata(task.metadata, failedPublication),
          updatedAt: new Date(),
        }),
        appendRunEvent(run.id, {
          eventType: "run.log",
          level: "error",
          message: "Draft pull request publication failed",
          payload: {
            error: message,
            publication: failedPublication,
            taskId: task.id,
          },
        }),
      ]);

      throw error;
    }
  },

  async pause(runId: string, input: { reason?: string | null }): Promise<RunControlResponse> {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    if (run.status === "paused") {
      throw conflictError("Run is already paused", {
        runId,
      });
    }

    assertPauseable(run.status);

    const requestedAt = new Date().toISOString();
    const updatedRun = await updateRun(run.id, {
      metadata: withControlIntent(run.metadata, "pause", {
        applied: false,
        reason: input.reason ?? null,
        requestedAt,
        requestedStatus: "paused",
        source: "api",
      }),
      updatedAt: new Date(),
    });

    await appendRunEvent(run.id, {
      eventType: "run.status_changed",
      level: "warn",
      message: "Pause requested via API",
      payload: {
        applied: false,
        reason: input.reason ?? null,
        requestedAt,
        requestedStatus: "paused",
        source: "api",
      },
    });

    return {
      run: serializeRun(updatedRun),
      control: {
        accepted: true,
        applied: false,
        reason: input.reason,
        requestedStatus: "paused",
      },
      statusCode: 202,
    };
  },

  async resume(runId: string, input: { reason?: string | null }): Promise<RunControlResponse> {
    const run = await findRunById(runId);

    if (run === undefined) {
      throw notFoundError("run", runId);
    }

    if (run.status !== "paused") {
      throw new ApiError(409, "run_not_paused", "Run can only be resumed from paused status", {
        runId,
        status: run.status,
      });
    }

    const requestedAt = new Date().toISOString();
    const updatedRun = await updateRun(run.id, {
      metadata: withControlIntent(run.metadata, "resume", {
        applied: false,
        reason: input.reason ?? null,
        requestedAt,
        requestedStatus: "running",
        source: "api",
      }),
      updatedAt: new Date(),
    });

    await appendRunEvent(run.id, {
      eventType: "run.status_changed",
      level: "info",
      message: "Resume requested via API",
      payload: {
        applied: false,
        reason: input.reason ?? null,
        requestedAt,
        requestedStatus: "running",
        source: "api",
      },
    });

    return {
      run: serializeRun(updatedRun),
      control: {
        accepted: true,
        applied: false,
        reason: input.reason,
        requestedStatus: "running",
      },
      statusCode: 202,
    };
  },
};

export type { RunCreateRequest };
