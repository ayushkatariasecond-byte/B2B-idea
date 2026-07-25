import { z } from 'zod';

/**
 * Text-field validation shared by every user-supplied string.
 *
 * WHY: PostgreSQL `text` cannot store a NUL byte (U+0000) — the driver rejects it with
 * `invalid byte sequence for encoding "UTF8": 0x00`. Nothing in the stack caught that, so a
 * caption, comment, bio, or display name containing a NUL reached the database and came
 * back as a 500 "Internal server error". Confirmed on captions, comment text, bios and
 * signup names. It arrives more often than it sounds: paste from a binary-ish source, a
 * buggy client, or a truncated clipboard payload will all carry one.
 *
 * A NUL is never meaningful in any of these fields, so it's a 400 (the caller sent
 * something invalid), not a 500 (we broke). Only NUL is rejected — other control characters
 * are legal UTF-8, Postgres stores them fine, and filtering them would start quietly
 * mangling legitimate text like emoji sequences and right-to-left marks.
 */
export const NUL = '\u0000';

export function containsNul(value: string): boolean {
  return value.includes(NUL);
}

const NO_NUL_MESSAGE = 'Text contains an invalid character';

/** `z.string()` that also rejects NUL. Use in place of z.string() for any stored text. */
export function safeText(): z.ZodString {
  // .refine() would return a ZodEffects, which can't chain .min()/.max()/.regex() the way
  // every call site expects — so this stays a ZodString and uses a superRefine-free
  // approach via the built-in regex check.
  return z.string().regex(/^[^\u0000]*$/, NO_NUL_MESSAGE);
}

/** True if any string anywhere in a parsed JSON value contains a NUL. */
function hasNulDeep(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (typeof value === 'string') return containsNul(value);
  if (Array.isArray(value)) return value.some((v) => hasNulDeep(v, depth + 1));
  if (value && typeof value === 'object') return Object.values(value).some((v) => hasNulDeep(v, depth + 1));
  return false;
}

/**
 * Rejects any JSON request body carrying a NUL, before it can reach a query.
 *
 * Mounted once rather than bolted onto each schema so new routes are covered by default —
 * the failure mode this prevents (a 500 straight from the database driver) is easy to
 * reintroduce one field at a time. Multipart text fields are parsed by multer *after* this
 * runs, so those are additionally covered at the schema level via safeText().
 */
export function rejectNulBodies(
  req: { body?: unknown },
  res: { status: (c: number) => { json: (b: unknown) => unknown } },
  next: (err?: unknown) => void
): void {
  if (req.body !== undefined && hasNulDeep(req.body)) {
    res.status(400).json({ error: NO_NUL_MESSAGE });
    return;
  }
  next();
}
