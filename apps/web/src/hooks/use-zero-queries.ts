import { useQuery } from '@tanstack/react-query';
import type { ExecutionRuntime } from '@agent-center/shared';
import type { AgentReasoningEffort } from '@/components/chat/prompt-box';
import { ZERO_ENABLED, useZeroQuery } from './use-zero';
import { apiGet } from '@/lib/api-client';
import type { RunEvent } from './use-run-stream';
import { zql } from '@agent-center/db/zero-schema';
import type {
  Task as ZTask,
  Run as ZRun,
  RunEvent as ZRunEvent,
} from '@agent-center/db/zero-schema';

// ── Types ───────────────────────────────────────────────────────────────

interface TaskRow {
  id: string;
  workspaceId: string;
  projectId: string | null;
  repoConnectionId: string | null;
  title: string;
  prompt: string;
  status: string;
  metadata: Record<string, unknown>;
  publication: PublicationSummary;
  config: {
    agentProvider?: string;
    agentModel?: string;
    agentPrompt?: string;
    agentReasoningEffort?: AgentReasoningEffort;
    agentThinkingEnabled?: boolean;
    prBody?: string;
    prTitle?: string;
    runtime?: ExecutionRuntime;
  };
  sandboxSize: string;
  permissionMode: string;
  baseBranch: string | null;
  branchName: string | null;
  createdAt: string | number;
  updatedAt: string | number;
}

interface RunRow {
  id: string;
  taskId: string;
  repoConnectionId: string | null;
  status: string;
  attempt: number;
  prompt: string;
  startedAt: string | number | null;
  completedAt: string | number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  publication: PublicationSummary;
  config: {
    agentProvider?: string;
    agentModel?: string;
    agentPrompt?: string;
    agentReasoningEffort?: AgentReasoningEffort;
    agentThinkingEnabled?: boolean;
    prBody?: string;
    prTitle?: string;
    runtime?: ExecutionRuntime;
  };
  baseBranch: string | null;
  branchName: string | null;
  sandboxSize: string;
  permissionMode: string;
  workspacePath?: string | null;
  createdAt: string | number;
}

interface PublicationPullRequestSummary {
  body: string | null;
  draft: boolean | null;
  htmlUrl: string | null;
  id: string | null;
  number: number | null;
  state: string | null;
  title: string | null;
  url: string | null;
}

interface PublicationSummary {
  attemptedAt: string | null;
  baseBranch: string | null;
  error: string | null;
  headBranch: string | null;
  provider: string | null;
  publishedAt: string | null;
  pullRequest: PublicationPullRequestSummary | null;
  status: string;
}

interface TaskListResult {
  tasks: TaskRow[];
  isLoading: boolean;
}

interface TaskDetailResult {
  task: TaskRow | undefined;
  runs: RunRow[];
  isLoading: boolean;
  error: Error | null;
}

interface RunEventsResult {
  events: RunEvent[];
  runStatus: string | null;
  isConnected: boolean;
}

const ACTIVE_POLL_STATUSES = ['pending', 'queued', 'provisioning', 'cloning', 'running', 'in_progress', 'paused'];

function ts(v: string | number | null | undefined): string {
  if (v == null) return new Date().toISOString();
  if (typeof v === 'number') return new Date(v).toISOString();
  return v;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function serializePublicationState(metadata: unknown): PublicationSummary {
  const publication = asRecord(asRecord(metadata)?.publication);
  const pullRequest = asRecord(publication?.pullRequest);

  return {
    status: asString(publication?.status) ?? 'unpublished',
    provider: asString(publication?.provider),
    attemptedAt: asString(publication?.attemptedAt),
    publishedAt: asString(publication?.publishedAt),
    error: asString(publication?.error),
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
        }
      : null,
  };
}

function zeroTaskToRow(t: ZTask): TaskRow {
  return {
    id: t.id,
    workspaceId: t.workspaceId,
    projectId: t.projectId ?? null,
    repoConnectionId: t.repoConnectionId ?? null,
    title: t.title,
    prompt: t.prompt,
    status: t.status ?? 'pending',
    metadata: (t.metadata ?? {}) as Record<string, unknown>,
    publication: serializePublicationState(t.metadata),
    config: (t.config ?? {}) as TaskRow['config'],
    sandboxSize: t.sandboxSize ?? 'medium',
    permissionMode: t.permissionMode ?? 'safe',
    baseBranch: t.baseBranch ?? null,
    branchName: t.branchName ?? null,
    createdAt: ts(t.createdAt),
    updatedAt: ts(t.updatedAt),
  };
}

function zeroRunToRow(r: ZRun): RunRow {
  return {
    id: r.id,
    taskId: r.taskId,
    repoConnectionId: r.repoConnectionId ?? null,
    status: r.status ?? 'queued',
    attempt: r.attempt ?? 1,
    prompt: r.prompt ?? '',
    startedAt: r.startedAt ? ts(r.startedAt) : null,
    completedAt: r.completedAt ? ts(r.completedAt) : null,
    errorMessage: r.errorMessage ?? null,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    publication: serializePublicationState(r.metadata),
    config: (r.config ?? {}) as RunRow['config'],
    baseBranch: r.baseBranch ?? null,
    branchName: r.branchName ?? null,
    sandboxSize: r.sandboxSize ?? 'medium',
    permissionMode: r.permissionMode ?? 'safe',
    workspacePath: r.workspacePath ?? null,
    createdAt: ts(r.createdAt),
  };
}

function zeroEventToRunEvent(e: ZRunEvent): RunEvent {
  return {
    id: e.id,
    runId: e.runId,
    eventType: e.eventType,
    sequence: e.sequence,
    level: e.level ?? null,
    message: e.message ?? null,
    payload: (e.payload as Record<string, unknown>) ?? null,
    createdAt: ts(e.createdAt),
  };
}

// ── Zero implementations ────────────────────────────────────────────────

function _useTaskListZero(): TaskListResult {
  const [raw] = useZeroQuery(zql.tasks.orderBy('createdAt', 'desc'));
  const tasks = (raw ?? []) as ZTask[];
  return { tasks: tasks.map(zeroTaskToRow), isLoading: raw === undefined };
}

function _useTaskDetailZero(taskId: string): TaskDetailResult {
  const [rawTask] = useZeroQuery(zql.tasks.where('id', taskId).one());
  const [rawRuns] = useZeroQuery(
    zql.runs.where('taskId', taskId).orderBy('createdAt', 'desc'),
  );

  const task = rawTask ? zeroTaskToRow(rawTask as unknown as ZTask) : undefined;
  const runs = ((rawRuns ?? []) as unknown as ZRun[]).map(zeroRunToRow);

  return { task, runs, isLoading: rawTask === undefined, error: null };
}

function _useRunEventsZero(runId: string): RunEventsResult {
  const [raw] = useZeroQuery(
    runId
      ? zql.runEvents.where('runId', runId).orderBy('sequence', 'asc')
      : zql.runEvents.where('runId', '__none__'),
  );

  const events = ((raw ?? []) as ZRunEvent[]).map(zeroEventToRunEvent);
  const lastStatus = events.filter((e) => e.eventType === 'run.status_changed').pop();
  const runStatus = (lastStatus?.payload?.status as string) ?? null;

  return { events, runStatus, isConnected: true };
}

// ── REST implementations (fallback when Zero is off) ───────────────────

function _useTaskListRest(): TaskListResult {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiGet<TaskRow[]>('/api/tasks'),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const tasks = query.state.data ?? [];
      return tasks.some((task) => ACTIVE_POLL_STATUSES.includes(task.status))
        ? 3000
        : false;
    },
  });
  return { tasks: data ?? [], isLoading };
}

function _useTaskDetailRest(taskId: string): TaskDetailResult {
  const { data: task, isLoading, error } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => apiGet<TaskRow>(`/api/tasks/${taskId}`),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s && ACTIVE_POLL_STATUSES.includes(s) ? 3000 : false;
    },
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['task-runs', taskId],
    queryFn: () => apiGet<RunRow[]>(`/api/tasks/${taskId}/runs`),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const latest = (query.state.data ?? [])[0];
      if (!latest) return 2000;
      return ACTIVE_POLL_STATUSES.includes(latest.status) ? 3000 : false;
    },
  });

  return { task, runs, isLoading, error: error as Error | null };
}

function _useRunEventsRest(_runId: string): RunEventsResult {
  const { data = [] } = useQuery({
    queryKey: ['run-events', _runId],
    queryFn: () => apiGet<RunEvent[]>(`/api/runs/${_runId}/events`),
    enabled: !!_runId,
    refetchInterval: _runId ? 3000 : false,
  });

  const lastStatus = data.filter((event) => event.eventType === 'run.status_changed').pop();
  const runStatus = (lastStatus?.payload?.status as string) ?? null;

  return { events: data, runStatus, isConnected: false };
}

// ── Public exports (module-level branching) ─────────────────────────────

export const useTaskList: () => TaskListResult =
  ZERO_ENABLED ? _useTaskListZero : _useTaskListRest;

export const useTaskDetail: (taskId: string) => TaskDetailResult =
  ZERO_ENABLED ? _useTaskDetailZero : _useTaskDetailRest;

export const useRunEvents: (runId: string) => RunEventsResult =
  ZERO_ENABLED ? _useRunEventsZero : _useRunEventsRest;
