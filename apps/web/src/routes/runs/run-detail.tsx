import React from 'react';
import { useParams } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TerminalViewer } from '@/components/terminal-viewer';
import { useRunStream } from '@/hooks/use-run-stream';
import { apiGet, apiPost } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────

interface Run {
  id: string;
  taskId: string;
  status: string;
  attempt: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  config: {
    agentProvider?: string;
    agentModel?: string;
  };
  branchName: string | null;
  createdAt: string;
}

// ── Page ───────────────────────────────────────────────────────────────────

export function RunDetailPage() {
  const { runId } = useParams({ strict: false });
  const queryClient = useQueryClient();

  const {
    data: run,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['runs', runId],
    queryFn: () => apiGet<Run>(`/api/runs/${runId}`),
    enabled: !!runId,
  });

  const { events, isConnected, runStatus } = useRunStream(runId!);

  const effectiveStatus = runStatus ?? run?.status;

  React.useEffect(() => {
    if (runStatus) {
      queryClient.invalidateQueries({ queryKey: ['runs', runId] });
    }
  }, [runStatus, runId, queryClient]);

  const handlePause = async () => {
    await apiPost(`/api/runs/${runId}/pause`);
    queryClient.invalidateQueries({ queryKey: ['runs', runId] });
  };

  const handleResume = async () => {
    await apiPost(`/api/runs/${runId}/resume`);
    queryClient.invalidateQueries({ queryKey: ['runs', runId] });
  };

  const handleCancel = async () => {
    await apiPost(`/api/runs/${runId}/cancel`);
    queryClient.invalidateQueries({ queryKey: ['runs', runId] });
  };

  if (!runId) {
    return <div className="text-zinc-400">No run ID provided.</div>;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-48 rounded bg-zinc-800 animate-pulse" />
        <div className="h-96 rounded-lg bg-zinc-800 animate-pulse" />
      </div>
    );
  }

  if (isError || !run) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-zinc-50">Run not found</h1>
        <p className="text-red-400 text-sm">
          Failed to load run details. Check your API connection.
        </p>
      </div>
    );
  }

  const showPause = effectiveStatus === 'running';
  const showResume = effectiveStatus === 'paused';
  const showCancel =
    effectiveStatus === 'running' || effectiveStatus === 'paused';

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-50">
            Run #{run.attempt}
          </h1>
          <Badge variant="outline">{effectiveStatus ?? 'pending'}</Badge>
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${isConnected ? 'text-green-400' : 'text-zinc-500'}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-zinc-600'}`}
            />
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {showPause && (
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={handlePause}
            >
              Pause
            </Button>
          )}
          {showResume && (
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={handleResume}
            >
              Resume
            </Button>
          )}
          {showCancel && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Live Logs */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="px-6 py-4">
          <CardTitle className="text-base font-semibold text-zinc-50">
            Live Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <TerminalViewer events={events} />
        </CardContent>
      </Card>

      {/* Run Info */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="px-6 py-4">
          <CardTitle className="text-base font-semibold text-zinc-50">
            Run Info
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          <dl className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <InfoItem label="Task" value={run.taskId} />
            <InfoItem
              label="Model"
              value={
                run.config.agentModel
                  ? `${run.config.agentProvider ?? ''} / ${run.config.agentModel}`
                  : run.config.agentProvider ?? '—'
              }
            />
            <InfoItem label="Branch" value={run.branchName ?? '—'} />
            <InfoItem
              label="Started"
              value={
                run.startedAt
                  ? new Date(run.startedAt).toLocaleString()
                  : 'Not started'
              }
            />
            {run.completedAt && (
              <InfoItem
                label="Completed"
                value={new Date(run.completedAt).toLocaleString()}
              />
            )}
            {run.errorMessage && (
              <div className="lg:col-span-2">
                <dt className="text-xs font-medium text-zinc-500">Error</dt>
                <dd className="mt-1 text-sm text-red-400 font-mono break-all">
                  {run.errorMessage}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm text-zinc-200 truncate">{value}</dd>
    </div>
  );
}
