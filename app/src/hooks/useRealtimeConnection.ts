import { useEffect } from 'react';
import { API_BASE_URL } from '../api/client';
import { tokenStorage } from '../storage/tokenStorage';
import { emitRealtimeEvent, RealtimeEvent } from '../utils/realtimeEvents';

/** Opens a WebSocket to push notifications/messages live instead of requiring a manual refresh. Reconnects with backoff on drop; a failed connection just falls back to the existing refetch-on-focus behavior. */
export function useRealtimeConnection(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let ws: WebSocket | null = null;
    let closedByEffect = false;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      const token = await tokenStorage.get();
      if (!token || closedByEffect) return;

      const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        retryDelay = 1000;
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as RealtimeEvent;
          emitRealtimeEvent(data);
        } catch {
          // ignore malformed payloads
        }
      };
      ws.onclose = () => {
        if (closedByEffect) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [enabled]);
}
