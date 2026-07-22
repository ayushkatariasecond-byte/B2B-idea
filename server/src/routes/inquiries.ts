import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { emailSchema } from '../utils/email';
import { sendNewInquiryEmail } from '../email';
import { containsBlockedContent } from '../utils/moderation';

export const inquiriesRouter = Router();

const createSchema = z.object({
  agencyId: z.string().min(1),
  name: z.string().min(1).max(120),
  email: emailSchema,
  company: z.string().max(120).optional(),
  message: z.string().min(1).max(4000),
  budget: z.string().max(80).optional(),
});

// Public — buyers are anonymous by default (see Phase 1 notes), so this takes no auth.
inquiriesRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  if (containsBlockedContent(parsed.data.message)) {
    return res.status(400).json({ error: 'This message violates our content guidelines' });
  }

  const agency = await prisma.business.findUnique({ where: { id: parsed.data.agencyId } });
  if (!agency || agency.suspended) return res.status(404).json({ error: 'Agency not found' });

  // Buyer accounts are implicit — submitting an inquiry is enough to create one, so inquiry
  // history accumulates under one identity even if the buyer never explicitly signs up.
  const buyer = await prisma.buyer.upsert({
    where: { email: parsed.data.email },
    update: parsed.data.name ? { name: parsed.data.name } : {},
    create: { email: parsed.data.email, name: parsed.data.name },
  });

  const inquiry = await prisma.inquiry.create({
    data: {
      agencyId: parsed.data.agencyId,
      buyerId: buyer.id,
      name: parsed.data.name,
      email: parsed.data.email,
      company: parsed.data.company,
      message: parsed.data.message,
      budget: parsed.data.budget,
    },
  });

  await prisma.notification.create({
    data: { recipientId: agency.id, type: 'inquiry' },
  }).catch(() => undefined); // best-effort, matches the existing notify() utility's own failure handling

  void sendNewInquiryEmail({
    to: agency.email,
    buyerName: parsed.data.name,
    buyerCompany: parsed.data.company,
    message: parsed.data.message,
  });

  res.status(201).json({ inquiry });
});

inquiriesRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const inquiries = await prisma.inquiry.findMany({
    where: { agencyId: req.businessId!, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { buyer: true },
  });
  res.json({ inquiries });
});

const updateSchema = z.object({ status: z.enum(['new', 'contacted', 'closed']) });

inquiriesRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await prisma.inquiry.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.agencyId !== req.businessId) return res.status(404).json({ error: 'Inquiry not found' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid status' });

  const inquiry = await prisma.inquiry.update({ where: { id: existing.id }, data: { status: parsed.data.status } });
  res.json({ inquiry });
});
