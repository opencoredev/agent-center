import React, { useState, useCallback } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Circle } from 'lucide-react';
import { PromptBox } from '@/components/chat/prompt-box';
import { ChatMessages, type ChatMessage } from '@/components/chat/chat-messages';
import { useRunStream, type RunEvent } from '@/hooks/use-run-stream';
import { apiGet, apiPost } from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  status: string;
  createdAt: string;
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

// ── Active Chat View ──────────────────────────────────────────────────────

function ActiveChat({
  messages,
  events,
  isStreaming,
  onSend,
  onStop,
}: {
  messages: ChatMessage[];
  events: RunEvent[];
  isStreaming: boolean;
  onSend: (prompt: string) => void;
  onStop: () => void;
}) {
  const messagesWithEvents = messages.map((msg, i) => {
    if (msg.role === 'agent' && i === messages.length - 1) {
      return { ...msg, events, status: isStreaming ? ('running' as const) : msg.status };
    }
    return msg;
  });

  return (
    <div className="flex flex-col h-full">
      <ChatMessages messages={messagesWithEvents} isStreaming={isStreaming && messages[messages.length - 1]?.role === 'user'} />
      <div className="flex-shrink-0 px-6 pb-4 pt-2 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <PromptBox
            onSubmit={(prompt) => onSend(prompt)}
            isStreaming={isStreaming}
            onStop={onStop}
            placeholder="Follow up with anything..."
          />
        </div>
      </div>
    </div>
  );
}

// ── Status helpers ────────────────────────────────────────────────────────

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

// ── Hero / Home State ────────────────────────────────────────────────────

function HomePage({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  const navigate = useNavigate();

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiGet<Task[]>('/api/tasks'),
    staleTime: 30_000,
  });

  const activeTasks = tasks.filter(
    (t) => t.status === 'running' || t.status === 'in_progress'
  );

  return (
    <div className="flex-1 flex flex-col">
      {/* Centered prompt area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-3xl">
          <PromptBox
            onSubmit={(prompt) => onSubmit(prompt)}
            placeholder="Plan a new task for Agent to handle... (use '@' to mention apps or files)"
            centered
          />
        </div>
      </div>

      {/* Active Tasks section */}
      <div className="px-6 pb-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Active Tasks</h2>
            <button
              onClick={() => navigate({ to: '/' })}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              All Tasks
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            {activeTasks.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">No active tasks</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  You will see tasks in progress here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() =>
                      navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
                    }
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer text-left"
                  >
                    <Circle className={`w-2.5 h-2.5 fill-current flex-shrink-0 ${statusColor(task.status)}`} />
                    <span className="text-sm text-foreground truncate flex-1">
                      {task.title}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {timeAgo(task.createdAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Chat Page ────────────────────────────────────────────────────────

export function ChatPage() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const { events, runStatus } = useRunStream(activeRunId || '');

  React.useEffect(() => {
    if (runStatus === 'completed' || runStatus === 'failed' || runStatus === 'cancelled') {
      setIsWorking(false);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'agent') {
          return [
            ...prev.slice(0, -1),
            { ...last, status: runStatus as ChatMessage['status'] },
          ];
        }
        return prev;
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  }, [runStatus, queryClient]);

  const submitTask = useMutation({
    mutationFn: async (prompt: string) => {
      const workspaces = await apiGet<Workspace[]>('/api/workspaces');
      const workspaceId = workspaces[0]?.id;
      if (!workspaceId) throw new Error('No workspace found');

      const task = await apiPost<Task>('/api/tasks', {
        workspaceId,
        title: prompt.slice(0, 80),
        prompt,
        config: { agentProvider: 'claude' },
        permissionMode: 'safe',
      });

      const run = await apiPost<Run>(`/api/tasks/${task.id}/retry`);
      return { task, run };
    },
    onSuccess: ({ task, run }) => {
      setActiveRunId(run.id);
      setIsWorking(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-${run.id}`,
          role: 'agent',
          content: `Working on: ${task.title}`,
          timestamp: new Date().toISOString(),
          status: 'running',
        },
      ]);
    },
  });

  const handleSubmit = useCallback(
    (prompt: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          content: prompt,
          timestamp: new Date().toISOString(),
        },
      ]);
      submitTask.mutate(prompt);
    },
    [submitTask],
  );

  const handleStop = useCallback(() => {
    setIsWorking(false);
  }, []);

  const hasMessages = messages.length > 0;

  if (!hasMessages) {
    return <HomePage onSubmit={handleSubmit} />;
  }

  return (
    <ActiveChat
      messages={messages}
      events={events}
      isStreaming={isWorking}
      onSend={handleSubmit}
      onStop={handleStop}
    />
  );
}
