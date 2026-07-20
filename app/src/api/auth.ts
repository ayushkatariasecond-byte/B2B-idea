import { api } from './client';
import { Business } from './types';

export interface AuthResponse {
  token: string;
  business: Business;
  memberRole?: string;
}

export function signup(input: { email: string; password: string; name: string; handle: string; category: string; bio?: string }) {
  return api.post<AuthResponse>('/auth/signup', input);
}

export function login(input: { email: string; password: string }) {
  return api.post<AuthResponse>('/auth/login', input);
}

export function me() {
  return api.get<{ business: Business; isOwner: boolean }>('/auth/me');
}

export function forgotPassword(email: string) {
  return api.post<{ ok: boolean }>('/auth/forgot-password', { email });
}

export function resetPassword(input: { token: string; password: string }) {
  return api.post<{ ok: boolean }>('/auth/reset-password', input);
}

export function verifyEmail(token: string) {
  return api.post<{ ok: boolean }>('/auth/verify-email', { token });
}

export function resendVerification() {
  return api.post<{ ok: boolean; alreadyVerified?: boolean }>('/auth/resend-verification');
}
