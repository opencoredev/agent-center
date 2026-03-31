import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { RunEvent } from '@/hooks/use-run-stream';

function getEventColor(eventType: string, level: string | null): string {
  if (level === 'error') return 'text-destructive';
  if (eventType.includes('command.started')) return 'text-status-info';
  if (eventType.includes('command.finished')) return 'text-status-success';
  if (eventType.includes('clone')) return 'text-sidebar-primary';
  if (eventType.includes('completed')) return 'text-status-success';
  if (eventType.includes('failed')) return 'text-destructive';
  return 'text-foreground';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

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
    <div className="relative h-96 bg-background rounded-lg border border-border">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto p-4 font-mono text-xs"
        onScroll={handleScroll}
      >
        {visibleEvents.length === 0 ? (
          <span className="text-muted-foreground/40">Waiting for events...</span>
        ) : (
          visibleEvents.map((event, i) => (
            <div
              key={event.id || i}
              className={`leading-5 ${getEventColor(event.eventType, event.level)}`}
            >
              <span className="text-muted-foreground/40 mr-2">
                {formatTime(event.createdAt)}
              </span>
              <span className="text-muted-foreground/60 mr-2">[{event.eventType}]</span>
              {event.message || ''}
            </div>
          ))
        )}
      </div>

      {!autoScroll && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setAutoScroll(true);
            scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
          }}
          className="absolute bottom-4 right-4"
        >
          &darr; Resume scroll
        </Button>
      )}
    </div>
  );
}
