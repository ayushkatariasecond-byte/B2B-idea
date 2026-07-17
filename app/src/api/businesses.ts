import { Platform } from 'react-native';
import { api } from './client';
import { Business, Post } from './types';

export function getBusiness(id: string) {
  return api.get<{ business: Business }>(`/businesses/${id}`);
}

export function getBusinessByHandle(handle: string) {
  return api.get<{ business: Business }>(`/businesses/handle/${handle}`);
}

export function updateMe(input: { name?: string; category?: string; bio?: string }) {
  return api.patch<{ business: Business }>('/businesses/me', input);
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

export function getBusinessPosts(businessId: string) {
  return api.get<{ posts: Post[] }>(`/businesses/${businessId}/posts`);
}
