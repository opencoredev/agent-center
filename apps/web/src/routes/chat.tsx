import React, { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { PromptBox } from '@/components/chat/prompt-box';
import { ChatMessages, type ChatMessage } from '@/components/chat/chat-messages';
import { useRunStream, type RunEvent } from '@/hooks/use-run-stream';
import { apiGet, apiPost } from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  status: string;
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
  // Merge events into the last agent message
  const messagesWithEvents = messages.map((msg, i) => {
    if (msg.role === 'agent' && i === messages.length - 1) {
      return { ...msg, events, status: isStreaming ? ('running' as const) : msg.status };
    }
    return msg;
  });

  return (
    <div className="flex flex-col h-full">
      <ChatMessages messages={messagesWithEvents} isStreaming={isStreaming && messages[messages.length - 1]?.role === 'user'} />
      <div className="flex-shrink-0 px-6 pb-4 pt-2">
        <div className="max-w-4xl mx-auto">
          <PromptBox
            onSubmit={(prompt) => onSend(prompt)}
            isStreaming={isStreaming}
            onStop={onStop}
            placeholder="Follow up..."
          />
        </div>
      </div>
    </div>
  );
}

// ── Hero / Empty State ────────────────────────────────────────────────────

function HeroPrompt({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl animate-fade-up">
        {/* Brand mark */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--color-accent)]/20 to-transparent border border-[var(--color-border-default)] flex items-center justify-center mb-4">
            <Sparkles className="w-5 h-5 text-[var(--color-accent)]" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-200 tracking-tight">
            What do you want to build?
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5">
            Describe a task and an AI agent will execute it for you.
          </p>
        </div>

        {/* Centered prompt box */}
        <div className="animate-fade-up-delayed">
          <PromptBox
            onSubmit={(prompt) => onSubmit(prompt)}
            placeholder="e.g. Add a dark mode toggle to the settings page..."
            centered
          />
        </div>

        {/* Quick suggestions */}
        <div className="flex flex-wrap justify-center gap-2 mt-6 animate-fade-up-delayed">
          {[
            'Fix the failing tests',
            'Add form validation',
            'Refactor the auth module',
            'Write API documentation',
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onSubmit(suggestion)}
              className="px-3 py-1.5 rounded-full text-xs text-zinc-500 bg-white/[0.03] border border-[var(--color-border-subtle)] hover:bg-white/[0.06] hover:text-zinc-400 hover:border-[var(--color-border-default)] transition-all cursor-pointer"
            >
              {suggestion}
            </button>
          ))}
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

  // Track when run completes
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
      // Get first workspace
      const workspaces = await apiGet<Workspace[]>('/api/workspaces');
      const workspaceId = workspaces[0]?.id;
      if (!workspaceId) throw new Error('No workspace found');

      // Create task
      const task = await apiPost<Task>('/api/tasks', {
        workspaceId,
        title: prompt.slice(0, 80),
        prompt,
        config: { agentProvider: 'claude' },
        permissionMode: 'safe',
      });

      // Create run
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
    // TODO: call cancel API
    setIsWorking(false);
  }, []);

  const hasMessages = messages.length > 0;

  if (!hasMessages) {
    return <HeroPrompt onSubmit={handleSubmit} />;
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
