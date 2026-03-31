import {
  automations,
  projects,
  repoConnections,
  runEvents,
  runs,
  tasks,
  workspaces,
} from "@agent-center/db";

function toIsoString(value: Date) {
  return value.toISOString();
}

function toNullableIsoString(value: Date | null) {
  return value === null ? null : value.toISOString();
}

type WorkspaceRecord = typeof workspaces.$inferSelect;
type ProjectRecord = typeof projects.$inferSelect;
type RepoConnectionRecord = typeof repoConnections.$inferSelect;
type TaskRecord = typeof tasks.$inferSelect;
type RunRecord = typeof runs.$inferSelect;
type RunEventRecord = typeof runEvents.$inferSelect;
type AutomationRecord = typeof automations.$inferSelect;

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
