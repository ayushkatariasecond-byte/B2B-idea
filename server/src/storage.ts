import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { UPLOAD_DIR } from './upload';

/**
 * Media storage. Additive and defensive:
 * - If Supabase Storage isn't configured, uploads stay on local disk and we return the same
 *   `/uploads/<file>` path the app has always used — zero behaviour change for local dev.
 * - If configured, the file (already written to disk by multer) is pushed to a Supabase
 *   Storage bucket and its public URL is returned, so media survives cloud redeploys.
 * - Any failure falls back to the local path rather than failing the upload.
 *
 * Requires (for the hosted path): SUPABASE_URL, SUPABASE_SERVICE_KEY, and a public bucket
 * named by SUPABASE_BUCKET (default "media"), created once in the Supabase dashboard.
 */
const enabled = Boolean(env.supabaseUrl && env.supabaseServiceKey);
const client: SupabaseClient | null = enabled
  ? createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } })
  : null;

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function contentTypeFor(filename: string): string {
  return CONTENT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

export function storageEnabled(): boolean {
  return enabled;
}

/**
 * Given a filename that multer already wrote into UPLOAD_DIR, return the URL to store on the
 * post. Uploads to Supabase Storage when configured; otherwise returns the local path.
 */
export async function persistUpload(filename: string): Promise<string> {
  const localUrl = `/uploads/${filename}`;
  if (!client) return localUrl;

  const abs = path.join(UPLOAD_DIR, filename);
  try {
    const buffer = await fs.promises.readFile(abs);
    const { error } = await client.storage.from(env.supabaseBucket).upload(filename, buffer, {
      contentType: contentTypeFor(filename),
      upsert: true,
    });
    if (error) throw error;
    const { data } = client.storage.from(env.supabaseBucket).getPublicUrl(filename);
    // Remove the local copy now that it lives in object storage.
    fs.promises.unlink(abs).catch(() => undefined);
    return data.publicUrl;
  } catch (err) {
    console.error('[storage] Supabase upload failed, serving from local disk instead', err);
    return localUrl;
  }
}
