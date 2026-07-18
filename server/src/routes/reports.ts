import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';

export const reportsRouter = Router();

const reportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'business']),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

reportsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });

  const report = await prisma.report.create({
    data: { reporterId: req.businessId!, targetType: parsed.data.targetType, targetId: parsed.data.targetId, reason: parsed.data.reason },
  });
  res.status(201).json({ report: { id: report.id, createdAt: report.createdAt } });
});
