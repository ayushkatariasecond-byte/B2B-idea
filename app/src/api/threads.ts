import { api } from './client';
import { ThreadMessage, ThreadSummary } from './types';

export function getThreads() {
  return api.get<{ threads: ThreadSummary[] }>('/threads');
}

export function startThread(businessId: string) {
  return api.post<{ threadId: string }>('/threads', { businessId });
}

export function getMessages(threadId: string) {
  return api.get<{ messages: ThreadMessage[] }>(`/threads/${threadId}/messages`);
}

export function sendMessage(threadId: string, text: string) {
  return api.post<{ message: ThreadMessage }>(`/threads/${threadId}/messages`, { text });
}
