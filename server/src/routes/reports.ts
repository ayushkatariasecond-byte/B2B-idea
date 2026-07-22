import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { AUTO_HIDE_REPORT_THRESHOLD } from '../utils/moderation';

export const reportsRouter = Router();

const reportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'business']),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

reportsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  const { targetType, targetId, reason } = parsed.data;

  const report = await prisma.report.create({
    data: { reporterId: req.businessId!, targetType, targetId, reason },
  });

  // Auto-hide pending review once enough distinct people have flagged the same thing —
  // keeps obviously-bad content off the feed immediately instead of waiting on an admin
  // to notice. Admin can always reverse this via the moderation endpoints.
  if (targetType === 'post' || targetType === 'comment') {
    const distinctReporters = await prisma.report.findMany({
      where: { targetType, targetId },
      distinct: ['reporterId'],
      select: { reporterId: true },
    });
    if (distinctReporters.length >= AUTO_HIDE_REPORT_THRESHOLD) {
      if (targetType === 'post') {
        await prisma.post.update({ where: { id: targetId }, data: { hidden: true } }).catch(() => undefined);
      } else {
        await prisma.comment.update({ where: { id: targetId }, data: { hidden: true } }).catch(() => undefined);
      }
    }
  }

  res.status(201).json({ report: { id: report.id, createdAt: report.createdAt } });
});
