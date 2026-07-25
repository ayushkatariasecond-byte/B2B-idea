import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env';
import { prisma } from '../db';

/**
 * The single shared account behind "Continue as guest". Every visitor who taps it is handed
 * a token for THIS one row — they are not separate accounts.
 */
export const GUEST_EMAIL = 'guest@verve.demo';

export interface AuthedRequest extends Request {
  businessId?: string;
  /** null when authenticated as the business owner; a BusinessMember id when authenticated as an invited teammate. */
  memberId?: string | null;
  /** True when this token belongs to the shared guest account (see GUEST_EMAIL). */
  isGuest?: boolean;
}

export function signToken(businessId: string, memberId: string | null = null): string {
  return jwt.sign({ sub: businessId, mid: memberId }, env.jwtSecret, { expiresIn: '30d' });
}

interface TokenPayload {
  sub: string;
  mid?: string | null;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    const business = await prisma.business.findUnique({ where: { id: payload.sub } });
    if (!business) return res.status(401).json({ error: 'Invalid token' });
    if (business.suspended) return res.status(403).json({ error: 'This account has been suspended' });
    req.businessId = business.id;
    req.memberId = payload.mid ?? null;
    req.isGuest = business.email === GUEST_EMAIL;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Restricts a route to restaurant accounts.
 *
 * Nibbler is restaurant-only for publishing: viewers and guests browse, restaurants post.
 * The compose button is already hidden for them in the app, but that is presentation, not
 * enforcement — POST /posts accepted a viewer's token and created the row (verified: HTTP
 * 201 with a persisted Post). Anything holding a valid token could publish into the feed.
 *
 * Deliberately mounted BEFORE the upload middleware on the routes that use it, so a
 * rejected caller never causes multer to write their file to disk in the first place.
 */
export async function requireRestaurant(req: AuthedRequest, res: Response, next: NextFunction) {
  const business = await prisma.business.findUnique({
    where: { id: req.businessId! },
    select: { isRestaurant: true },
  });
  if (!business?.isRestaurant) {
    return res.status(403).json({ error: 'Only restaurant accounts can post' });
  }
  next();
}

/**
 * Blocks the shared guest identity from account-management operations.
 *
 * `requireOwner` is not enough on its own here: a guest token carries `mid: null`, so it IS
 * the "owner" of the guest account as far as that check is concerned. Combined with the
 * account being shared by every visitor, that meant anyone who tapped "Continue as guest"
 * held owner rights over an account full of other visitors' activity — verified directly:
 * one guest session could rename the shared profile, export another guest's data export
 * (threads and private messages included), and delete the account outright, taking every
 * guest's posts and comments with it.
 *
 * Scoped deliberately to operations that manage the account itself rather than to all
 * writes. Whether a guest should be able to post or comment at all is a product call, not a
 * security one, and is left exactly as it was.
 */
export function rejectGuest(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.isGuest) {
    return res.status(403).json({ error: 'Create a free account to do this.' });
  }
  next();
}

/** Restricts an already-authenticated route to the business owner (rejects invited teammates). */
export function requireOwner(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.memberId) return res.status(403).json({ error: 'Only the account owner can do this' });
  next();
}

export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
      const business = await prisma.business.findUnique({ where: { id: payload.sub } });
      if (business && !business.suspended) {
        req.businessId = business.id;
        req.memberId = payload.mid ?? null;
      }
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}
