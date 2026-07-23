import { Platform } from 'react-native';
import { api } from './client';
import { Business, Cuisine, MenuItem, Post } from './types';

export function getBusiness(id: string) {
  return api.get<{ business: Business }>(`/businesses/${id}`);
}

export function getBusinessByHandle(handle: string) {
  return api.get<{ business: Business }>(`/businesses/handle/${handle}`);
}

export function updateMe(input: {
  name?: string;
  category?: string;
  bio?: string;
  city?: string;
  website?: string;
  cuisineSlug?: string;
  menuItems?: MenuItem[];
}) {
  return api.patch<{ business: Business }>('/businesses/me', input);
}

export function getCuisines() {
  return api.get<{ cuisines: Cuisine[] }>('/cuisines');
}

async function uploadImage(path: string, input: { uri: string; fileName: string; mimeType: string }) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(input.uri)).blob();
    form.append('media', blob, input.fileName);
  } else {
    form.append('media', { uri: input.uri, name: input.fileName, type: input.mimeType } as unknown as Blob);
  }
  return api.postForm<{ business: Business }>(path, form);
}

export const updateAvatar = (input: { uri: string; fileName: string; mimeType: string }) => uploadImage('/businesses/me/avatar', input);
export const updateCover = (input: { uri: string; fileName: string; mimeType: string }) => uploadImage('/businesses/me/cover', input);

export function toggleFollow(businessId: string) {
  return api.post<{ following: boolean; followerCount: number }>(`/businesses/${businessId}/follow`);
}

export function toggleBlock(businessId: string) {
  return api.post<{ blocked: boolean }>(`/businesses/${businessId}/block`);
}

export function getBusinessPosts(businessId: string) {
  return api.get<{ posts: Post[] }>(`/businesses/${businessId}/posts`);
}

export function getFollowers(businessId: string) {
  return api.get<{ businesses: Business[] }>(`/businesses/${businessId}/followers`);
}

export function getFollowing(businessId: string) {
  return api.get<{ businesses: Business[] }>(`/businesses/${businessId}/following`);
}

export function searchBusinesses(q: string) {
  return api.get<{ businesses: Business[] }>(`/businesses/search?q=${encodeURIComponent(q)}`);
}

export function getSuggested() {
  return api.get<{ businesses: Business[] }>('/businesses/suggested');
}

export function registerPushToken(token: string | null) {
  return api.post<{ ok: boolean }>('/businesses/me/push-token', { token });
}

export function requestVerification() {
  return api.post<{ business: Business }>('/businesses/me/request-verification');
}

export function exportMyData() {
  return api.get<Record<string, unknown>>('/businesses/me/export');
}

export function deleteMyAccount() {
  return api.delete<{ ok: boolean }>('/businesses/me');
}
