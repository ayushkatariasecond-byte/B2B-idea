import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { signToken, requireAuth, AuthedRequest } from '../middleware/auth';
import { serializeBusiness } from '../utils/serialize';

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2).max(80),
  handle: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[a-z0-9_]+$/, 'Handle can only contain lowercase letters, numbers, and underscores'),
  category: z.string().min(2).max(60),
  bio: z.string().max(280).optional().default(''),
});

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { email, password, name, handle, category, bio } = parsed.data;

  const existingEmail = await prisma.business.findUnique({ where: { email } });
  if (existingEmail) return res.status(409).json({ error: 'An account with this email already exists' });

  const existingHandle = await prisma.business.findUnique({ where: { handle } });
  if (existingHandle) return res.status(409).json({ error: 'That handle is already taken' });

  const passwordHash = await bcrypt.hash(password, 10);
  const business = await prisma.business.create({
    data: { email, passwordHash, name, handle, category, bio },
  });

  const token = signToken(business.id, null);
  res.status(201).json({ token, business: serializeBusiness(business) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const { email, password } = parsed.data;

  const business = await prisma.business.findUnique({ where: { email } });
  if (business) {
    const ok = await bcrypt.compare(password, business.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = signToken(business.id, null);
    return res.json({ token, business: serializeBusiness(business) });
  }

  // Not the owner's email — check if it belongs to an invited team member instead.
  const member = await prisma.businessMember.findUnique({ where: { email } });
  if (!member) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, member.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const memberBusiness = await prisma.business.findUnique({ where: { id: member.businessId } });
  if (!memberBusiness) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken(memberBusiness.id, member.id);
  res.json({ token, business: serializeBusiness(memberBusiness), memberRole: member.role });
});

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const business = await prisma.business.findUnique({ where: { id: req.businessId! } });
  if (!business) return res.status(404).json({ error: 'Not found' });
  res.json({ business: serializeBusiness(business), isOwner: !req.memberId });
});
