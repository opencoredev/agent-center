type TimestampValue = Date | number | string;

type ApiRecord = Record<string, any>;
type WorkspaceRecord = ApiRecord;
type ProjectRecord = ApiRecord;
type RepoConnectionRecord = ApiRecord;
type RunnerRecord = ApiRecord;
type RunnerRegistrationTokenRecord = ApiRecord;
type TaskRecord = ApiRecord;
type RunRecord = ApiRecord;
type RunEventRecord = ApiRecord;
type AutomationRecord = ApiRecord;

function toIsoString(value: TimestampValue) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIsoString(value: TimestampValue | null | undefined) {
  return value == null ? null : toIsoString(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function serializePublicationState(metadata: unknown) {
  const publication = asRecord(asRecord(metadata)?.publication);
  const pullRequest = asRecord(publication?.pullRequest);
  const commitAuthor = asRecord(publication?.commitAuthor);

  return {
    status: asString(publication?.status) ?? "unpublished",
    provider: asString(publication?.provider),
    attemptedAt: asString(publication?.attemptedAt),
    publishedAt: asString(publication?.publishedAt),
    error: asString(publication?.error),
    summary: asString(publication?.summary),
    commitMessage: asString(publication?.commitMessage),
    commitSha: asString(publication?.commitSha),
    commitAuthor: commitAuthor
      ? {
          email: asString(commitAuthor.email),
          id: asNumber(commitAuthor.id),
          login: asString(commitAuthor.login),
          name: asString(commitAuthor.name),
          source: asString(commitAuthor.source),
        }
      : null,
    headBranch: asString(publication?.headBranch),
    baseBranch: asString(publication?.baseBranch),
    pullRequest: pullRequest
      ? {
          id: asString(pullRequest.id),
          number: asNumber(pullRequest.number),
          state: asString(pullRequest.state),
          title: asString(pullRequest.title),
          body: asString(pullRequest.body),
          url: asString(pullRequest.url),
          htmlUrl: asString(pullRequest.htmlUrl),
          draft: asBoolean(pullRequest.draft),
          head: asString(pullRequest.head),
          base: asString(pullRequest.base),
        }
      : null,
  };
}

export function serializeWorkspace(workspace: WorkspaceRecord) {
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    description: workspace.description,
    metadata: workspace.metadata,
    createdAt: toIsoString(workspace.createdAt),
    updatedAt: toIsoString(workspace.updatedAt),
  };
}

export function serializeProject(project: ProjectRecord) {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    slug: project.slug,
    name: project.name,
    description: project.description,
    defaultBranch: project.defaultBranch,
    rootDirectory: project.rootDirectory,
    metadata: project.metadata,
    createdAt: toIsoString(project.createdAt),
    updatedAt: toIsoString(project.updatedAt),
  };
}

export function serializeRepoConnection(repoConnection: RepoConnectionRecord) {
  return {
    id: repoConnection.id,
    workspaceId: repoConnection.workspaceId,
    projectId: repoConnection.projectId,
    provider: repoConnection.provider,
    owner: repoConnection.owner,
    repo: repoConnection.repo,
    defaultBranch: repoConnection.defaultBranch,
    authType: repoConnection.authType,
    connectionMetadata: repoConnection.connectionMetadata,
    createdAt: toIsoString(repoConnection.createdAt),
    updatedAt: toIsoString(repoConnection.updatedAt),
  };
}

export function serializeRunner(runner: RunnerRecord) {
  return {
    id: runner.id,
    workspaceId: runner.workspaceId,
    name: runner.name,
    authKeyPrefix: runner.authKeyPrefix,
    lastSeenAt: toNullableIsoString(runner.lastSeenAt),
    revokedAt: toNullableIsoString(runner.revokedAt),
    createdAt: toIsoString(runner.createdAt),
    updatedAt: toIsoString(runner.updatedAt),
  };
}

export function serializeRunnerRegistrationToken(registrationToken: RunnerRegistrationTokenRecord) {
  return {
    id: registrationToken.id,
    workspaceId: registrationToken.workspaceId,
    name: registrationToken.name,
    tokenPrefix: registrationToken.tokenPrefix,
    expiresAt: toIsoString(registrationToken.expiresAt),
    consumedAt: toNullableIsoString(registrationToken.consumedAt),
    revokedAt: toNullableIsoString(registrationToken.revokedAt),
    createdAt: toIsoString(registrationToken.createdAt),
    updatedAt: toIsoString(registrationToken.updatedAt),
  };
}

export function serializeTask(task: TaskRecord) {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    repoConnectionId: task.repoConnectionId,
    automationId: task.automationId,
    title: task.title,
    prompt: task.prompt,
    status: task.status,
    sandboxSize: task.sandboxSize,
    permissionMode: task.permissionMode,
    baseBranch: task.baseBranch,
    branchName: task.branchName,
    policy: task.policy,
    config: task.config,
    metadata: task.metadata,
    publication: serializePublicationState(task.metadata),
    createdAt: toIsoString(task.createdAt),
    updatedAt: toIsoString(task.updatedAt),
  };
}

export function serializeRun(run: RunRecord) {
  return {
    id: run.id,
    taskId: run.taskId,
    repoConnectionId: run.repoConnectionId,
    status: run.status,
    attempt: run.attempt,
    prompt: run.prompt,
    baseBranch: run.baseBranch,
    branchName: run.branchName,
    sandboxSize: run.sandboxSize,
    permissionMode: run.permissionMode,
    policy: run.policy,
    config: run.config,
    metadata: run.metadata,
    publication: serializePublicationState(run.metadata),
    startedAt: toNullableIsoString(run.startedAt),
    completedAt: toNullableIsoString(run.completedAt),
    failedAt: toNullableIsoString(run.failedAt),
    errorMessage: run.errorMessage,
    workspacePath: run.workspacePath,
    createdAt: toIsoString(run.createdAt),
    updatedAt: toIsoString(run.updatedAt),
  };
}

export function serializeRunEvent(event: RunEventRecord) {
  return {
    id: event.id,
    runId: event.runId,
    sequence: event.sequence,
    eventType: event.eventType,
    level: event.level,
    message: event.message,
    payload: event.payload,
    createdAt: toIsoString(event.createdAt),
  };
}

export function serializeAutomation(automation: AutomationRecord) {
  return {
    id: automation.id,
    workspaceId: automation.workspaceId,
    projectId: automation.projectId,
    repoConnectionId: automation.repoConnectionId,
    name: automation.name,
    enabled: automation.enabled,
    cronExpression: automation.cronExpression,
    taskTemplateTitle: automation.taskTemplateTitle,
    taskTemplatePrompt: automation.taskTemplatePrompt,
    sandboxSize: automation.sandboxSize,
    permissionMode: automation.permissionMode,
    branchPrefix: automation.branchPrefix,
    policy: automation.policy,
    config: automation.config,
    metadata: automation.metadata,
    lastRunAt: toNullableIsoString(automation.lastRunAt),
    nextRunAt: toNullableIsoString(automation.nextRunAt),
    createdAt: toIsoString(automation.createdAt),
    updatedAt: toIsoString(automation.updatedAt),
  };
}
