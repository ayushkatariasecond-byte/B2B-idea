import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { emailSchema } from '../utils/email';

export const buyersRouter = Router();

const upsertSchema = z.object({
  email: emailSchema,
  name: z.string().max(80).optional(),
});

// No password, no session — buyer identity here is intentionally lightweight (see the
// Phase 1 migration notes on why a real login isn't built yet).
buyersRouter.post('/', async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });

  const buyer = await prisma.buyer.upsert({
    where: { email: parsed.data.email },
    update: parsed.data.name ? { name: parsed.data.name } : {},
    create: { email: parsed.data.email, name: parsed.data.name },
  });
  res.status(201).json({ buyer });
});

buyersRouter.get('/:id', async (req, res) => {
  const buyer = await prisma.buyer.findUnique({ where: { id: req.params.id } });
  if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
  res.json({ buyer });
});
