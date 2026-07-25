import { api } from './client';
import { appendFile } from './formFile';
import { CreatedStory, StoryGroup } from './types';

export function getStories() {
  return api.get<{ groups: StoryGroup[] }>('/stories');
}

export function viewStory(storyId: string) {
  return api.post<{ ok: boolean }>(`/stories/${storyId}/view`);
}

export async function createStory(input: { uri: string; fileName: string; mimeType: string; file?: File }) {
  const form = new FormData();
  await appendFile(form, 'media', input);
  return api.postForm<{ story: CreatedStory }>('/stories', form);
}
