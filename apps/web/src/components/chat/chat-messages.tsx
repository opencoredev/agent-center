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

// ── Types ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  events?: RunEvent[];
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

// ── Status Icon ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status?: string }) {
  if (status === 'running')
    return <Loader2 className="w-3.5 h-3.5 text-sidebar-primary animate-spin" />;
  if (status === 'completed')
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === 'failed')
    return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  if (status === 'pending')
    return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  return null;
}

// ── Collapsible Tool Output ──────────────────────────────────────────────

function ToolOutputBlock({ events }: { events: RunEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, expanded]);

  if (events.length === 0) return null;

  // Group into summary lines like "> Running git add"
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
        <span className="font-mono text-xs">{summaryText}</span>
        <span className="text-xs text-muted-foreground ml-1">({events.length})</span>
      </button>
      {expanded && (
        <div
          ref={scrollRef}
          className="mt-1.5 max-h-64 overflow-y-auto rounded-lg bg-secondary/50 border border-border px-3 py-2 font-mono text-[11px] leading-5"
        >
          {events.map((event, i) => {
            const isError = event.level === 'error';
            const isCmd = event.eventType.includes('command');
            return (
              <div
                key={event.id || i}
                className={
                  isError
                    ? 'text-red-400'
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

// ── Single Message ────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`${isUser ? 'flex justify-end' : ''}`}>
      <div className={`flex gap-3 max-w-3xl ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
            isUser
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'bg-secondary text-muted-foreground'
          }`}
        >
          {isUser ? (
            <User className="w-3.5 h-3.5" />
          ) : (
            <Bot className="w-3.5 h-3.5" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {isUser ? 'You' : 'Agent'}
            </span>
            <StatusIcon status={message.status} />
            <span className="text-[11px] text-muted-foreground/60">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <div
            className={`text-[14px] leading-relaxed ${
              isUser
                ? 'bg-sidebar-primary text-sidebar-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 inline-block'
                : 'text-foreground'
            }`}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>

          {/* Tool output for agent messages */}
          {message.events && message.events.length > 0 && (
            <ToolOutputBlock events={message.events} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Streaming indicator ───────────────────────────────────────────────────

function StreamingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 bg-secondary text-muted-foreground">
        <Bot className="w-3.5 h-3.5" />
      </div>
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Planning next moves...</span>
      </div>
    </div>
  );
}

// ── Message List ──────────────────────────────────────────────────────────

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
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && <StreamingIndicator />}
      </div>
    </div>
  );
}
