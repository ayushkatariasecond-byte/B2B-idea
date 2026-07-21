import { Platform } from 'react-native';
import { api } from './client';
import { CreatedStory, StoryGroup } from './types';

export function getStories() {
  return api.get<{ groups: StoryGroup[] }>('/stories');
}

export function viewStory(storyId: string) {
  return api.post<{ ok: boolean }>(`/stories/${storyId}/view`);
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

export async function createStory(input: { uri: string; fileName: string; mimeType: string }) {
  const form = new FormData();
  await appendFile(form, 'media', input);
  return api.postForm<{ story: CreatedStory }>('/stories', form);
}
