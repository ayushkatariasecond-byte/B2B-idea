import { Platform } from 'react-native';

export interface ThumbnailFile {
  uri: string;
  fileName: string;
  mimeType: string;
}

async function generateWebThumbnail(uri: string): Promise<ThumbnailFile | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.src = uri;

    const cleanup = () => {
      video.remove();
    };

    video.onloadeddata = () => {
      // Seeking to a fraction of a second in avoids an all-black first frame on some encodings.
      video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (!blob) {
              resolve(null);
              return;
            }
            resolve({ uri: URL.createObjectURL(blob), fileName: 'thumbnail.jpg', mimeType: 'image/jpeg' });
          },
          'image/jpeg',
          0.85
        );
      } catch {
        cleanup();
        resolve(null);
      }
    };

    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

async function generateNativeThumbnail(uri: string): Promise<ThumbnailFile | null> {
  try {
    const VideoThumbnails = await import('expo-video-thumbnails');
    const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, { time: 100 });
    return { uri: thumbUri, fileName: 'thumbnail.jpg', mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}

/** Best-effort: returns null on any failure so callers can post without a thumbnail rather than blocking. */
export async function generateVideoThumbnail(uri: string): Promise<ThumbnailFile | null> {
  if (Platform.OS === 'web') return generateWebThumbnail(uri);
  return generateNativeThumbnail(uri);
}
