import React, { useRef, useEffect, useState } from 'react';
import {
  User,
  Zap,
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
    return <Loader2 className="w-3.5 h-3.5 text-[var(--color-accent)] animate-spin" />;
  if (status === 'completed')
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === 'failed')
    return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  if (status === 'pending')
    return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
  return null;
}

// ── Terminal Block ────────────────────────────────────────────────────────

function TerminalBlock({ events }: { events: RunEvent[] }) {
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, expanded]);

  if (events.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-[var(--color-border-subtle)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 bg-[var(--color-surface)] hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        <Terminal className="w-3.5 h-3.5" />
        <span>Terminal Output</span>
        <span className="text-zinc-600 ml-auto">{events.length} events</span>
      </button>
      {expanded && (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto bg-[var(--color-surface)] px-3 py-2 font-mono text-[11px] leading-5"
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
                      ? 'text-cyan-400'
                      : 'text-zinc-400'
                }
              >
                <span className="text-zinc-600 mr-2 select-none">
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
    <div className={`animate-slide-in ${isUser ? 'flex justify-end' : ''}`}>
      <div className={`flex gap-3 max-w-3xl ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
            isUser
              ? 'bg-zinc-800 text-zinc-400'
              : 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
          }`}
        >
          {isUser ? (
            <User className="w-3.5 h-3.5" />
          ) : (
            <Zap className="w-3.5 h-3.5" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-zinc-400">
              {isUser ? 'You' : 'Agent'}
            </span>
            <StatusIcon status={message.status} />
            <span className="text-[11px] text-zinc-600">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <div
            className={`text-[14px] leading-relaxed ${
              isUser
                ? 'text-zinc-200 bg-white/[0.04] rounded-2xl rounded-tr-md px-4 py-2.5'
                : 'text-zinc-300'
            }`}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>

          {/* Terminal output for agent messages */}
          {message.events && message.events.length > 0 && (
            <TerminalBlock events={message.events} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Streaming indicator ───────────────────────────────────────────────────

function StreamingIndicator() {
  return (
    <div className="flex gap-3 animate-slide-in">
      <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
        <Zap className="w-3.5 h-3.5" />
      </div>
      <div className="flex items-center gap-1.5 py-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse-dot" />
        <div
          className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse-dot"
          style={{ animationDelay: '0.3s' }}
        />
        <div
          className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse-dot"
          style={{ animationDelay: '0.6s' }}
        />
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
