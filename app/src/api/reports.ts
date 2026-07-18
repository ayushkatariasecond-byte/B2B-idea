import { api } from './client';

export function reportContent(input: { targetType: 'post' | 'comment' | 'business'; targetId: string; reason: string }) {
  return api.post<{ report: { id: string; createdAt: string } }>('/reports', input);
}
