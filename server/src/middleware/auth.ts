import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env';
import { prisma } from '../db';

export interface AuthedRequest extends Request {
  businessId?: string;
}

export function signToken(businessId: string): string {
  return jwt.sign({ sub: businessId }, env.jwtSecret, { expiresIn: '30d' });
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
    const business = await prisma.business.findUnique({ where: { id: payload.sub } });
    if (!business) return res.status(401).json({ error: 'Invalid token' });
    req.businessId = business.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
      const business = await prisma.business.findUnique({ where: { id: payload.sub } });
      if (business) req.businessId = business.id;
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}
