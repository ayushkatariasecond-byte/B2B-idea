import { NextFunction, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { env } from '../env';

export const moderationRouter = Router();

async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const business = await prisma.business.findUnique({ where: { id: req.businessId! } });
  if (!business || business.email !== env.adminEmail) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function targetPreview(targetType: string, targetId: string) {
  if (targetType === 'post') {
    const post = await prisma.post.findUnique({ where: { id: targetId }, include: { business: true } });
    if (!post) return null;
    return {
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      hidden: post.hidden,
      business: { id: post.business.id, name: post.business.name, handle: post.business.handle },
    };
  }
  if (targetType === 'comment') {
    const comment = await prisma.comment.findUnique({ where: { id: targetId }, include: { business: true } });
    if (!comment) return null;
    return {
      text: comment.text,
      hidden: comment.hidden,
      business: { id: comment.business.id, name: comment.business.name, handle: comment.business.handle },
    };
  }
  if (targetType === 'business') {
    const business = await prisma.business.findUnique({ where: { id: targetId } });
    if (!business) return null;
    return { name: business.name, handle: business.handle, suspended: business.suspended };
  }
  return null;
}

moderationRouter.get('/reports', requireAuth, requireAdmin, async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'open';
  const reports = await prisma.report.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { reporter: { select: { id: true, name: true, handle: true } } },
  });
  const withPreview = await Promise.all(
    reports.map(async (r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
      reporter: r.reporter,
      target: await targetPreview(r.targetType, r.targetId),
    })),
  );
  res.json({ reports: withPreview });
});

const resolveSchema = z.object({ action: z.enum(['hide', 'dismiss', 'suspend_business']) });

moderationRouter.post('/reports/:id/resolve', requireAuth, requireAdmin, async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid action' });

  const report = await prisma.report.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: 'Report not found' });

  if (parsed.data.action === 'hide') {
    if (report.targetType === 'post') {
      await prisma.post.update({ where: { id: report.targetId }, data: { hidden: true } }).catch(() => undefined);
    } else if (report.targetType === 'comment') {
      await prisma.comment.update({ where: { id: report.targetId }, data: { hidden: true } }).catch(() => undefined);
    }
  } else if (parsed.data.action === 'suspend_business') {
    let businessId = report.targetId;
    if (report.targetType === 'post') {
      const post = await prisma.post.findUnique({ where: { id: report.targetId } });
      if (!post) return res.status(404).json({ error: 'Reported post no longer exists' });
      businessId = post.businessId;
    } else if (report.targetType === 'comment') {
      const comment = await prisma.comment.findUnique({ where: { id: report.targetId } });
      if (!comment) return res.status(404).json({ error: 'Reported comment no longer exists' });
      businessId = comment.businessId;
    }
    await prisma.business.update({ where: { id: businessId }, data: { suspended: true } });
    await prisma.post.updateMany({ where: { businessId }, data: { hidden: true } });
  }

  await prisma.report.update({
    where: { id: report.id },
    data: { status: parsed.data.action === 'dismiss' ? 'dismissed' : 'resolved' },
  });
  res.json({ ok: true });
});

const hideSchema = z.object({ hidden: z.boolean() });

moderationRouter.post('/posts/:id/hide', requireAuth, requireAdmin, async (req, res) => {
  const parsed = hideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'hidden must be a boolean' });
  const post = await prisma.post.update({ where: { id: req.params.id }, data: { hidden: parsed.data.hidden } }).catch(() => null);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ ok: true, hidden: post.hidden });
});

moderationRouter.post('/comments/:id/hide', requireAuth, requireAdmin, async (req, res) => {
  const parsed = hideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'hidden must be a boolean' });
  const comment = await prisma.comment
    .update({ where: { id: req.params.id }, data: { hidden: parsed.data.hidden } })
    .catch(() => null);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  res.json({ ok: true, hidden: comment.hidden });
});

const suspendSchema = z.object({ suspended: z.boolean() });

moderationRouter.post('/businesses/:id/suspend', requireAuth, requireAdmin, async (req, res) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'suspended must be a boolean' });
  const business = await prisma.business
    .update({ where: { id: req.params.id }, data: { suspended: parsed.data.suspended } })
    .catch(() => null);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  if (parsed.data.suspended) {
    await prisma.post.updateMany({ where: { businessId: business.id }, data: { hidden: true } });
  }
  res.json({ ok: true, suspended: business.suspended });
});
