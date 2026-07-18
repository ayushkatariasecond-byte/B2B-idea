import { api } from './client';
import { TeamMember } from './types';

export function getTeamMembers() {
  return api.get<{ members: TeamMember[] }>('/team');
}

export function inviteTeamMember(input: { email: string; password: string }) {
  return api.post<{ member: TeamMember }>('/team', input);
}

export function removeTeamMember(memberId: string) {
  return api.delete<{ ok: boolean }>(`/team/${memberId}`);
}
