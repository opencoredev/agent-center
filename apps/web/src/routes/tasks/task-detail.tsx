import React from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Task {
  id: string;
  title: string;
  prompt: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  config: { agentProvider?: 'none' | 'claude' | 'codex' };
  permissionMode: string;
  createdAt: string;
  updatedAt: string;
}

interface Run {
  id: string;
  taskId: string;
  status: string;
  attempt: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

function statusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'running') return 'default';
  if (status === 'completed') return 'secondary';
  if (status === 'failed') return 'destructive';
  return 'outline';
}

function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

const ACTIVE_STATUSES = new Set(['pending', 'queued', 'running']);

export function TaskDetailPage() {
  const { taskId } = useParams({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: task,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => apiGet<Task>(`/api/tasks/${taskId}`),
    enabled: !!taskId,
  });

  const {
    data: runs = [],
    isLoading: runsLoading,
  } = useQuery({
    queryKey: ['task-runs', taskId],
    queryFn: () => apiGet<Run[]>(`/api/tasks/${taskId}/runs`),
    enabled: !!taskId,
    retry: false,
  });

  const retryMutation = useMutation({
    mutationFn: () => apiPost<Run>(`/api/tasks/${taskId}/retry`),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task-runs', taskId] });
      navigate({ to: '/runs/$runId', params: { runId: run.id } });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiPost(`/api/tasks/${taskId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });

  if (isLoading) {
    return <p className="text-zinc-400 text-sm">Loading...</p>;
  }

  if (error || !task) {
    return (
      <p className="text-red-400 text-sm">
        Error: {error ? (error as Error).message : 'Task not found'}
      </p>
    );
  }

  const isActive = ACTIVE_STATUSES.has(task.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-zinc-50">{task.title}</h1>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
            <span>·</span>
            <span>{task.config?.agentProvider ?? 'none'}</span>
            <span>·</span>
            <span>{task.permissionMode}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? 'Triggering...' : 'Trigger Run'}
          </Button>
        </div>
      </div>

      {(retryMutation.isError || cancelMutation.isError) && (
        <p className="text-sm text-red-400">
          {retryMutation.isError
            ? (retryMutation.error as Error).message
            : (cancelMutation.error as Error).message}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-zinc-800 p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
            Prompt
          </h2>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {task.prompt}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
            Configuration
          </h2>
          <dl className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <dt className="text-zinc-400">Agent</dt>
              <dd className="text-zinc-50">
                {task.config?.agentProvider ?? 'none'}
              </dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-zinc-400">Permission Mode</dt>
              <dd className="text-zinc-50">{task.permissionMode}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-zinc-400">Created</dt>
              <dd className="text-zinc-50">
                {new Date(task.createdAt).toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-zinc-400">Updated</dt>
              <dd className="text-zinc-50">
                {new Date(task.updatedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-50">Runs</h2>
        {runsLoading && (
          <p className="text-zinc-400 text-sm">Loading runs...</p>
        )}
        {!runsLoading && runs.length === 0 && (
          <div className="rounded-lg border border-zinc-800 px-4 py-8 text-center text-zinc-500 text-sm">
            No runs yet. Click &quot;Trigger Run&quot; to start one.
          </div>
        )}
        {runs.length > 0 && (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900/50 border-b border-zinc-800">
                  <th className="text-left px-4 py-3 font-medium text-zinc-400">
                    Attempt
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-400">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-400">
                    Started
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-400">
                    Duration
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-400">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() =>
                      navigate({
                        to: '/runs/$runId',
                        params: { runId: run.id },
                      })
                    }
                    className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900/70 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-zinc-50">#{run.attempt}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(run.status)}>
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {run.startedAt
                        ? new Date(run.startedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {formatDuration(run.startedAt, run.completedAt)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">
                      {run.errorMessage ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
