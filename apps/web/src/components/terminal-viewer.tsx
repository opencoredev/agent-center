import React, { useRef, useState, useEffect } from 'react';
import type { RunEvent } from '@/hooks/use-run-stream';

// ── Helpers ────────────────────────────────────────────────────────────────

function getEventColor(eventType: string, level: string | null): string {
  if (level === 'error') return 'text-red-400';
  if (eventType.includes('command.started')) return 'text-cyan-400';
  if (eventType.includes('command.finished')) return 'text-green-400';
  if (eventType.includes('clone')) return 'text-blue-400';
  if (eventType.includes('completed')) return 'text-green-500';
  if (eventType.includes('failed')) return 'text-red-500';
  return 'text-zinc-300';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

// ── Component ──────────────────────────────────────────────────────────────

const MAX_VISIBLE = 500;

interface TerminalViewerProps {
  events: RunEvent[];
}

export function TerminalViewer({ events }: TerminalViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    setAutoScroll(isAtBottom);
  };

  const visibleEvents = events.slice(-MAX_VISIBLE);

  return (
    <div className="relative h-96 bg-zinc-950 rounded-lg border border-zinc-800">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto p-4 font-mono text-xs"
        onScroll={handleScroll}
      >
        {visibleEvents.length === 0 ? (
          <span className="text-zinc-600">Waiting for events...</span>
        ) : (
          visibleEvents.map((event, i) => (
            <div
              key={event.id || i}
              className={`leading-5 ${getEventColor(event.eventType, event.level)}`}
            >
              <span className="text-zinc-600 mr-2">
                {formatTime(event.createdAt)}
              </span>
              <span className="text-zinc-500 mr-2">[{event.eventType}]</span>
              {event.message || ''}
            </div>
          ))
        )}
      </div>

      {!autoScroll && (
        <button
          type="button"
          onClick={() => {
            setAutoScroll(true);
            scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
          }}
          className="absolute bottom-4 right-4 bg-zinc-800 text-zinc-200 px-3 py-1 rounded text-xs hover:bg-zinc-700 transition-colors"
        >
          &darr; Resume scroll
        </button>
      )}
    </div>
  );
}
