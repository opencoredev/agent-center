import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getWsUrl } from '../lib/config';
import { ZERO_ENABLED } from './use-zero';

const RECONNECT_DELAY_MS = 3_000;

interface WsMessage {
  type: string;
}

/**
 * Subscribes to realtime task change notifications via WebSocket.
 * When a `tasks_changed` message arrives, all `['tasks']` queries are
 * automatically invalidated so the sidebar and home page refresh.
 */
export function useRealtimeTasks() {
  if (ZERO_ENABLED) return;

  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe_tasks' }));
    };

    ws.onmessage = (evt) => {
      const msg: WsMessage = JSON.parse(evt.data as string);

      if (msg.type === 'tasks_changed') {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => ws.close();
  }, [queryClient]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on cleanup
        wsRef.current.close();
      }
    };
  }, [connect]);
}
