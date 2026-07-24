import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { UPLOAD_DIR } from '../upload';

ffmpeg.setFfmpegPath(ffmpegPath.path);

const MAX_DIMENSION = 1280;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runTranscodeOnce(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-crf 26',
        '-preset veryfast',
        `-vf scale='if(gt(iw,ih),min(${MAX_DIMENSION},iw),-2)':'if(gt(iw,ih),-2,min(${MAX_DIMENSION},ih))'`,
        '-movflags +faststart',
        '-pix_fmt yuv420p',
      ])
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .save(outputPath);
  });
}

/**
 * Re-encodes an uploaded video to a web-friendly H.264/AAC mp4, capped to MAX_DIMENSION on
 * the long edge, with faststart so it can start playing before fully downloaded. Deletes the
 * original raw upload once the transcode succeeds. Returns the new file's basename.
 *
 * Retries up to 3 attempts total with exponential backoff (500ms, 1s) before giving up —
 * ffmpeg can fail for plenty of transient reasons (disk contention, a momentarily-busy CPU,
 * a flaky temp-file race) that succeed on a second try. Both existing callers already treat
 * a rejected promise as "fall back to the original upload, don't block the post/story"
 * (unchanged) — this just makes that fallback less likely to trigger on a passing blip.
 */
export async function transcodeVideo(inputFilename: string): Promise<string> {
  const inputPath = path.join(UPLOAD_DIR, inputFilename);
  const outputFilename = `${path.parse(inputFilename).name}-web.mp4`;
  const outputPath = path.join(UPLOAD_DIR, outputFilename);

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await runTranscodeOnce(inputPath, outputPath);
      fs.unlink(inputPath, () => undefined);
      return outputFilename;
    } catch (err) {
      lastError = err as Error;
      // Clean up any partial output before retrying so ffmpeg isn't confused by a
      // half-written file left over from the failed attempt.
      fs.unlink(outputPath, () => undefined);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
}
