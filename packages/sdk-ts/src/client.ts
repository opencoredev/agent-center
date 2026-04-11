import { AgentCenterHttpClient } from "./http.js";
import { RunEventStream, RunEventsRealtimeClient } from "./realtime.js";
import type {
  AgentCenterClientOptions,
  Automation,
  AutomationListParams,
  CredentialStatus,
  CreateAutomationInput,
  CreateProjectInput,
  CreateRepoConnectionInput,
  CreateRunInput,
  CreateTaskInput,
  CreateWorkspaceInput,
  Project,
  ProjectListParams,
  RepoConnection,
  RepoConnectionListParams,
  RepoConnectionTestResult,
  RequestOptions,
  RetryTaskInput,
  Run,
  RunControlResult,
  SaveApiKeyInput,
  SaveCodexAuthInput,
  RunStreamOptions,
  RunEvent,
  Task,
  TaskCancelResult,
  TaskControlInput,
  TaskListParams,
  UpdateAutomationInput,
  Workspace,
} from "./types.js";

export class AgentCenterClient {
  private readonly http: AgentCenterHttpClient;
  private readonly options: AgentCenterClientOptions;

  constructor(options: AgentCenterClientOptions) {
    this.options = options;
    this.http = new AgentCenterHttpClient(options);
  }

  readonly workspaces = {
    create: async (input: CreateWorkspaceInput, options?: RequestOptions) => {
      return await this.http.request<Workspace>({
        body: withWorkspaceDefaults(input),
        headers: options?.headers,
        method: "POST",
        path: "/workspaces",
        signal: options?.signal,
      });
    },
    get: async (workspaceId: string, options?: RequestOptions) => {
      return await this.http.request<Workspace>({
        headers: options?.headers,
        method: "GET",
        path: `/workspaces/${workspaceId}`,
        signal: options?.signal,
      });
    },
    list: async (options?: RequestOptions) => {
      return await this.http.request<Workspace[]>({
        headers: options?.headers,
        method: "GET",
        path: "/workspaces",
        signal: options?.signal,
      });
    },
  };

  readonly projects = {
    create: async (input: CreateProjectInput, options?: RequestOptions) => {
      return await this.http.request<Project>({
        body: withProjectDefaults(input),
        headers: options?.headers,
        method: "POST",
        path: "/projects",
        signal: options?.signal,
      });
    },
    get: async (projectId: string, options?: RequestOptions) => {
      return await this.http.request<Project>({
        headers: options?.headers,
        method: "GET",
        path: `/projects/${projectId}`,
        signal: options?.signal,
      });
    },
    list: async (params?: ProjectListParams, options?: RequestOptions) => {
      return await this.http.request<Project[]>({
        headers: options?.headers,
        method: "GET",
        path: "/projects",
        query: params === undefined ? undefined : { ...params },
        signal: options?.signal,
      });
    },
  };

  readonly repoConnections = {
    create: async (input: CreateRepoConnectionInput, options?: RequestOptions) => {
      return await this.http.request<RepoConnection>({
        body: withRepoConnectionDefaults(input),
        headers: options?.headers,
        method: "POST",
        path: "/repo-connections",
        signal: options?.signal,
      });
    },
    get: async (repoConnectionId: string, options?: RequestOptions) => {
      return await this.http.request<RepoConnection>({
        headers: options?.headers,
        method: "GET",
        path: `/repo-connections/${repoConnectionId}`,
        signal: options?.signal,
      });
    },
    list: async (params?: RepoConnectionListParams, options?: RequestOptions) => {
      return await this.http.request<RepoConnection[]>({
        headers: options?.headers,
        method: "GET",
        path: "/repo-connections",
        query: params === undefined ? undefined : { ...params },
        signal: options?.signal,
      });
    },
    test: async (repoConnectionId: string, options?: RequestOptions) => {
      return await this.http.request<RepoConnectionTestResult>({
        headers: options?.headers,
        method: "POST",
        path: `/repo-connections/${repoConnectionId}/test`,
        signal: options?.signal,
      });
    },
    delete: async (repoConnectionId: string, options?: RequestOptions) => {
      return await this.http.request<{ deleted: true }>({
        headers: options?.headers,
        method: "DELETE",
        path: `/repo-connections/${repoConnectionId}`,
        signal: options?.signal,
      });
    },
  };

  readonly tasks = {
    cancel: async (taskId: string, input?: TaskControlInput, options?: RequestOptions) => {
      return await this.http.request<TaskCancelResult>({
        body: input,
        headers: options?.headers,
        method: "POST",
        path: `/tasks/${taskId}/cancel`,
        signal: options?.signal,
      });
    },
    create: async (input: CreateTaskInput, options?: RequestOptions) => {
      return await this.http.request<Task>({
        body: withTaskDefaults(input),
        headers: options?.headers,
        method: "POST",
        path: "/tasks",
        signal: options?.signal,
      });
    },
    get: async (taskId: string, options?: RequestOptions) => {
      return await this.http.request<Task>({
        headers: options?.headers,
        method: "GET",
        path: `/tasks/${taskId}`,
        signal: options?.signal,
      });
    },
    list: async (params?: TaskListParams, options?: RequestOptions) => {
      return await this.http.request<Task[]>({
        headers: options?.headers,
        method: "GET",
        path: "/tasks",
        query: params === undefined ? undefined : { ...params },
        signal: options?.signal,
      });
    },
    listRuns: async (taskId: string, options?: RequestOptions) => {
      return await this.http.request<Run[]>({
        headers: options?.headers,
        method: "GET",
        path: `/tasks/${taskId}/runs`,
        signal: options?.signal,
      });
    },
    retry: async (taskId: string, input?: RetryTaskInput, options?: RequestOptions) => {
      return await this.http.request<Run>({
        body: input,
        headers: options?.headers,
        method: "POST",
        path: `/tasks/${taskId}/retry`,
        signal: options?.signal,
      });
    },
  };

  readonly runs = {
    create: async (input: CreateRunInput, options?: RequestOptions) => {
      return await this.http.request<Run>({
        body: input,
        headers: options?.headers,
        method: "POST",
        path: "/runs",
        signal: options?.signal,
      });
    },
    get: async (runId: string, options?: RequestOptions) => {
      return await this.http.request<Run>({
        headers: options?.headers,
        method: "GET",
        path: `/runs/${runId}`,
        signal: options?.signal,
      });
    },
    getEvents: async (runId: string, options?: RequestOptions) => {
      return await this.http.request<RunEvent[]>({
        headers: options?.headers,
        method: "GET",
        path: `/runs/${runId}/events`,
        signal: options?.signal,
      });
    },
    getLogs: async (runId: string, options?: RequestOptions) => {
      return await this.http.request<RunEvent[]>({
        headers: options?.headers,
        method: "GET",
        path: `/runs/${runId}/logs`,
        signal: options?.signal,
      });
    },
    pause: async (runId: string, input?: TaskControlInput, options?: RequestOptions) => {
      return await this.http.request<RunControlResult>({
        body: input,
        headers: options?.headers,
        method: "POST",
        path: `/runs/${runId}/pause`,
        signal: options?.signal,
      });
    },
    resume: async (runId: string, input?: TaskControlInput, options?: RequestOptions) => {
      return await this.http.request<RunControlResult>({
        body: input,
        headers: options?.headers,
        method: "POST",
        path: `/runs/${runId}/resume`,
        signal: options?.signal,
      });
    },
    stream: (runId: string, options?: RunStreamOptions) => {
      const realtimeClient = new RunEventsRealtimeClient({
        url: this.http.realtimeUrl,
        webSocketFactory: options?.webSocketFactory ?? this.options.webSocketFactory,
      });

      return new RunEventStream(realtimeClient, runId);
    },
  };

  readonly automations = {
    create: async (input: CreateAutomationInput, options?: RequestOptions) => {
      return await this.http.request<Automation>({
        body: withAutomationDefaults(input),
        headers: options?.headers,
        method: "POST",
        path: "/automations",
        signal: options?.signal,
      });
    },
    disable: async (automationId: string, options?: RequestOptions) => {
      return await this.http.request<Automation>({
        headers: options?.headers,
        method: "POST",
        path: `/automations/${automationId}/disable`,
        signal: options?.signal,
      });
    },
    enable: async (automationId: string, options?: RequestOptions) => {
      return await this.http.request<Automation>({
        headers: options?.headers,
        method: "POST",
        path: `/automations/${automationId}/enable`,
        signal: options?.signal,
      });
    },
    get: async (automationId: string, options?: RequestOptions) => {
      return await this.http.request<Automation>({
        headers: options?.headers,
        method: "GET",
        path: `/automations/${automationId}`,
        signal: options?.signal,
      });
    },
    list: async (params?: AutomationListParams, options?: RequestOptions) => {
      return await this.http.request<Automation[]>({
        headers: options?.headers,
        method: "GET",
        path: "/automations",
        query: params === undefined ? undefined : { ...params },
        signal: options?.signal,
      });
    },
    update: async (
      automationId: string,
      input: UpdateAutomationInput,
      options?: RequestOptions,
    ) => {
      return await this.http.request<Automation>({
        body: input,
        headers: options?.headers,
        method: "PATCH",
        path: `/automations/${automationId}`,
        signal: options?.signal,
      });
    },
  };

  readonly credentials = {
    getClaude: async (options?: RequestOptions) => {
      return await this.http.request<CredentialStatus>({
        headers: options?.headers,
        method: "GET",
        path: "/credentials/claude",
        signal: options?.signal,
      });
    },
    getOpenAI: async (options?: RequestOptions) => {
      return await this.http.request<CredentialStatus>({
        headers: options?.headers,
        method: "GET",
        path: "/credentials/openai",
        signal: options?.signal,
      });
    },
    saveClaudeApiKey: async (input: SaveApiKeyInput, options?: RequestOptions) => {
      return await this.http.request<CredentialStatus>({
        body: input,
        headers: options?.headers,
        method: "POST",
        path: "/credentials/claude/api-key",
        signal: options?.signal,
      });
    },
    saveOpenAIApiKey: async (input: SaveApiKeyInput, options?: RequestOptions) => {
      return await this.http.request<CredentialStatus>({
        body: input,
        headers: options?.headers,
        method: "POST",
        path: "/credentials/openai/api-key",
        signal: options?.signal,
      });
    },
    deleteClaude: async (options?: RequestOptions) => {
      return await this.http.request<{ deleted: boolean }>({
        headers: options?.headers,
        method: "DELETE",
        path: "/credentials/claude",
        signal: options?.signal,
      });
    },
    deleteOpenAI: async (options?: RequestOptions) => {
      return await this.http.request<{ deleted: boolean }>({
        headers: options?.headers,
        method: "DELETE",
        path: "/credentials/openai",
        signal: options?.signal,
      });
    },
  };

  readonly auth = {
    saveCodexAuth: async (input: SaveCodexAuthInput, options?: RequestOptions) => {
      return await this.http.request<CredentialStatus>({
        body: input,
        headers: options?.headers,
        method: "POST",
        path: "/auth/codex/save-auth",
        signal: options?.signal,
      });
    },
  };

  createRunEventsClient(options?: RunStreamOptions) {
    return new RunEventsRealtimeClient({
      url: this.http.realtimeUrl,
      webSocketFactory: options?.webSocketFactory ?? this.options.webSocketFactory,
    });
  }
}

export function createAgentCenterClient(options: AgentCenterClientOptions) {
  return new AgentCenterClient(options);
}

function withWorkspaceDefaults(input: CreateWorkspaceInput): Required<CreateWorkspaceInput> {
  return {
    description: input.description ?? null,
    metadata: input.metadata ?? {},
    name: input.name,
    slug: input.slug,
  };
}

function withProjectDefaults(input: CreateProjectInput) {
  return {
    defaultBranch: input.defaultBranch ?? "main",
    description: input.description ?? null,
    metadata: input.metadata ?? {},
    name: input.name,
    rootDirectory: input.rootDirectory ?? null,
    slug: input.slug,
    workspaceId: input.workspaceId,
  };
}

function withRepoConnectionDefaults(input: CreateRepoConnectionInput) {
  return {
    authType: input.authType,
    connectionMetadata: input.connectionMetadata ?? null,
    defaultBranch: input.defaultBranch ?? null,
    owner: input.owner,
    projectId: input.projectId ?? null,
    provider: input.provider ?? "github",
    repo: input.repo,
    workspaceId: input.workspaceId,
  };
}

function withTaskDefaults(input: CreateTaskInput) {
  return {
    automationId: input.automationId ?? null,
    baseBranch: input.baseBranch ?? null,
    branchName: input.branchName ?? null,
    config: input.config ?? {
      commands: [],
    },
    metadata: input.metadata ?? {},
    permissionMode: input.permissionMode ?? "safe",
    policy: input.policy ?? {},
    projectId: input.projectId ?? null,
    prompt: input.prompt,
    repoConnectionId: input.repoConnectionId ?? null,
    sandboxSize: input.sandboxSize ?? "medium",
    title: input.title,
    workspaceId: input.workspaceId,
  };
}

function withAutomationDefaults(input: CreateAutomationInput) {
  return {
    branchPrefix: input.branchPrefix ?? null,
    config: input.config ?? {
      commands: [],
    },
    cronExpression: input.cronExpression,
    enabled: input.enabled ?? true,
    metadata: input.metadata ?? {},
    name: input.name,
    permissionMode: input.permissionMode ?? "safe",
    policy: input.policy ?? {},
    projectId: input.projectId ?? null,
    repoConnectionId: input.repoConnectionId ?? null,
    sandboxSize: input.sandboxSize ?? "medium",
    taskTemplatePrompt: input.taskTemplatePrompt,
    taskTemplateTitle: input.taskTemplateTitle,
    workspaceId: input.workspaceId,
  };
}
