import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireOwner, AuthedRequest } from '../middleware/auth';
import { sendTeamInviteEmail } from '../email';

export const membersRouter = Router();

membersRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const members = await prisma.businessMember.findMany({
    where: { businessId: req.businessId! },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ members: members.map((m) => ({ id: m.id, email: m.email, role: m.role, createdAt: m.createdAt })) });
});

const inviteSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['editor']).optional().default('editor'),
});

membersRouter.post('/', requireAuth, requireOwner, async (req: AuthedRequest, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  const { email, password, role } = parsed.data;

  const existingBusiness = await prisma.business.findUnique({ where: { email } });
  if (existingBusiness) return res.status(409).json({ error: 'That email is already registered' });
  const existingMember = await prisma.businessMember.findUnique({ where: { email } });
  if (existingMember) return res.status(409).json({ error: 'That email is already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const member = await prisma.businessMember.create({
    data: { businessId: req.businessId!, email, passwordHash, role },
  });

  const business = await prisma.business.findUnique({ where: { id: req.businessId! }, select: { name: true } });
  void sendTeamInviteEmail({ to: email, tempPassword: password, teamName: business?.name ?? 'a business' });

  res.status(201).json({ member: { id: member.id, email: member.email, role: member.role, createdAt: member.createdAt } });
});

membersRouter.delete('/:id', requireAuth, requireOwner, async (req: AuthedRequest, res) => {
  const member = await prisma.businessMember.findUnique({ where: { id: req.params.id } });
  if (!member || member.businessId !== req.businessId) return res.status(404).json({ error: 'Team member not found' });
  await prisma.businessMember.delete({ where: { id: member.id } });
  res.json({ ok: true });
});
