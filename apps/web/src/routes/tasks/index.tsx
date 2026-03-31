import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { apiGet } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';

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

const STATUS_TABS = ['all', 'running', 'completed', 'failed'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

function statusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'running') return 'default';
  if (status === 'completed') return 'secondary';
  if (status === 'failed') return 'destructive';
  return 'outline';
}

export { type Task, type Run };

export function TasksPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StatusTab>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: tasks = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiGet<Task[]>('/api/tasks'),
  });

  const filtered =
    filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-50">Tasks</h1>
        <Button onClick={() => setCreateOpen(true)}>Create Task</Button>
      </div>

      <div className="flex gap-0 border-b border-zinc-800">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              'px-4 py-2 text-sm capitalize transition-colors border-b-2 -mb-px cursor-pointer',
              filter === tab
                ? 'border-zinc-50 text-zinc-50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading && (
        <p className="text-zinc-400 text-sm">Loading tasks...</p>
      )}
      {error && (
        <EmptyState
          title="Failed to load tasks"
          description={(error as Error).message || 'Could not connect to API'}
        />
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-500">
          <p className="text-sm">No tasks found.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            Create your first task
          </Button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900/50 border-b border-zinc-800">
                <th className="text-left px-4 py-3 font-medium text-zinc-400">
                  Title
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-400">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-400">
                  Agent
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-400">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr
                  key={task.id}
                  onClick={() =>
                    navigate({
                      to: '/tasks/$taskId',
                      params: { taskId: task.id },
                    })
                  }
                  className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900/70 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-zinc-50">
                    {task.title}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(task.status)}>
                      {task.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {task.config?.agentProvider ?? 'none'}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
