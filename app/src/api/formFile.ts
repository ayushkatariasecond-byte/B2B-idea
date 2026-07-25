import { Platform } from 'react-native';
import { ApiError } from './client';

export interface FilePart {
  uri: string;
  fileName: string;
  mimeType: string;
  /**
   * Web only: the actual `File` the picker already handed us
   * (`ImagePickerAsset.file`, populated by expo-image-picker on web).
   *
   * Strongly preferred over `uri`. See appendFile below for why.
   */
  file?: File;
}

/**
 * Attaches a picked photo/video to a multipart form, for web and native.
 *
 * WHY THE `file` BRANCH EXISTS — this is a real bug, not a micro-optimisation.
 *
 * The web path used to unconditionally do `await (await fetch(part.uri)).blob()` to turn the
 * picker's `blob:`/`data:` URI back into bytes. That re-fetch is an extra failure point on
 * the one action it guards, and when it fails it throws a bare `TypeError: Failed to fetch`
 * — NOT an ApiError. ComposeScreen's catch only knows how to render an ApiError's message,
 * so every such failure became the sentence "Something went wrong. Please try again.", and
 * because nothing was ever sent, the server logged nothing at all. A user reporting
 * "couldn't post" produced literally zero evidence anywhere.
 *
 * It can fail for ordinary reasons: an object URL that has been revoked, and large videos,
 * where the re-fetch has to materialise the whole file in memory a second time — exactly the
 * 30-60s phone clips this app is built around.
 *
 * The picker already gives us a real `File` on web, and `File` IS a `Blob`, so it can go
 * straight into FormData. No round trip, nothing to revoke, no second copy in memory.
 *
 * The `uri` fetch stays as a fallback for callers that only have a URI (generated video
 * thumbnails, which are freshly-built data: URIs) — but a failure there now raises an
 * ApiError, so the user is told what actually happened instead of "something went wrong".
 */
export async function appendFile(form: FormData, field: string, part: FilePart): Promise<void> {
  if (Platform.OS !== 'web') {
    // React Native's fetch/FormData polyfill accepts this { uri, name, type } shape natively.
    form.append(field, { uri: part.uri, name: part.fileName, type: part.mimeType } as unknown as Blob);
    return;
  }

  if (part.file) {
    form.append(field, part.file, part.fileName);
    return;
  }

  let blob: Blob;
  try {
    blob = await (await fetch(part.uri)).blob();
  } catch {
    // Status 0 matches the client's "never reached the server" convention (see client.ts).
    throw new ApiError(
      0,
      "Couldn't read the file you selected — it may be too large for this browser, or the selection expired. Try picking it again, or use a shorter video."
    );
  }
  form.append(field, blob, part.fileName);
}
