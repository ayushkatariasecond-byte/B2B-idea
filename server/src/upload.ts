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

// ── Content verification ────────────────────────────────────────────────────
/**
 * The mimetype `fileFilter` above checks is the one the *client* declared in the multipart
 * part header. It is not derived from the bytes and nothing stops a caller from sending
 * `Content-Type: image/png` with an HTML document, a shell script, or an SVG as the body —
 * which is the same stored-content class the mimetype allowlist was added to close, just
 * reached through a header the attacker also controls.
 *
 * So the declared type is re-checked against the actual leading bytes once the file is on
 * disk. This is intentionally a container-level check, not a full parse: it answers "is this
 * really a PNG/JPEG/MP4 container?" — enough to reject a text/script payload wearing an
 * image mimetype — without getting so strict that a legitimate photo from some phone's
 * encoder gets rejected, which would be a worse outcome than the risk it removes.
 */
function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(buf: Buffer, offset: number, length: number): string {
  if (buf.length < offset + length) return '';
  return buf.subarray(offset, offset + length).toString('ascii');
}

/** ISO base media file format (MP4/MOV/HEIC all use it): a `ftyp` box at offset 4. */
function isIsoBmff(buf: Buffer): boolean {
  return ascii(buf, 4, 4) === 'ftyp';
}

/** Pre-ftyp QuickTime files start with one of these top-level atoms instead. */
const LEGACY_QT_ATOMS = ['moov', 'mdat', 'free', 'skip', 'wide', 'pnot'];

const SIGNATURE_CHECKS: Record<string, (buf: Buffer) => boolean> = {
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a',
  'image/webp': (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP',
  'image/heic': isIsoBmff,
  'image/heif': isIsoBmff,
  'video/mp4': isIsoBmff,
  'video/webm': (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]), // EBML header
  'video/quicktime': (b) => isIsoBmff(b) || LEGACY_QT_ATOMS.includes(ascii(b, 4, 4)),
};

const SIGNATURE_BYTES = 16;

async function readHeader(absPath: string): Promise<Buffer> {
  const handle = await fs.promises.open(absPath, 'r');
  try {
    const buf = Buffer.alloc(SIGNATURE_BYTES);
    const { bytesRead } = await handle.read(buf, 0, SIGNATURE_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Every file multer attached to this request, across .single() and .fields() shapes. */
function uploadedFiles(req: {
  file?: Express.Multer.File;
  files?: Record<string, Express.Multer.File[]> | Express.Multer.File[];
}): Express.Multer.File[] {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files) return Object.values(req.files).flat();
  return [];
}

/**
 * Express middleware. Mount immediately after any `upload.*` middleware. Rejects the whole
 * request — and deletes every file it wrote — if any uploaded file's bytes don't match the
 * type it claimed, so a rejected upload can never be left behind and referenced later.
 */
export async function verifyUploadedMedia(
  req: Parameters<typeof uploadedFiles>[0],
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  next: (err?: unknown) => void
): Promise<void> {
  const files = uploadedFiles(req);
  if (files.length === 0) return next();

  try {
    for (const file of files) {
      const check = SIGNATURE_CHECKS[file.mimetype];
      const header = await readHeader(file.path);
      if (!check || !check(header)) {
        await Promise.all(files.map((f) => fs.promises.unlink(f.path).catch(() => undefined)));
        res.status(400).json({ error: 'That file does not look like a real image or video.' });
        return;
      }
    }
  } catch (err) {
    return next(err);
  }
  next();
}
