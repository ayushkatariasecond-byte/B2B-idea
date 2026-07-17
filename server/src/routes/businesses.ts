import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, optionalAuth, AuthedRequest } from '../middleware/auth';
import { serializeBusiness, serializePost } from '../utils/serialize';
import { upload } from '../upload';

export const businessesRouter = Router();

async function withStats(businessId: string, viewerId?: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return null;

  const [postCount, followerCount, followingCount, isFollowedByMe] = await Promise.all([
    prisma.post.count({ where: { businessId } }),
    prisma.follow.count({ where: { followeeId: businessId } }),
    prisma.follow.count({ where: { followerId: businessId } }),
    viewerId
      ? prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: businessId } } })
      : null,
  ]);

  return serializeBusiness(business, {
    postCount,
    followerCount,
    followingCount,
    isFollowedByMe: Boolean(isFollowedByMe),
    isMe: viewerId === businessId,
  });
}

businessesRouter.get('/:id', optionalAuth, async (req: AuthedRequest, res) => {
  const result = await withStats(req.params.id, req.businessId);
  if (!result) return res.status(404).json({ error: 'Business not found' });
  res.json({ business: result });
});

businessesRouter.get('/handle/:handle', optionalAuth, async (req: AuthedRequest, res) => {
  const business = await prisma.business.findUnique({ where: { handle: req.params.handle } });
  if (!business) return res.status(404).json({ error: 'Business not found' });
  const result = await withStats(business.id, req.businessId);
  res.json({ business: result });
});

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  category: z.string().min(2).max(60).optional(),
  bio: z.string().max(280).optional(),
});

businessesRouter.patch('/me', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });

  const business = await prisma.business.update({ where: { id: req.businessId! }, data: parsed.data });
  res.json({ business: serializeBusiness(business) });
});

businessesRouter.post('/me/avatar', requireAuth, upload.single('media'), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const avatarUrl = `/uploads/${req.file.filename}`;
  const business = await prisma.business.update({ where: { id: req.businessId! }, data: { avatarUrl } });
  res.json({ business: serializeBusiness(business) });
});

businessesRouter.post('/me/cover', requireAuth, upload.single('media'), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const coverUrl = `/uploads/${req.file.filename}`;
  const business = await prisma.business.update({ where: { id: req.businessId! }, data: { coverUrl } });
  res.json({ business: serializeBusiness(business) });
});

businessesRouter.post('/:id/follow', requireAuth, async (req: AuthedRequest, res) => {
  const followeeId = req.params.id;
  const followerId = req.businessId!;
  if (followeeId === followerId) return res.status(400).json({ error: "You can't follow your own page" });

  const followee = await prisma.business.findUnique({ where: { id: followeeId } });
  if (!followee) return res.status(404).json({ error: 'Business not found' });

  const existing = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId, followeeId } },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
  } else {
    await prisma.follow.create({ data: { followerId, followeeId } });
  }

  const followerCount = await prisma.follow.count({ where: { followeeId } });
  res.json({ following: !existing, followerCount });
});

businessesRouter.get('/:id/posts', optionalAuth, async (req: AuthedRequest, res) => {
  const posts = await prisma.post.findMany({
    where: { businessId: req.params.id },
    orderBy: { createdAt: 'desc' },
    include: {
      business: true,
      _count: { select: { likes: true, comments: true } },
      likes: req.businessId ? { where: { businessId: req.businessId }, select: { id: true } } : false,
    },
  });
  res.json({ posts: posts.map(serializePost) });
});
