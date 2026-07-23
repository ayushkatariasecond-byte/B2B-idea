import { Platform } from 'react-native';
import { api } from './client';
import { Comment, Post, PostStatus, TrendingTag } from './types';

export function getFeed(tab: 'forYou' | 'following', page = 1, cuisineSlug?: string) {
  const search = new URLSearchParams({ tab, page: String(page) });
  if (cuisineSlug) search.set('cuisine', cuisineSlug);
  return api.get<{ posts: Post[]; page: number; hasMore: boolean; city?: string }>(`/posts/feed?${search.toString()}`);
}

export function discover(params: { tag?: string; q?: string; hashtag?: string }) {
  const search = new URLSearchParams();
  if (params.tag) search.set('tag', params.tag);
  if (params.q) search.set('q', params.q);
  if (params.hashtag) search.set('hashtag', params.hashtag);
  return api.get<{ posts: Post[] }>(`/posts/discover?${search.toString()}`);
}

export function getTrendingTags() {
  return api.get<{ tags: TrendingTag[] }>('/posts/trending-tags');
}

export function getDrafts() {
  return api.get<{ posts: Post[] }>('/posts/mine/drafts');
}

export function getSaved() {
  return api.get<{ posts: Post[] }>('/posts/saved');
}

export function toggleSave(postId: string) {
  return api.post<{ saved: boolean }>(`/posts/${postId}/save`);
}

export function updatePost(
  postId: string,
  input: { caption?: string; tag?: string; status?: PostStatus; scheduledFor?: string | null }
) {
  return api.patch<{ post: Post }>(`/posts/${postId}`, input);
}

export function deletePost(postId: string) {
  return api.delete<{ ok: boolean }>(`/posts/${postId}`);
}

export function deleteComment(postId: string, commentId: string) {
  return api.delete<{ ok: boolean }>(`/posts/${postId}/comments/${commentId}`);
}

export function getPost(id: string) {
  return api.get<{ post: Post }>(`/posts/${id}`);
}

interface FilePart {
  uri: string;
  fileName: string;
  mimeType: string;
}

async function appendFile(form: FormData, field: string, file: FilePart) {
  if (Platform.OS === 'web') {
    // On web the picker gives a blob:/data: URI; fetch it to get a real Blob for FormData.
    const blob = await (await fetch(file.uri)).blob();
    form.append(field, blob, file.fileName);
  } else {
    // React Native's fetch/FormData polyfill accepts this { uri, name, type } shape natively.
    form.append(field, { uri: file.uri, name: file.fileName, type: file.mimeType } as unknown as Blob);
  }
}

export async function createPost(input: {
  uri: string;
  fileName: string;
  mimeType: string;
  caption: string;
  tag: string;
  thumbnail?: FilePart;
  status?: PostStatus;
  scheduledFor?: string;
}) {
  const form = new FormData();
  form.append('caption', input.caption);
  form.append('tag', input.tag);
  if (input.status) form.append('status', input.status);
  if (input.scheduledFor) form.append('scheduledFor', input.scheduledFor);
  await appendFile(form, 'media', input);
  if (input.thumbnail) await appendFile(form, 'thumbnail', input.thumbnail);

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
