import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getWsUrl } from '../lib/config';
import { ZERO_ENABLED } from './use-zero';
import { createTaskSyncSubscription } from '@/lib/task-sync';

const RECONNECT_DELAY_MS = 3_000;

interface WsMessage {
  type: string;
}

/**
 * Subscribes to realtime task change notifications via WebSocket.
 * When a `tasks_changed` message arrives, task list and task detail queries are
 * invalidated so sidebars and already-open task pages refresh immediately.
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
        queryClient.invalidateQueries({ queryKey: ['task'] });
        queryClient.invalidateQueries({ queryKey: ['task-runs'] });
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
    const unsubscribeTaskSync = createTaskSyncSubscription(() => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task'] });
      queryClient.invalidateQueries({ queryKey: ['task-runs'] });
    });

    return () => {
      mountedRef.current = false;
      unsubscribeTaskSync();

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on cleanup
        wsRef.current.close();
      }
    };
  }, [connect, queryClient]);
}
