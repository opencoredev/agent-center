import { useState, useEffect, useRef, useCallback } from 'react';
import { getWsUrl } from '../lib/config';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RunEvent {
  id: string;
  runId: string;
  eventType: string;
  sequence: number;
  level: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface WsMessage {
  type: string;
  runId?: string;
  event?: RunEvent;
}

function mergeRunEvents(previous: RunEvent[], next: RunEvent[]): RunEvent[] {
  const merged = new Map<string, RunEvent>();

  for (const event of previous) {
    merged.set(`${event.runId}:${event.sequence}`, event);
  }

  for (const event of next) {
    merged.set(`${event.runId}:${event.sequence}`, event);
  }

  return Array.from(merged.values()).sort((left, right) => left.sequence - right.sequence);
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useRunStream(runId: string) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (!runId) return;

    const wsUrl = getWsUrl();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe_run', runId }));
    };

    ws.onmessage = (evt) => {
      const msg: WsMessage = JSON.parse(evt.data as string);

      if (msg.type === 'run_event' && msg.event) {
        setEvents((prev) => mergeRunEvents(prev, [msg.event!]));

        // Track status changes from run.status_changed events
        if (
          msg.event.eventType === 'run.status_changed' &&
          msg.event.payload?.status
        ) {
          setRunStatus(msg.event.payload.status as string);
        }
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (mountedRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => ws.close();
  }, [runId]);

  useEffect(() => {
    setEvents([]);
    setIsConnected(false);
    setRunStatus(null);
  }, [runId]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on cleanup
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { events, isConnected, runStatus };
}
