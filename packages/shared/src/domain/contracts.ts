import type { EventType } from "../events";
import type { RepoAuthType, RepoProvider } from "../providers";
import type {
  AgentProvider,
  PermissionMode,
  RunStatus,
  RuntimeProvider,
  RuntimeTarget,
  SandboxIdlePolicy,
  SandboxProfile,
  SandboxSize,
  TaskStatus,
} from "./enums";

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
  agentProvider?: AgentProvider;
  agentModel?: string;
  agentReasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | "ultrathink";
  agentThinkingEnabled?: boolean;
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

export interface DomainMetadata {
  [key: string]: unknown;
}

export interface WorkspaceSpec {
  slug: string;
  name: string;
  description: string | null;
  metadata: DomainMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSpec {
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

export interface RepoConnectionSpec {
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

export interface TaskSpec {
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

export interface RunSpec {
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

export interface RunEventSpec {
  runId: string;
  eventType: EventType;
  sequence: number;
  level: string | null;
  message: string | null;
  payload: DomainMetadata | null;
  createdAt: string;
}

export interface AutomationSpec {
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
