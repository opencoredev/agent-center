import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useMatchRoute } from '@tanstack/react-router';
import {
  PanelLeftClose,
  Plus,
  Home,
  ListTodo,
  Zap,
  Settings,
  HelpCircle,
  BookOpen,
  ChevronDown,
  Circle,
} from 'lucide-react';
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

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-emerald-400';
    case 'running':
    case 'in_progress':
      return 'text-yellow-400';
    case 'failed':
    case 'error':
      return 'text-red-400';
    default:
      return 'text-muted-foreground';
  }
}

export function ChatSidebar({ onToggle }: { onToggle: () => void }) {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();

  const isHome = matchRoute({ to: '/' });
  const isTasks = matchRoute({ to: '/tasks/$taskId', fuzzy: true });
  const isSettings = matchRoute({ to: '/settings' });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiGet<Task[]>('/api/tasks'),
    staleTime: 30_000,
  });

  const recentTasks = tasks.slice(0, 20);

  return (
    <div className="flex flex-col h-full text-sidebar-foreground">
      {/* Workspace selector */}
      <div className="flex items-center justify-between px-3 h-12 flex-shrink-0">
        <button className="flex items-center gap-1.5 text-sm font-semibold tracking-tight hover:opacity-80 transition-opacity cursor-pointer">
          <span>Workspace</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={onToggle}
          className="p-1 rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* New Task button */}
      <div className="px-3 pb-3">
        <button
          onClick={() => navigate({ to: '/' })}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-sidebar-primary text-sidebar-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* Nav links */}
      <nav className="px-2 space-y-0.5">
        <button
          onClick={() => navigate({ to: '/' })}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
            isHome
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-sidebar-foreground hover:bg-sidebar-accent'
          }`}
        >
          <Home className="w-4 h-4" />
          Home
        </button>
        <button
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
            isTasks
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-sidebar-foreground hover:bg-sidebar-accent'
          }`}
        >
          <ListTodo className="w-4 h-4" />
          Tasks
        </button>
        <button
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
        >
          <Zap className="w-4 h-4" />
          Automations
        </button>
      </nav>

      {/* Recent Tasks */}
      <div className="flex-1 overflow-y-auto mt-4 px-2">
        <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Recent Tasks
        </p>
        {recentTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2.5 py-4 text-center">
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
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-sidebar-accent transition-colors group cursor-pointer"
              >
                <Circle className={`w-2 h-2 fill-current flex-shrink-0 ${statusColor(task.status)}`} />
                <span className="text-[13px] truncate flex-1 text-sidebar-foreground group-hover:text-accent-foreground">
                  {task.title}
                </span>
                <span className="text-[11px] text-muted-foreground flex-shrink-0">
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
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
            isSettings
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
          }`}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <button
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
        >
          <HelpCircle className="w-4 h-4" />
          Help
        </button>
        <button
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
        >
          <BookOpen className="w-4 h-4" />
          Resources
        </button>
      </div>
    </div>
  );
}
