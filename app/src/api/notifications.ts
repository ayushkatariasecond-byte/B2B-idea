import { api } from './client';
import { AppNotification } from './types';

export function getNotifications() {
  return api.get<{ notifications: AppNotification[] }>('/notifications');
}

export function getUnreadCount() {
  return api.get<{ count: number }>('/notifications/unread-count');
}

export function markRead(id: string) {
  return api.post<{ ok: boolean }>(`/notifications/${id}/read`);
}

export function markAllRead() {
  return api.post<{ ok: boolean }>('/notifications/read-all');
}
