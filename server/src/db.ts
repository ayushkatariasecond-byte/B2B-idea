import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * True when an error is Prisma's unique-constraint violation (P2002).
 *
 * Used to turn a lost double-submit race into the same answer the caller would have got if
 * they'd been a moment slower. Every "check if it exists, then create it" pair in this
 * codebase has a window between the two statements: a rapid double-tap (or two devices)
 * can put both requests past the check before either inserts, and the loser then hit the
 * unique index and surfaced as a 500 "Internal server error". The database was always
 * right — exactly one row was created every time — but the user saw a crash for doing
 * something completely ordinary, like tapping Sign Up twice on a slow connection.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
