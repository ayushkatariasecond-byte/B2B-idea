import { Platform } from 'react-native';
import { api } from './client';
import { Comment, Post } from './types';

export function getFeed(tab: 'forYou' | 'following', page = 1) {
  return api.get<{ posts: Post[]; page: number; hasMore: boolean }>(`/posts/feed?tab=${tab}&page=${page}`);
}

export function discover(params: { tag?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.tag) search.set('tag', params.tag);
  if (params.q) search.set('q', params.q);
  return api.get<{ posts: Post[] }>(`/posts/discover?${search.toString()}`);
}

export function getPost(id: string) {
  return api.get<{ post: Post }>(`/posts/${id}`);
}

export async function createPost(input: { uri: string; fileName: string; mimeType: string; caption: string; tag: string }) {
  const form = new FormData();
  form.append('caption', input.caption);
  form.append('tag', input.tag);

  if (Platform.OS === 'web') {
    // On web the picker gives a blob:/data: URI; fetch it to get a real Blob for FormData.
    const blob = await (await fetch(input.uri)).blob();
    form.append('media', blob, input.fileName);
  } else {
    // React Native's fetch/FormData polyfill accepts this { uri, name, type } shape natively.
    form.append('media', { uri: input.uri, name: input.fileName, type: input.mimeType } as unknown as Blob);
  }

  return api.postForm<{ post: Post }>('/posts', form);
}

export function toggleLike(postId: string) {
  return api.post<{ likedByMe: boolean; likeCount: number }>(`/posts/${postId}/like`);
}

export function recordView(postId: string) {
  return api.post<{ ok: boolean }>(`/posts/${postId}/view`);
}

export function recordShare(postId: string) {
  return api.post<{ shareCount: number }>(`/posts/${postId}/share`);
}

export function getComments(postId: string) {
  return api.get<{ comments: Comment[] }>(`/posts/${postId}/comments`);
}

export function addComment(postId: string, text: string) {
  return api.post<{ comment: Comment }>(`/posts/${postId}/comments`, { text });
}
