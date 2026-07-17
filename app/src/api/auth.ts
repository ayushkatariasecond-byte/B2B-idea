import { api } from './client';
import { Business } from './types';

export interface AuthResponse {
  token: string;
  business: Business;
}

export function signup(input: { email: string; password: string; name: string; handle: string; category: string; bio?: string }) {
  return api.post<AuthResponse>('/auth/signup', input);
}

export function login(input: { email: string; password: string }) {
  return api.post<AuthResponse>('/auth/login', input);
}

export function me() {
  return api.get<{ business: Business }>('/auth/me');
}
