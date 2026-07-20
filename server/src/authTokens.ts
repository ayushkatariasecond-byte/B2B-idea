import jwt from 'jsonwebtoken';
import { env } from './env';

/**
 * Stateless, single-use-ish tokens for password reset and email verification — no schema
 * or table needed.
 *
 * Reset tokens are signed with `jwtSecret + current passwordHash`. Because the hash is part
 * of the signing key, a reset link stops verifying the instant the password changes, so a
 * used (or leaked-then-used) link can't be replayed. Short 1h expiry on top.
 */
export function makeResetToken(businessId: string, passwordHash: string): string {
  return jwt.sign({ purpose: 'reset' }, env.jwtSecret + passwordHash, { subject: businessId, expiresIn: '1h' });
}

export function readResetSubject(token: string): string | null {
  // Decode (no verify) just to learn which account this is for; the caller then verifies
  // against that account's current passwordHash.
  const decoded = jwt.decode(token) as { sub?: string } | null;
  return decoded?.sub ?? null;
}

export function verifyResetToken(token: string, passwordHash: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret + passwordHash) as { sub?: string; purpose?: string };
    if (payload.purpose !== 'reset' || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function makeVerifyToken(businessId: string): string {
  return jwt.sign({ purpose: 'verify' }, env.jwtSecret, { subject: businessId, expiresIn: '7d' });
}

export function verifyVerifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub?: string; purpose?: string };
    if (payload.purpose !== 'verify' || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
