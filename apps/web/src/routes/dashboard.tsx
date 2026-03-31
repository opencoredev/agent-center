import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { StatusBadge } from '../components/status-badge';
import { EmptyState } from '../components/empty-state';
import { apiGet } from '../lib/api-client';

interface Task {
  id: string;
  title: string;
  status: string;
  config: { agentProvider?: string };
  createdAt: string;
}

function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiGet<Task[]>('/api/tasks'),
    staleTime: 30_000,
  });
}

interface StatCardProps {
  label: string;
  value: number;
  hint?: string;
}

function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium text-zinc-400">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-3xl font-semibold text-zinc-50">{value}</p>
        {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800">
      <td className="py-3 px-4">
        <div className="h-4 w-48 rounded bg-zinc-800 animate-pulse" />
      </td>
      <td className="py-3 px-4">
        <div className="h-5 w-20 rounded-full bg-zinc-800 animate-pulse" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-16 rounded bg-zinc-800 animate-pulse" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-24 rounded bg-zinc-800 animate-pulse" />
      </td>
    </tr>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  none: '—',
};

function providerLabel(provider?: string) {
  if (!provider) return '—';
  return PROVIDER_LABELS[provider] ?? provider;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: tasks, isLoading, isError } = useTasks();

  const recent = tasks ? tasks.slice(0, 10) : [];
  const totalTasks = tasks?.length ?? 0;
  const activeRuns = tasks?.filter((t) => t.status === 'running' || t.status === 'queued').length ?? 0;
  const completed = tasks?.filter((t) => t.status === 'completed').length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-50">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard label="Total Tasks" value={totalTasks} />
        <StatCard label="Active Runs" value={activeRuns} hint="running or queued" />
        <StatCard label="Completed" value={completed} />
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-6 py-4">
          <CardTitle className="text-base font-semibold text-zinc-50">Recent Tasks</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            onClick={() => navigate({ to: '/tasks' })}
          >
            + New Task
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {isError ? (
            <EmptyState
              title="Failed to load tasks"
              description="Could not connect to API. Check your connection."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="py-2.5 px-4 text-left font-medium text-zinc-500">Title</th>
                  <th className="py-2.5 px-4 text-left font-medium text-zinc-500">Status</th>
                  <th className="py-2.5 px-4 text-left font-medium text-zinc-500">Provider</th>
                  <th className="py-2.5 px-4 text-left font-medium text-zinc-500">Created</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : recent.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center">
                      <p className="text-zinc-400">No tasks yet.</p>
                      <p className="mt-1 text-zinc-500 text-xs">Create your first task to get started.</p>
                      <Button
                        size="sm"
                        className="mt-4"
                        onClick={() => navigate({ to: '/tasks' })}
                      >
                        Create your first task
                      </Button>
                    </td>
                  </tr>
                ) : (
                  recent.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                      onClick={() => navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })}
                    >
                      <td className="py-3 px-4 text-zinc-200 max-w-xs truncate">{task.title}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="py-3 px-4 text-zinc-400">
                        {providerLabel(task.config?.agentProvider)}
                      </td>
                      <td className="py-3 px-4 text-zinc-500">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
