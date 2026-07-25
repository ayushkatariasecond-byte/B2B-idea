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

/**
 * True when an error means "the database could not be reached or would not accept us" —
 * as opposed to "the query was wrong", which is a bug in this codebase.
 *
 * Why this exists: a production outage where DATABASE_URL carried a password the server no
 * longer accepted. Prisma raised PrismaClientInitializationError on EVERY query, the generic
 * handler in index.ts turned each one into a bare 500 "Internal server error", and so every
 * single auth path — guest, login, signup — failed with a message that says nothing about
 * what broke. `/health` knew (it returns 503 `db: unreachable`), but nothing a user or the
 * app itself touched ever said "database". The whole system was down for one reason and
 * reported it as an unexplained crash.
 *
 * Distinguishing it is what lets the handler answer 503 (a real, retryable "we're down")
 * instead of 500 (a bug), which is both the honest status code and the one that tells an
 * operator where to look.
 *
 * Covers Prisma's connection-phase error class plus the P1xxx codes that specifically mean
 * infrastructure, not query text:
 *   P1000 authentication failed   P1001 can't reach server   P1002 connection timed out
 *   P1008 operation timed out     P1017 server closed the connection
 * Deliberately NOT P2xxx (constraint/validation) — those are this app's own mistakes and
 * must keep surfacing as 500s rather than being excused as an outage.
 */
export function isDatabaseUnavailableError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { name, code } = err as { name?: string; code?: string };
  if (name === 'PrismaClientInitializationError') return true;
  return ['P1000', 'P1001', 'P1002', 'P1008', 'P1017'].includes(code ?? '');
}
