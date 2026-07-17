import { api } from './client';
import { AnalyticsResponse } from './types';

export function getMyAnalytics() {
  return api.get<AnalyticsResponse>('/analytics/me');
}
