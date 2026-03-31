import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  PanelLeftClose,
  Plus,
  MessageSquare,
  Settings,
  Zap,
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
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ChatSidebar({ onToggle }: { onToggle: () => void }) {
  const navigate = useNavigate();

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiGet<Task[]>('/api/tasks'),
    staleTime: 30_000,
  });

  const recentTasks = tasks.slice(0, 30);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[var(--color-accent)] flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-zinc-950" />
          </div>
          <span className="text-sm font-semibold text-zinc-200 tracking-tight">
            Agent Center
          </span>
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* New chat button */}
      <div className="px-3 pb-2">
        <button
          onClick={() => navigate({ to: '/' })}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 bg-white/[0.03] border border-[var(--color-border-subtle)] hover:bg-white/[0.06] hover:border-[var(--color-border-default)] transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {recentTasks.length === 0 ? (
          <p className="text-xs text-zinc-600 px-2 py-8 text-center">
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
                className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-white/[0.04] transition-colors group cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-zinc-300 truncate leading-tight group-hover:text-zinc-100">
                    {task.title}
                  </p>
                  <p className="text-[11px] text-zinc-600 mt-0.5">
                    {timeAgo(task.createdAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-[var(--color-border-subtle)] p-2">
        <button
          onClick={() => navigate({ to: '/settings' })}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </div>
  );
}
