import React from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="h-8 w-64 rounded-md bg-muted animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="h-48 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-destructive text-sm">
          Error: {error ? (error as Error).message : 'Task not found'}
        </p>
      </div>
    );
  }

  const isActive = ACTIVE_STATUSES.has(task.status);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 animate-page-enter">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">{task.title}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
        <p className="text-sm text-destructive">
          {retryMutation.isError
            ? (retryMutation.error as Error).message
            : (cancelMutation.error as Error).message}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Prompt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {task.prompt}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">Agent</dt>
                <dd className="text-foreground">
                  {task.config?.agentProvider ?? 'none'}
                </dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">Permission Mode</dt>
                <dd className="text-foreground">{task.permissionMode}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="text-foreground">
                  {new Date(task.createdAt).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="text-foreground">
                  {new Date(task.updatedAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Runs</h2>
        {runsLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        )}
        {!runsLoading && runs.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No runs yet. Click &quot;Trigger Run&quot; to start one.
              </p>
            </CardContent>
          </Card>
        )}
        {runs.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Attempt
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Started
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Duration
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
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
                    className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-foreground">#{run.attempt}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(run.status)}>
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {run.startedAt
                        ? new Date(run.startedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDuration(run.startedAt, run.completedAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
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
