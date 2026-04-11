import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Archive, RotateCcw } from 'lucide-react';

import { apiGet, apiPatch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

interface Task {
  id: string;
  title: string;
  status: string;
  createdAt: string | number;
  metadata?: Record<string, unknown>;
}

function timeAgo(date: string | number): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function ArchivedTasksPage() {
  const navigate = useNavigate();
  const { data: tasks = [], refetch } = useQuery({
    queryKey: ['archived-tasks'],
    queryFn: () => apiGet<Task[]>('/api/tasks?archived=only'),
    staleTime: 30_000,
  });

  return (
    <div className="max-w-3xl mx-auto px-8 py-8 animate-page-enter">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Archived Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Archived tasks are kept out of the main sidebar and deleted automatically after 30 days.
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Archive className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No archived tasks</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Archived {typeof task.metadata?.archivedAt === 'string' ? timeAgo(task.metadata.archivedAt) : timeAgo(task.createdAt)} ago
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={async () => {
                  await apiPatch(`/api/tasks/${task.id}`, {
                    metadata: {
                      ...task.metadata,
                      archivedAt: null,
                    },
                  });
                  await refetch();
                  navigate({ to: '/tasks/$taskId', params: { taskId: task.id } });
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
