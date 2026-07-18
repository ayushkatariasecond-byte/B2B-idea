import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireOwner, optionalAuth, AuthedRequest } from '../middleware/auth';
import { serializeBusiness, serializePost } from '../utils/serialize';
import { upload } from '../upload';
import { notify } from '../utils/notifications';

export const businessesRouter = Router();

function visibilityWhere() {
  return {
    OR: [{ status: 'published' }, { status: 'scheduled', scheduledFor: { lte: new Date() } }],
  };
}

async function withStats(businessId: string, viewerId?: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return null;

  const [postCount, followerCount, followingCount, isFollowedByMe] = await Promise.all([
    prisma.post.count({ where: { businessId, ...visibilityWhere() } }),
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

businessesRouter.get('/search', optionalAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.json({ businesses: [] });
  const businesses = await prisma.business.findMany({
    where: { OR: [{ name: { contains: q } }, { handle: { contains: q } }] },
    take: 8,
  });
  res.json({ businesses: businesses.map((b) => serializeBusiness(b)) });
});

businessesRouter.get('/suggested', requireAuth, async (req: AuthedRequest, res) => {
  const [following, all] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: req.businessId! }, select: { followeeId: true } }),
    prisma.business.findMany({
      where: { id: { not: req.businessId! } },
      include: { _count: { select: { followers: true } } },
    }),
  ]);
  const followingIds = new Set(following.map((f) => f.followeeId));
  const suggestions = all
    .filter((b) => !followingIds.has(b.id))
    .sort((a, b) => b._count.followers - a._count.followers)
    .slice(0, 8)
    .map((b) => serializeBusiness(b, { followerCount: b._count.followers }));
  res.json({ businesses: suggestions });
});

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

const pushTokenSchema = z.object({ token: z.string().min(1).nullable() });

businessesRouter.post('/me/push-token', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A push token is required' });
  await prisma.business.update({ where: { id: req.businessId! }, data: { expoPushToken: parsed.data.token } });
  res.json({ ok: true });
});

businessesRouter.post('/me/request-verification', requireAuth, requireOwner, async (req: AuthedRequest, res) => {
  const business = await prisma.business.update({ where: { id: req.businessId! }, data: { verificationRequested: true } });
  res.json({ business: serializeBusiness(business) });
});

businessesRouter.get('/me/export', requireAuth, requireOwner, async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const [business, posts, comments, likes, following, followers, threads] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.post.findMany({ where: { businessId } }),
    prisma.comment.findMany({ where: { businessId } }),
    prisma.like.findMany({ where: { businessId } }),
    prisma.follow.findMany({ where: { followerId: businessId } }),
    prisma.follow.findMany({ where: { followeeId: businessId } }),
    prisma.thread.findMany({ where: { OR: [{ participantAId: businessId }, { participantBId: businessId }] }, include: { messages: true } }),
  ]);

  res.setHeader('Content-Disposition', 'attachment; filename="verve-data-export.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    business: business ? { ...business, passwordHash: undefined } : null,
    posts,
    comments,
    likes,
    following,
    followers,
    threads,
  });
});

businessesRouter.delete('/me', requireAuth, requireOwner, async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  await prisma.$transaction([
    prisma.like.deleteMany({ where: { businessId } }),
    prisma.comment.deleteMany({ where: { businessId } }),
    prisma.postView.deleteMany({ where: { viewerId: businessId } }),
    prisma.savedPost.deleteMany({ where: { businessId } }),
    prisma.follow.deleteMany({ where: { OR: [{ followerId: businessId }, { followeeId: businessId }] } }),
    prisma.block.deleteMany({ where: { OR: [{ blockerId: businessId }, { blockedId: businessId }] } }),
    prisma.notification.deleteMany({ where: { OR: [{ recipientId: businessId }, { actorId: businessId }] } }),
    prisma.businessMember.deleteMany({ where: { businessId } }),
    prisma.message.deleteMany({ where: { senderId: businessId } }),
    prisma.postHashtag.deleteMany({ where: { post: { businessId } } }),
    prisma.post.deleteMany({ where: { businessId } }),
    prisma.business.delete({ where: { id: businessId } }),
  ]);
  res.json({ ok: true });
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
    void notify({ recipientId: followeeId, actorId: followerId, type: 'follow' });
  }

  const followerCount = await prisma.follow.count({ where: { followeeId } });
  res.json({ following: !existing, followerCount });
});

businessesRouter.post('/:id/block', requireAuth, async (req: AuthedRequest, res) => {
  const blockedId = req.params.id;
  const blockerId = req.businessId!;
  if (blockedId === blockerId) return res.status(400).json({ error: "You can't block your own page" });

  const target = await prisma.business.findUnique({ where: { id: blockedId } });
  if (!target) return res.status(404).json({ error: 'Business not found' });

  const existing = await prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId, blockedId } } });
  if (existing) {
    await prisma.block.delete({ where: { id: existing.id } });
  } else {
    await prisma.block.create({ data: { blockerId, blockedId } });
    await Promise.all([
      prisma.follow.deleteMany({ where: { followerId: blockerId, followeeId: blockedId } }),
      prisma.follow.deleteMany({ where: { followerId: blockedId, followeeId: blockerId } }),
    ]);
  }
  res.json({ blocked: !existing });
});

businessesRouter.get('/:id/posts', optionalAuth, async (req: AuthedRequest, res) => {
  const posts = await prisma.post.findMany({
    where: { businessId: req.params.id, ...visibilityWhere() },
    orderBy: { createdAt: 'desc' },
    include: {
      business: true,
      _count: { select: { likes: true, comments: true } },
      likes: req.businessId ? { where: { businessId: req.businessId }, select: { id: true } } : false,
      savedBy: req.businessId ? { where: { businessId: req.businessId }, select: { id: true } } : false,
    },
  });
  res.json({ posts: posts.map(serializePost) });
});
