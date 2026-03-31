import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useMatchRoute } from '@tanstack/react-router';
import {
  PanelLeftClose,
  SquarePen,
  Home,
  Zap,
  Settings,
  HelpCircle,
  ChevronUp,
  Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { apiGet } from '@/lib/api-client';

interface Task {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function StatusDot({ status }: { status: string }) {
  let color = 'text-muted-foreground/50';
  if (status === 'completed') color = 'text-emerald-500';
  else if (status === 'running' || status === 'in_progress') color = 'text-amber-400';
  else if (status === 'failed' || status === 'error') color = 'text-red-400';

  return <Circle className={`w-2 h-2 fill-current ${color}`} />;
}

export function ChatSidebar({ onCollapse }: { onCollapse: () => void }) {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();

  const isHome = matchRoute({ to: '/' });
  const isSettings = matchRoute({ to: '/settings' });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiGet<Task[]>('/api/tasks'),
    staleTime: 30_000,
  });

  const recentTasks = tasks.slice(0, 25);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-2">
        <button
          onClick={() => navigate({ to: '/' })}
          className="flex-1 flex items-center gap-2 rounded-md transition-colors hover:bg-sidebar-accent p-2 text-sm font-medium text-sidebar-foreground cursor-pointer"
        >
          <SquarePen className="h-4 w-4" />
          <span>New Task</span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCollapse}
          className="h-8 w-8 text-muted-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Nav */}
      <nav className="px-2 space-y-0.5">
        <button
          onClick={() => navigate({ to: '/' })}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
            isHome
              ? 'bg-muted text-foreground font-medium'
              : 'text-sidebar-foreground hover:bg-muted/50'
          }`}
        >
          <Home className="w-4 h-4" />
          Home
        </button>
        <button
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-sidebar-foreground hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <Zap className="w-4 h-4" />
          Automations
        </button>
      </nav>

      <Separator className="my-3 mx-2 w-auto" />

      {/* Recent Tasks */}
      <div className="flex-1 overflow-y-auto px-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'oklch(0.4 0 0 / 0.25) transparent' }}>
        <p className="px-2.5 pb-2 text-xs font-medium text-muted-foreground">
          Recent Tasks
        </p>
        {recentTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 px-2.5 py-6 text-center">
            No tasks yet
          </p>
        ) : (
          <div className="space-y-0.5">
            {recentTasks.map((task) => (
              <button
                key={task.id}
                onClick={() =>
                  navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
                }
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-muted/50 transition-colors group cursor-pointer"
              >
                <div className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                  <StatusDot status={task.status} />
                </div>
                <span className="text-sm truncate flex-1 text-sidebar-foreground">
                  {task.title}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {timeAgo(task.createdAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-sidebar-border p-2 space-y-0.5">
        <button
          onClick={() => navigate({ to: '/settings' })}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
            isSettings
              ? 'bg-muted text-foreground font-medium'
              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/50'
          }`}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <button
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <HelpCircle className="w-4 h-4" />
          Help
        </button>
      </div>
    </div>
  );
}
