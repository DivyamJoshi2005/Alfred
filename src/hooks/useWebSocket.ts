/**
 * WebSocket hook with auto-reconnect and typed message parsing.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { WSMessage } from '../types/ws';

const WS_URL = 'ws://127.0.0.1:8741/ws';
const RECONNECT_DELAY = 3000;
const PING_INTERVAL = 30000;

export function useWebSocket(onMessage?: (msg: WSMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[WS] Connected');
        // Start ping heartbeat
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage;
          onMessage?.(msg);
        } catch {
          console.warn('[WS] Failed to parse message:', event.data);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        cleanup();
        // Auto-reconnect
        if (mountedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // Server not ready yet — retry
      if (mountedRef.current) {
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
      }
    }
  }, [onMessage, cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      cleanup();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect, cleanup]);

  return wsRef;
}
