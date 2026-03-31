import React, { useState, useCallback } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Circle } from 'lucide-react';
import { PromptBox } from '@/components/chat/prompt-box';
import { ChatMessages, type ChatMessage } from '@/components/chat/chat-messages';
import { useRunStream, type RunEvent } from '@/hooks/use-run-stream';
import { apiGet, apiPost } from '@/lib/api-client';

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

// ── Active Chat ──────────────────────────────────────────────────────────────

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
      <ChatMessages
        messages={messagesWithEvents}
        isStreaming={isStreaming && messages[messages.length - 1]?.role === 'user'}
      />
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-border">
        <div className="max-w-2xl mx-auto">
          <PromptBox
            onSubmit={(prompt) => onSend(prompt)}
            isStreaming={isStreaming}
            onStop={onStop}
            placeholder="Follow up with anything..."
            compact
          />
        </div>
      </div>
    </div>
  );
}

// ── Status helpers ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  let color = 'text-muted-foreground/50';
  if (status === 'completed') color = 'text-emerald-500';
  else if (status === 'running' || status === 'in_progress') color = 'text-amber-400';
  else if (status === 'failed' || status === 'error') color = 'text-red-400';

  return <Circle className={`w-2.5 h-2.5 fill-current ${color}`} />;
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

// ── Home Page ────────────────────────────────────────────────────────────────

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
    <div className="flex flex-col h-full max-w-2xl w-full mx-auto gap-8 justify-start pt-[15vh] px-4">
      {/* Prompt */}
      <div className="animate-fade-in">
        <PromptBox
          onSubmit={(prompt) => onSubmit(prompt)}
          placeholder="Describe what you want to build..."
        />
      </div>

      {/* Active Tasks */}
      <div className="animate-fade-in" style={{ animationDelay: '0.1s', animationFillMode: 'backwards' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground/70">Active Tasks</h2>
        </div>

        {activeTasks.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No active tasks</p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              Tasks in progress will appear here
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {activeTasks.map((task) => (
              <button
                key={task.id}
                onClick={() =>
                  navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
                }
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer text-left first:rounded-t-xl last:rounded-b-xl"
              >
                <StatusDot status={task.status} />
                <span className="text-sm text-foreground truncate flex-1">
                  {task.title}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {timeAgo(task.createdAt)}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

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

  if (messages.length === 0) {
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
