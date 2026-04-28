export const TASK_STATUSES = [
  "pending",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export const RUN_STATUSES = [
  "queued",
  "provisioning",
  "cloning",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;

export const SANDBOX_SIZES = ["small", "medium", "large"] as const;

export const RUNTIME_TARGETS = ["local", "cloud", "self_hosted"] as const;

export const RUNTIME_PROVIDERS = [
  "legacy_local",
  "convex_bash",
  "agent_os",
  "e2b",
  "self_hosted_runner",
] as const;

export const SANDBOX_PROFILES = ["none", "lightweight", "full"] as const;

export const SANDBOX_IDLE_POLICIES = ["retain", "sleep", "terminate"] as const;

export const PERMISSION_MODES = ["yolo", "safe", "custom"] as const;

export const REPO_PROVIDERS = ["github"] as const;

export const REPO_AUTH_TYPES = ["pat"] as const;

export const EVENT_TYPES = [
  "task.created",
  "task.queued",
  "run.created",
  "run.status_changed",
  "run.log",
  "run.command.started",
  "run.command.finished",
  "repo.clone.started",
  "repo.clone.finished",
  "git.commit.created",
  "git.branch.pushed",
  "git.pr.opened",
  "run.completed",
  "run.failed",
  "automation.triggered",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type RunStatus = (typeof RUN_STATUSES)[number];
export type SandboxSize = (typeof SANDBOX_SIZES)[number];
export type RuntimeTarget = (typeof RUNTIME_TARGETS)[number];
export type RuntimeProvider = (typeof RUNTIME_PROVIDERS)[number];
export type SandboxProfile = (typeof SANDBOX_PROFILES)[number];
export type SandboxIdlePolicy = (typeof SANDBOX_IDLE_POLICIES)[number];
export type PermissionMode = (typeof PERMISSION_MODES)[number];
export type RepoProvider = (typeof REPO_PROVIDERS)[number];
export type RepoAuthType = (typeof REPO_AUTH_TYPES)[number] | (string & {});
export type EventType = (typeof EVENT_TYPES)[number];
export type DomainMetadata = Record<string, unknown>;

export interface ExecutionCommand {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutSeconds?: number;
}

export interface ExecutionPolicy {
  customPermissions?: string[];
  writablePaths?: string[];
  blockedCommands?: string[];
}

export interface ExecutionRuntime {
  target: RuntimeTarget;
  provider: RuntimeProvider;
  sandboxProfile: SandboxProfile;
  idlePolicy?: SandboxIdlePolicy;
  resumeOnActivity?: boolean;
  ttlSeconds?: number;
}

export interface ExecutionConfig {
  commands: ExecutionCommand[];
  agentProvider?: "none" | "claude" | "codex" | "opencode" | "cursor";
  agentModel?: string;
  agentPrompt?: string;
  runtime?: ExecutionRuntime;
  workingDirectory?: string;
  commitMessage?: string;
  prTitle?: string;
  prBody?: string;
}

export interface AutomationConfig extends ExecutionConfig {
  branchPattern?: string;
  targetBranchFormat?: string;
}

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  metadata: DomainMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  rootDirectory: string | null;
  metadata: DomainMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface RepoConnection {
  id: string;
  workspaceId: string;
  projectId: string | null;
  provider: RepoProvider;
  owner: string;
  repo: string;
  defaultBranch: string | null;
  authType: RepoAuthType;
  connectionMetadata: DomainMetadata | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  projectId: string | null;
  repoConnectionId: string | null;
  automationId: string | null;
  title: string;
  prompt: string;
  status: TaskStatus;
  baseBranch: string | null;
  branchName: string | null;
  sandboxSize: SandboxSize;
  permissionMode: PermissionMode;
  policy: ExecutionPolicy;
  config: ExecutionConfig;
  metadata: DomainMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  taskId: string;
  repoConnectionId: string | null;
  status: RunStatus;
  attempt: number;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  workspacePath: string | null;
  prompt: string;
  baseBranch: string | null;
  branchName: string | null;
  sandboxSize: SandboxSize;
  permissionMode: PermissionMode;
  policy: ExecutionPolicy;
  config: ExecutionConfig;
  metadata: DomainMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface RunEvent {
  id: string;
  runId: string;
  eventType: EventType;
  sequence: number;
  level: string | null;
  message: string | null;
  payload: DomainMetadata | null;
  createdAt: string;
}

export interface Automation {
  id: string;
  workspaceId: string;
  projectId: string | null;
  repoConnectionId: string | null;
  name: string;
  enabled: boolean;
  cronExpression: string;
  taskTemplateTitle: string;
  taskTemplatePrompt: string;
  sandboxSize: SandboxSize;
  permissionMode: PermissionMode;
  branchPrefix: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  policy: ExecutionPolicy;
  config: AutomationConfig;
  metadata: DomainMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface GitRepository {
  id: string;
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  visibility: string | null;
  cloneUrl: string;
  htmlUrl: string;
}

export interface RepoConnectionTestResult {
  checkedAt: string;
  error: string | null;
  ok: boolean;
  provider: RepoProvider;
  repository: GitRepository | null;
  status: number | null;
  repoConnection: RepoConnection;
}

export interface TaskCancelControl {
  accepted: true;
  applied: boolean;
  alreadyApplied: boolean;
  requestedStatus: "cancelled";
}

export interface TaskCancelResult {
  task: Task;
  control: TaskCancelControl;
}

export interface RunControl {
  accepted: true;
  applied: false;
  reason: string | null | undefined;
  requestedStatus: "paused" | "running";
}

export interface RunControlResult {
  run: Run;
  control: RunControl;
}

export interface CredentialStatus {
  connected: boolean;
  source: "api_key" | "oauth" | null;
  email: string | null;
  expiresAt: string | null;
  subscriptionType: string | null;
}

export interface SaveApiKeyInput {
  apiKey: string;
}

export interface SaveCodexAuthInput {
  authJson: string;
}

export interface CreateWorkspaceInput {
  slug: string;
  name: string;
  description?: string | null;
  metadata?: DomainMetadata;
}

export interface ProjectListParams {
  workspaceId?: string;
}

export interface CreateProjectInput {
  workspaceId: string;
  slug: string;
  name: string;
  description?: string | null;
  defaultBranch?: string;
  rootDirectory?: string | null;
  metadata?: DomainMetadata;
}

export interface RepoConnectionListParams {
  workspaceId?: string;
  projectId?: string;
  provider?: RepoProvider;
}

export interface CreateRepoConnectionInput {
  workspaceId: string;
  projectId?: string | null;
  provider?: RepoProvider;
  owner: string;
  repo: string;
  defaultBranch?: string | null;
  authType: RepoAuthType;
  connectionMetadata?: DomainMetadata | null;
}

export interface TaskListParams {
  workspaceId?: string;
  projectId?: string;
  status?: TaskStatus;
}

export interface CreateTaskInput {
  workspaceId: string;
  projectId?: string | null;
  repoConnectionId?: string | null;
  automationId?: string | null;
  title: string;
  prompt: string;
  sandboxSize?: SandboxSize;
  permissionMode?: PermissionMode;
  baseBranch?: string | null;
  branchName?: string | null;
  policy?: ExecutionPolicy;
  config?: ExecutionConfig;
  metadata?: DomainMetadata;
}

export interface TaskControlInput {
  reason?: string | null;
}

export interface CreateRunInput {
  taskId: string;
  baseBranch?: string | null;
  branchName?: string | null;
  sandboxSize?: SandboxSize;
  permissionMode?: PermissionMode;
  policy?: ExecutionPolicy;
  config?: ExecutionConfig;
  metadata?: DomainMetadata;
}

export interface RetryTaskInput {
  baseBranch?: string | null;
  branchName?: string | null;
  sandboxSize?: SandboxSize;
  permissionMode?: PermissionMode;
  policy?: ExecutionPolicy;
  config?: ExecutionConfig;
  metadata?: DomainMetadata;
}

export interface AutomationListParams {
  workspaceId?: string;
  projectId?: string;
  enabled?: boolean;
}

export interface CreateAutomationInput {
  workspaceId: string;
  projectId?: string | null;
  repoConnectionId?: string | null;
  name: string;
  enabled?: boolean;
  cronExpression: string;
  taskTemplateTitle: string;
  taskTemplatePrompt: string;
  sandboxSize?: SandboxSize;
  permissionMode?: PermissionMode;
  branchPrefix?: string | null;
  policy?: ExecutionPolicy;
  config?: AutomationConfig;
  metadata?: DomainMetadata;
}

export interface UpdateAutomationInput {
  projectId?: string | null;
  repoConnectionId?: string | null;
  name?: string;
  enabled?: boolean;
  cronExpression?: string;
  taskTemplateTitle?: string;
  taskTemplatePrompt?: string;
  sandboxSize?: SandboxSize;
  permissionMode?: PermissionMode;
  branchPrefix?: string | null;
  policy?: ExecutionPolicy;
  config?: AutomationConfig;
  metadata?: DomainMetadata;
}

export interface SuccessEnvelope<TData> {
  data: TData;
  requestId: string;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
}

export interface AgentCenterClientOptions {
  baseUrl: string;
  apiBasePath?: string;
  realtimePath?: string;
  headers?: HeadersInit;
  fetch?: typeof fetch;
  webSocketFactory?: RealtimeSocketFactory;
}

export interface RealtimeClientOptions {
  url: string;
  webSocketFactory?: RealtimeSocketFactory;
}

export interface RunStreamOptions {
  webSocketFactory?: RealtimeSocketFactory;
}

export interface RealtimeSocketLike {
  readonly readyState: number;
  close(code?: number, reason?: string): void;
  send(data: string): void;
  addEventListener?(type: string, listener: (...args: unknown[]) => void): void;
  removeEventListener?(type: string, listener: (...args: unknown[]) => void): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export type RealtimeSocketFactory = (url: string) => RealtimeSocketLike;
