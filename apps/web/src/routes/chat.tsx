import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ExecutionRuntime } from '@agent-center/shared';
import { ArrowRight, Circle, CircleDashed } from 'lucide-react';
import { toast } from 'sonner';
import { AGENTS, MODELS, PromptBox, runtimeForSandboxMode } from '@/components/chat/prompt-box';
import { apiGet, apiPost } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useTaskList } from '@/hooks/use-zero-queries';

interface Task {
  id: string;
  title: string;
  status: string;
  createdAt: string | number;
}

interface Run {
  id: string;
  taskId: string;
  status: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface RepoConnection {
  id: string;
  workspaceId: string;
  projectId: string | null;
  defaultBranch: string | null;
}

interface PromptConfig {
  agentProvider: string;
  agentModel: string;
  branch: string;
  runtime: ExecutionRuntime;
  workspaceId?: string;
  repoConnectionId?: string;
  projectId?: string;
}

interface UploadedAttachment {
  attachmentId?: string;
  contentType: string;
  name: string;
  type: 'pdf' | 'image' | 'file';
  url?: string | null;
}

function sandboxSizeForRuntime(runtime: ExecutionRuntime) {
  if (runtime.target === 'local') {
    return 'medium' as const;
  }

  if (runtime.target === 'cloud' && runtime.sandboxProfile === 'full') {
    return 'large' as const;
  }

  if (runtime.target === 'self_hosted') {
    return 'medium' as const;
  }

  return 'small' as const;
}

const SUGGESTION_CHIPS = [
  'Fix a bug',
  'Add a feature',
  'Write tests',
  'Refactor code',
] as const;

// ── Status helpers ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  let color = 'text-muted-foreground/50';
  if (status === 'completed') color = 'text-status-success';
  else if (['pending', 'queued', 'provisioning', 'cloning', 'running', 'in_progress'].includes(status)) color = 'text-status-warning';
  else if (status === 'failed' || status === 'error') color = 'text-status-error';

  const isRunning = ['pending', 'queued', 'provisioning', 'cloning', 'running', 'in_progress'].includes(status);

  return <Circle className={`w-2.5 h-2.5 fill-current ${color} ${isRunning ? 'animate-pulse' : ''}`} />;
}

function timeAgo(date: string | number): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Home Page ────────────────────────────────────────────────────────────────

export function ChatPage() {
  const navigate = useNavigate();
  const storedModelId = localStorage.getItem('ac_default_model') ?? 'gpt-5.4';
  const initialModel =
    MODELS.find((model) => model.id === storedModelId) ??
    MODELS.find((model) => model.id === 'gpt-5.4') ??
    MODELS[0]!;
  const initialAgent =
    AGENTS.find((agent) => agent.id === initialModel.agentId) ??
    AGENTS[0]!;
  const [promptDefault, setPromptDefault] = useState<string | undefined>(undefined);
  const [promptConfig, setPromptConfig] = useState<PromptConfig>({
    agentProvider: initialAgent.id,
    agentModel: initialModel.id,
    branch: 'main',
    runtime: runtimeForSandboxMode('local'),
    repoConnectionId: localStorage.getItem('ac_selected_repo') ?? undefined,
  });

  const { tasks } = useTaskList();
  const previousTaskStatusRef = useRef<Map<string, string>>(new Map());

  const clearSelectedRepository = useCallback(() => {
    localStorage.removeItem('ac_selected_repo');
    setPromptConfig((current) => ({
      ...current,
      repoConnectionId: undefined,
      projectId: undefined,
    }));
  }, []);

  const activeTasks = tasks.filter(
    (t) => ['queued', 'provisioning', 'cloning', 'running', 'in_progress', 'paused'].includes(t.status)
  );

  useEffect(() => {
    const previous = previousTaskStatusRef.current;

    for (const task of tasks) {
      const lastStatus = previous.get(task.id);
      if (task.status === 'failed' && lastStatus && lastStatus !== 'failed') {
        toast.error(`${task.title} failed. Open the task to see the error and retry.`);
      }
      previous.set(task.id, task.status);
    }

    const liveIds = new Set(tasks.map((task) => task.id));
    for (const id of Array.from(previous.keys())) {
      if (!liveIds.has(id)) {
        previous.delete(id);
      }
    }
  }, [tasks]);

  const submitTask = useMutation({
    mutationFn: async ({ prompt, files }: { prompt: string; files: UploadedAttachment[] }) => {
      const workspaces = await apiGet<Workspace[]>('/api/workspaces');
      const defaultWorkspaceId = workspaces[0]?.id;

      let repoConnection: RepoConnection | null = null;
      if (promptConfig.repoConnectionId) {
        const repoConnections = await apiGet<RepoConnection[]>('/api/repo-connections');
        repoConnection =
          repoConnections.find((repo) => repo.id === promptConfig.repoConnectionId) ?? null;

        if (!repoConnection) {
          clearSelectedRepository();
          throw new Error('The selected repository no longer exists. Pick another repository in Settings -> Repositories.');
        }

        if (!repoConnection.projectId) {
          clearSelectedRepository();
          throw new Error('The selected repository is not attached to a project yet. Reconnect it in Settings -> Repositories.');
        }
      }

      const workspaceId = repoConnection?.workspaceId ?? promptConfig.workspaceId ?? defaultWorkspaceId;
      if (!workspaceId) throw new Error('No workspace found');

      const baseBranch = repoConnection?.defaultBranch ?? null;
      const branchName =
        repoConnection && promptConfig.branch !== (baseBranch ?? 'main')
          ? promptConfig.branch
          : null;

      const task = await apiPost<Task>('/api/tasks', {
        workspaceId,
        projectId: repoConnection?.projectId ?? promptConfig.projectId ?? null,
        repoConnectionId: repoConnection?.id ?? null,
        title: prompt.slice(0, 80),
        prompt,
        baseBranch,
        branchName,
        sandboxSize: sandboxSizeForRuntime(promptConfig.runtime),
        config: {
          agentProvider: promptConfig.agentProvider as 'claude' | 'codex',
          agentModel: promptConfig.agentModel,
          runtime: promptConfig.runtime,
        },
        permissionMode: 'safe',
        metadata: {
          attachments: files
            .filter((file) => file.attachmentId && file.url)
            .map((file) => ({
              id: file.attachmentId,
              kind: file.type,
              name: file.name,
              url: file.url,
            })),
          requestedRuntimeTarget: promptConfig.runtime.target,
          requestedRuntimeProvider: promptConfig.runtime.provider,
          requestedSandboxProfile: promptConfig.runtime.sandboxProfile,
          runtimeRoutingStatus: 'planned',
        },
      });

      const run = await apiPost<Run>(`/api/tasks/${task.id}/retry`);
      return { task, run };
    },
    onSuccess: ({ task }) => {
      navigate({ to: '/tasks/$taskId', params: { taskId: task.id } });
    },
    onError: (error: Error) => {
      console.error('Task creation failed:', error.message);
      toast.error(error.message);
    },
  });

  const handleSubmit = useCallback(
    (prompt: string, files: UploadedAttachment[]) => {
      submitTask.mutate({ prompt, files });
    },
    [submitTask],
  );

  const handleChipClick = (text: string) => {
    setPromptDefault(text);
  };

  return (
    <div className="animate-fade-in flex flex-col h-full max-w-3xl w-full mx-auto gap-8 justify-start pt-[12vh] pb-[10vh] px-4">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          What would you like to build?
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Describe your task and an AI agent will work on it.
        </p>
      </div>

      {/* Prompt */}
      <div>
        <PromptBox
          onSubmit={handleSubmit}
          onConfigChange={setPromptConfig}
          placeholder="Describe what you want to build..."
          defaultValue={promptDefault}
          isSubmitting={submitTask.isPending}
        />
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTION_CHIPS.map((chip) => (
          <Button
            key={chip}
            variant="outline"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => handleChipClick(chip)}
          >
            {chip}
          </Button>
        ))}
      </div>

      {/* Active Tasks */}
      <div className="animate-fade-in" style={{ animationDelay: '0.1s', animationFillMode: 'backwards' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground/70">Active Tasks</h2>
        </div>

        {activeTasks.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <CircleDashed className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tasks running</p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              Start by describing what you want to build above
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {activeTasks.map((task) => (
              <button
                key={task.id}
                onClick={() =>
                  navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
                }
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer text-left first:rounded-t-xl last:rounded-b-xl"
              >
                <StatusDot status={task.status} />
                <span className="text-sm text-foreground truncate flex-1">
                  {task.title}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {timeAgo(task.createdAt)}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
