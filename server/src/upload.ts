import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

export const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Explicit allowlist, not a `startsWith('image/')`/`startsWith('video/')` prefix check — that
// prefix check also let `image/svg+xml` through, and an uploaded SVG gets served back by
// express.static with that same content-type, which browsers treat as active content (an
// embedded <script> in it executes — classic stored-XSS-via-upload). Every entry below is a
// real, inert format this app's own clients (expo-image-picker, the video transcoder) produce.
export const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  // The stored extension always comes from the table above, keyed by the mimetype fileFilter
  // already validated — never from the client-supplied original filename. multer only calls
  // this for a file fileFilter has already accepted, so the lookup below is always defined.
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${ALLOWED_MIME_EXT[file.mimetype]}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_EXT[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Only image or video uploads are allowed'));
    }
  },
});

export function mediaTypeFromMime(mimetype: string): 'image' | 'video' {
  return mimetype.startsWith('video/') ? 'video' : 'image';
}
