import React, { useRef, useEffect, useState } from 'react';
import {
  User,
  Bot,
  ChevronDown,
  ChevronRight,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import type { RunEvent } from '@/hooks/use-run-stream';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  events?: RunEvent[];
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

function StatusIcon({ status }: { status?: string }) {
  if (status === 'running')
    return <Loader2 className="w-3.5 h-3.5 text-sidebar-primary animate-spin" />;
  if (status === 'completed')
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === 'failed')
    return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  if (status === 'pending')
    return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  return null;
}

function ToolOutputBlock({ events }: { events: RunEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, expanded]);

  if (events.length === 0) return null;

  const lastEvent = events[events.length - 1];
  const summaryText = lastEvent?.message || lastEvent?.eventType || 'Running...';

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        <Terminal className="w-3.5 h-3.5" />
        <span className="font-mono text-xs truncate max-w-sm">{summaryText}</span>
        <span className="text-xs text-muted-foreground/60">({events.length})</span>
      </button>
      {expanded && (
        <div
          ref={scrollRef}
          className="mt-1.5 max-h-64 overflow-y-auto rounded-lg bg-muted/50 border border-border px-3 py-2 font-mono text-[11px] leading-5"
        >
          {events.map((event, i) => {
            const isError = event.level === 'error';
            const isCmd = event.eventType.includes('command');
            return (
              <div
                key={event.id || i}
                className={
                  isError
                    ? 'text-destructive'
                    : isCmd
                      ? 'text-sidebar-primary'
                      : 'text-muted-foreground'
                }
              >
                <span className="opacity-40 mr-2 select-none">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </span>
                {event.message || event.eventType}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={isUser ? 'flex justify-end' : ''}>
      <div
        className={`p-2.5 rounded-md w-full break-words ${
          isUser
            ? 'bg-primary/10 ml-auto max-w-[80%] w-fit'
            : 'mr-auto'
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center ${
              isUser
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {isUser ? (
              <User className="w-3 h-3" />
            ) : (
              <Bot className="w-3 h-3" />
            )}
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {isUser ? 'You' : 'Agent'}
          </span>
          <StatusIcon status={message.status} />
          <span className="text-[11px] text-muted-foreground/50">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <div className="text-sm leading-relaxed text-foreground">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {message.events && message.events.length > 0 && (
          <ToolOutputBlock events={message.events} />
        )}
      </div>
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex items-center gap-2.5 p-2.5 text-sm text-muted-foreground">
      <div className="w-5 h-5 rounded-md flex items-center justify-center bg-muted">
        <Bot className="w-3 h-3" />
      </div>
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span>Thinking...</span>
    </div>
  );
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
}

export function ChatMessages({ messages, isStreaming = false }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && <StreamingIndicator />}
      </div>
    </div>
  );
}
