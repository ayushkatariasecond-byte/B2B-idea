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
    hidden: false,
    OR: [{ status: 'published' }, { status: 'scheduled', scheduledFor: { lte: new Date() } }],
  };
}

async function withStats(businessId: string, viewerId?: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return null;

  const [postCount, followerCount, followingCount, isFollowedByMe, services, industries] = await Promise.all([
    prisma.post.count({ where: { businessId, ...visibilityWhere() } }),
    prisma.follow.count({ where: { followeeId: businessId } }),
    prisma.follow.count({ where: { followerId: businessId } }),
    viewerId
      ? prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: businessId } } })
      : null,
    prisma.agencyService.findMany({ where: { agencyId: businessId }, include: { service: true } }),
    prisma.agencyIndustry.findMany({ where: { agencyId: businessId }, include: { industry: true } }),
  ]);

  return serializeBusiness(business, {
    postCount,
    followerCount,
    followingCount,
    isFollowedByMe: Boolean(isFollowedByMe),
    isMe: viewerId === businessId,
    services: services.map((s) => s.service),
    industries: industries.map((i) => i.industry),
  });
}

const DIRECTORY_PAGE_SIZE = 20;

/**
 * Public directory listing for the new agency-directory site (Phase 2). Sort is a
 * placeholder (verified-first, then newest) until the trust-score redesign discussed
 * separately replaces it with a real relevance/quality ranking.
 */
businessesRouter.get('/directory', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const serviceSlug = typeof req.query.service === 'string' ? req.query.service : undefined;
  const industrySlug = typeof req.query.industry === 'string' ? req.query.industry : undefined;
  const maxBudget = Number(req.query.maxBudget);

  const where: Record<string, unknown> = { suspended: false };
  if (q) where.OR = [{ name: { contains: q } }, { description: { contains: q } }];
  if (serviceSlug) where.services = { some: { service: { slug: serviceSlug } } };
  if (industrySlug) where.industries = { some: { industry: { slug: industrySlug } } };
  if (Number.isFinite(maxBudget)) {
    where.OR = [...(Array.isArray(where.OR) ? where.OR : []), { minProjectBudget: null }, { minProjectBudget: { lte: maxBudget } }];
  }

  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where,
      orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * DIRECTORY_PAGE_SIZE,
      take: DIRECTORY_PAGE_SIZE,
      include: { services: { include: { service: true } }, industries: { include: { industry: true } } },
    }),
    prisma.business.count({ where }),
  ]);

  res.json({
    agencies: businesses.map((b) => serializeBusiness(b, {
      services: b.services.map((s) => s.service),
      industries: b.industries.map((i) => i.industry),
    })),
    page,
    hasMore: page * DIRECTORY_PAGE_SIZE < total,
    total,
  });
});

/**
 * Every (service, industry) combination that currently has at least one matching
 * agency — drives the niche long-tail combo pages (/agencies/[service]/[industry])
 * and their appearance in the sitemap. Computed in-memory rather than a SQL GROUP BY
 * across the two join tables: at current and near-term scale (dozens to low
 * hundreds of agencies) this is simpler and plenty fast; revisit if that changes.
 */
businessesRouter.get('/directory/combos', async (_req, res) => {
  const businesses = await prisma.business.findMany({
    where: { suspended: false },
    select: {
      services: { select: { service: { select: { slug: true, name: true } } } },
      industries: { select: { industry: { select: { slug: true, name: true } } } },
    },
  });

  const seen = new Map<string, { serviceSlug: string; serviceName: string; industrySlug: string; industryName: string; count: number }>();
  for (const business of businesses) {
    for (const { service } of business.services) {
      for (const { industry } of business.industries) {
        const key = `${service.slug}::${industry.slug}`;
        const existing = seen.get(key);
        if (existing) existing.count += 1;
        else {
          seen.set(key, {
            serviceSlug: service.slug,
            serviceName: service.name,
            industrySlug: industry.slug,
            industryName: industry.name,
            count: 1,
          });
        }
      }
    }
  }

  res.json({ combos: Array.from(seen.values()) });
});

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
  description: z.string().max(4000).optional(),
  foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).nullable().optional(),
  teamSize: z.string().max(20).nullable().optional(),
  headquartersLocation: z.string().max(120).nullable().optional(),
  website: z.string().url().max(300).nullable().optional(),
  minProjectBudget: z.number().int().min(0).nullable().optional(),
  hourlyRateMin: z.number().int().min(0).nullable().optional(),
  hourlyRateMax: z.number().int().min(0).nullable().optional(),
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

// Decorate a list of businesses with follower counts and the viewer's follow state,
// so a follower/following list can render accurate Follow buttons.
async function decorateFollowList(businesses: { id: string }[], viewerId?: string) {
  const ids = businesses.map((b) => b.id);
  const [counts, myFollows] = await Promise.all([
    prisma.follow.groupBy({ by: ['followeeId'], where: { followeeId: { in: ids } }, _count: true }),
    viewerId
      ? prisma.follow.findMany({ where: { followerId: viewerId, followeeId: { in: ids } }, select: { followeeId: true } })
      : Promise.resolve([] as { followeeId: string }[]),
  ]);
  const countMap = new Map(counts.map((c) => [c.followeeId, c._count]));
  const followingSet = new Set(myFollows.map((f) => f.followeeId));
  return businesses.map((b) =>
    serializeBusiness(b as Parameters<typeof serializeBusiness>[0], {
      followerCount: countMap.get(b.id) ?? 0,
      isFollowedByMe: followingSet.has(b.id),
      isMe: viewerId === b.id,
    })
  );
}

businessesRouter.get('/:id/followers', optionalAuth, async (req: AuthedRequest, res) => {
  const follows = await prisma.follow.findMany({
    where: { followeeId: req.params.id },
    include: { follower: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ businesses: await decorateFollowList(follows.map((f) => f.follower), req.businessId) });
});

businessesRouter.get('/:id/following', optionalAuth, async (req: AuthedRequest, res) => {
  const follows = await prisma.follow.findMany({
    where: { followerId: req.params.id },
    include: { followee: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ businesses: await decorateFollowList(follows.map((f) => f.followee), req.businessId) });
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

// ── Directory profile: services, industries, case studies ─────────────────────────

const idListSchema = z.object({ ids: z.array(z.string().min(1)).max(50) });

businessesRouter.put('/me/services', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = idListSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ids must be an array of service ids' });

  await prisma.$transaction([
    prisma.agencyService.deleteMany({ where: { agencyId: req.businessId! } }),
    prisma.agencyService.createMany({
      data: parsed.data.ids.map((serviceId) => ({ agencyId: req.businessId!, serviceId })),
      skipDuplicates: true,
    }),
  ]);
  const services = await prisma.agencyService.findMany({
    where: { agencyId: req.businessId! },
    include: { service: true },
  });
  res.json({ services: services.map((s) => s.service) });
});

businessesRouter.put('/me/industries', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = idListSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ids must be an array of industry ids' });

  await prisma.$transaction([
    prisma.agencyIndustry.deleteMany({ where: { agencyId: req.businessId! } }),
    prisma.agencyIndustry.createMany({
      data: parsed.data.ids.map((industryId) => ({ agencyId: req.businessId!, industryId })),
      skipDuplicates: true,
    }),
  ]);
  const industries = await prisma.agencyIndustry.findMany({
    where: { agencyId: req.businessId! },
    include: { industry: true },
  });
  res.json({ industries: industries.map((i) => i.industry) });
});

businessesRouter.get('/:id/case-studies', optionalAuth, async (req: AuthedRequest, res) => {
  const isOwner = req.businessId === req.params.id;
  const caseStudies = await prisma.caseStudy.findMany({
    where: { agencyId: req.params.id, ...(isOwner ? {} : { status: 'published', hidden: false }) },
    orderBy: { createdAt: 'desc' },
    include: { media: { orderBy: { sortOrder: 'asc' } }, results: { orderBy: { sortOrder: 'asc' } } },
  });
  res.json({ caseStudies });
});
