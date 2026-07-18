import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { UPLOAD_DIR } from '../upload';

ffmpeg.setFfmpegPath(ffmpegPath.path);

const MAX_DIMENSION = 1280;

/**
 * Re-encodes an uploaded video to a web-friendly H.264/AAC mp4, capped to MAX_DIMENSION on
 * the long edge, with faststart so it can start playing before fully downloaded. Deletes the
 * original raw upload once the transcode succeeds. Returns the new file's basename.
 */
export function transcodeVideo(inputFilename: string): Promise<string> {
  const inputPath = path.join(UPLOAD_DIR, inputFilename);
  const outputFilename = `${path.parse(inputFilename).name}-web.mp4`;
  const outputPath = path.join(UPLOAD_DIR, outputFilename);

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
      .on('end', () => {
        fs.unlink(inputPath, () => undefined);
        resolve(outputFilename);
      })
      .on('error', (err: Error) => reject(err))
      .save(outputPath);
  });
}
