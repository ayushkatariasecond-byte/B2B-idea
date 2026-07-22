import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env';
import { prisma } from '../db';

export interface AuthedRequest extends Request {
  businessId?: string;
  /** null when authenticated as the business owner; a BusinessMember id when authenticated as an invited teammate. */
  memberId?: string | null;
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
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Restricts an already-authenticated route to the business owner (rejects invited teammates). */
export function requireOwner(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.memberId) return res.status(403).json({ error: 'Only the account owner can do this' });
  next();
}

/** Restricts an already-authenticated route to the single account named by env.adminEmail. */
export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const business = await prisma.business.findUnique({ where: { id: req.businessId! } });
  if (!business || business.email !== env.adminEmail) {
    return res.status(403).json({ error: 'Admin access required' });
  }
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
