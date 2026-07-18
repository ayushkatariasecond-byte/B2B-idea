export type RealtimeEvent =
  | { kind: 'notification'; notificationId: string; type: string; postId?: string; threadId?: string }
  | { kind: 'thread-message'; threadId: string; message: { id: string; text: string; senderId: string; createdAt: string; mine: boolean } };

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();

export function onRealtimeEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitRealtimeEvent(event: RealtimeEvent) {
  listeners.forEach((listener) => listener(event));
}
