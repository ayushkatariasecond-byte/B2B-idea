import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, optionalAuth, AuthedRequest } from '../middleware/auth';
import { serializePost } from '../utils/serialize';
import { upload, mediaTypeFromMime, verifyUploadedMedia } from '../upload';
import { extractHashtags } from '../utils/hashtags';
import { getExcludedBusinessIds } from '../utils/blocking';
import { notify } from '../utils/notifications';
import { transcodeVideo } from '../utils/videoTranscode';
import { persistUpload } from '../storage';
import { recencyBoost, velocityBoost, explorationJitter, currentHourBucket, diversify } from '../utils/ranking';
import { containsBlockedContent } from '../utils/moderation';
import { logger } from '../utils/logger';
import { boundingBox, hasCoords, matchesLocation, DEFAULT_RADIUS_MILES } from '../utils/geo';

export const postsRouter = Router();

const postInclude = (viewerId?: string) => ({
  business: true,
  _count: { select: { likes: true, comments: true } },
  likes: viewerId ? { where: { businessId: viewerId }, select: { id: true } } : false,
  savedBy: viewerId ? { where: { businessId: viewerId }, select: { id: true } } : false,
});

const PAGE_SIZE = 20;

/** Only posts that are actually live: published (or due-scheduled), and not moderated away. */
function visibilityWhere() {
  return {
    hidden: false,
    OR: [{ status: 'published' }, { status: 'scheduled', scheduledFor: { lte: new Date() } }],
  };
}

async function linkHashtags(postId: string, caption: string) {
  const tags = extractHashtags(caption);
  for (const tag of tags) {
    const hashtag = await prisma.hashtag.upsert({ where: { tag }, update: {}, create: { tag } });
    await prisma.postHashtag.upsert({
      where: { postId_hashtagId: { postId, hashtagId: hashtag.id } },
      update: {},
      create: { postId, hashtagId: hashtag.id },
    });
  }
}

postsRouter.get('/feed', optionalAuth, async (req: AuthedRequest, res) => {
  const tab = req.query.tab === 'following' ? 'following' : 'forYou';
  const page = Math.max(1, Number(req.query.page) || 1);
  const excluded = await getExcludedBusinessIds(req.businessId);

  if (tab === 'following') {
    if (!req.businessId) return res.status(401).json({ error: 'Login required for the Following feed' });
    const followed = await prisma.follow.findMany({ where: { followerId: req.businessId }, select: { followeeId: true } });
    const followeeIds = followed.map((f) => f.followeeId).filter((id) => !excluded.includes(id));
    if (followeeIds.length === 0) return res.json({ posts: [], page, hasMore: false });

    const posts = await prisma.post.findMany({
      where: { businessId: { in: followeeIds }, ...visibilityWhere() },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: postInclude(req.businessId),
    });
    return res.json({ posts: posts.map(serializePost), page, hasMore: posts.length === PAGE_SIZE });
  }

  // Nibbler: the location lock is a hard, non-negotiable pre-filter — a post from outside
  // the viewer's area must never reach the scoring below. Requires a known viewer (their
  // location), so — same as the Following tab just above — an anonymous request is
  // rejected rather than served an unscoped feed.
  //
  // This used to be a single exact city-string equality in the WHERE clause. It is now a
  // real distance radius (see utils/geo.ts) whenever the viewer AND the restaurant both
  // have coordinates, falling back to that same city-string equality when either side
  // doesn't — so users who declined the location permission, pre-existing accounts, and
  // the seeded demo data all keep working exactly as before.
  //
  // The hard-filter guarantee is preserved, just in two stages instead of one: SQL narrows
  // by an indexable lat/long bounding box (or by city, for the fallback group), and the
  // exact circle test then runs over that candidate set. The box is strictly LARGER than
  // the circle it contains, so stage two only ever removes rows stage one let through —
  // it can never add one back. Nothing out of range can survive both stages, and nothing
  // in range is dropped by the prefilter.
  if (!req.businessId) return res.status(401).json({ error: 'Login required to see your city’s feed' });
  const viewer = await prisma.business.findUnique({
    where: { id: req.businessId },
    select: { city: true, latitude: true, longitude: true },
  });
  const viewerCity = viewer?.city ?? '';
  const viewerHasCoords = hasCoords(viewer);

  const cuisineSlug = typeof req.query.cuisine === 'string' ? req.query.cuisine.slice(0, 50) : undefined;
  let cuisineId: string | undefined;
  if (cuisineSlug) {
    const cuisine = await prisma.cuisine.findUnique({ where: { slug: cuisineSlug } });
    if (!cuisine) return res.status(400).json({ error: 'Unknown cuisine type' });
    cuisineId = cuisine.id;
  }

  // Stage one. A viewer with coordinates gets the bounding box OR'd with an exact city
  // match, because the restaurants they should see are of two kinds: geolocated ones
  // (matched by distance) and city-only ones that never captured coordinates (matched by
  // city, as before). A viewer without coordinates can only ever match on city.
  const locationWhere = viewerHasCoords
    ? (() => {
        const box = boundingBox(viewer as { latitude: number; longitude: number }, DEFAULT_RADIUS_MILES);
        return {
          OR: [
            {
              latitude: { gte: box.minLat, lte: box.maxLat },
              longitude: { gte: box.minLon, lte: box.maxLon },
            },
            { city: viewerCity, latitude: null },
          ],
        };
      })()
    : { city: viewerCity };

  // For You: a bounded candidate pool (still recency-ordered so we don't do a full
  // table scan), then re-ranked by a real `finalScore` — see utils/ranking.ts for the
  // rationale behind each term. Personalization (follow/top-tag boosts) only applies
  // when the viewer is authenticated; anonymous viewers get the same ranking minus
  // those two terms, same as how the Following tab already gates on req.businessId.
  const candidates = await prisma.post.findMany({
    where: {
      ...visibilityWhere(),
      businessId: { notIn: excluded },
      business: { isRestaurant: true, ...locationWhere, ...(cuisineId ? { cuisineId } : {}) },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: postInclude(req.businessId),
  });

  // Stage two: exact circle test, discarding the bounding box's corner overshoot. A no-op
  // for the city-fallback group (matchesLocation returns their city comparison unchanged).
  const all = candidates.filter((post) =>
    matchesLocation(
      { city: viewerCity, latitude: viewer?.latitude, longitude: viewer?.longitude },
      post.business,
      DEFAULT_RADIUS_MILES
    )
  );

  // Structured logging around the location lock specifically — per the hardening pass,
  // this is the core untested-in-production logic (everything else here is either
  // read-only browsing or protected by auth). One extra lightweight COUNT alongside the
  // real query, so each log line shows not just "how many posts this viewer got" but the
  // filter's actual impact: how many eligible restaurant posts exist platform-wide vs.
  // how many were actually near this viewer. `boxRejectedCount` isolates how much of the
  // narrowing came from the exact distance test rather than the SQL prefilter.
  const totalEligiblePlatformWide = await prisma.post.count({
    where: { ...visibilityWhere(), businessId: { notIn: excluded }, business: { isRestaurant: true } },
  });
  logger.info('feed.city_lock', {
    viewerId: req.businessId,
    viewerCity,
    viewerHasCoords,
    matchMode: viewerHasCoords ? 'radius' : 'city',
    radiusMiles: viewerHasCoords ? DEFAULT_RADIUS_MILES : null,
    cuisineFilter: cuisineSlug ?? null,
    matchedCount: all.length,
    boxRejectedCount: candidates.length - all.length,
    mismatchCount: totalEligiblePlatformWide - all.length,
    totalEligiblePlatformWide,
  });

  if (all.length === 0) {
    return res.json({ posts: [], page, hasMore: false, city: viewerCity });
  }

  // Personalization signals — both are skipped entirely (left as empty/undefined) for
  // anonymous requests, matching the optionalAuth pattern used throughout this route.
  let followedIds: Set<string> = new Set();
  let topTag: string | undefined;
  if (req.businessId) {
    const followed = await prisma.follow.findMany({ where: { followerId: req.businessId }, select: { followeeId: true } });
    followedIds = new Set(followed.map((f) => f.followeeId));

    // Cheap approximation of "what does this viewer like": their most recent 200 likes,
    // grouped by the liked post's tag in JS. Bounded take() avoids an unbounded
    // full-table aggregate; 200 is plenty to find a viewer's dominant interest.
    const recentLikes = await prisma.like.findMany({
      where: { businessId: req.businessId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { post: { select: { tag: true } } },
    });
    if (recentLikes.length > 0) {
      const tagCounts = new Map<string, number>();
      for (const like of recentLikes) {
        tagCounts.set(like.post.tag, (tagCounts.get(like.post.tag) ?? 0) + 1);
      }
      let bestTag: string | undefined;
      let bestCount = 0;
      for (const [tag, count] of tagCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestTag = tag;
        }
      }
      topTag = bestTag;
    }
  }

  const now = Date.now();
  const hourBucket = currentHourBucket(now);
  const ranked = all.map((post) => {
    const serialized = serializePost(post);
    const ageHours = (now - post.createdAt.getTime()) / (1000 * 60 * 60);

    let personalization = 0;
    if (req.businessId) {
      if (followedIds.has(post.businessId)) personalization += 15;
      if (topTag && post.tag === topTag) personalization += 8;
    }

    const finalScore =
      serialized.score +
      recencyBoost(ageHours) +
      velocityBoost(serialized.likeCount, serialized.commentCount, serialized.shareCount, ageHours) +
      personalization +
      explorationJitter(req.businessId, post.id, hourBucket);

    return { ...serialized, finalScore };
  });

  ranked.sort((a, b) => b.finalScore - a.finalScore || (b.createdAt > a.createdAt ? 1 : -1));
  const diversified = diversify(ranked, 3, PAGE_SIZE);
  const pageItems = diversified.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ finalScore, ...post }) => post);
  res.json({ posts: pageItems, page, hasMore: page * PAGE_SIZE < diversified.length, city: viewerCity });
});

postsRouter.get('/discover', optionalAuth, async (req: AuthedRequest, res) => {
  // Each capped defensively — none of these have any legitimate reason to be long, and an
  // unbounded value sitting in a `contains`/equality filter is needless attack surface.
  const tag =
    typeof req.query.tag === 'string' && req.query.tag !== 'Trending' ? req.query.tag.slice(0, 40) : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const hashtag =
    typeof req.query.hashtag === 'string' ? req.query.hashtag.toLowerCase().replace(/^#/, '').slice(0, 100) : undefined;
  const excluded = await getExcludedBusinessIds(req.businessId);

  const where: Record<string, unknown> = { ...visibilityWhere(), businessId: { notIn: excluded } };
  if (tag) where.tag = tag;
  if (hashtag) where.hashtags = { some: { hashtag: { tag: hashtag } } };
  if (q) {
    where.OR = [
      { caption: { contains: q } },
      { tag: { contains: q } },
      { business: { name: { contains: q } } },
      { business: { handle: { contains: q } } },
    ];
  }

  const all = await prisma.post.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: postInclude(req.businessId),
  });
  const serialized = all.map(serializePost).sort((a, b) => b.score - a.score || (b.createdAt > a.createdAt ? 1 : -1));
  res.json({ posts: serialized });
});

postsRouter.get('/trending-tags', async (_req, res) => {
  const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const tags = await prisma.hashtag.findMany({
    include: { _count: { select: { posts: true } }, posts: { where: { post: { createdAt: { gte: recent } } }, select: { id: true } } },
  });
  const ranked = tags
    .map((t) => ({ tag: t.tag, count: t.posts.length }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  res.json({ tags: ranked });
});

postsRouter.get('/mine/drafts', requireAuth, async (req: AuthedRequest, res) => {
  const posts = await prisma.post.findMany({
    where: { businessId: req.businessId!, status: { in: ['draft', 'scheduled'] } },
    orderBy: { createdAt: 'desc' },
    include: postInclude(req.businessId),
  });
  res.json({ posts: posts.map(serializePost) });
});

postsRouter.get('/saved', requireAuth, async (req: AuthedRequest, res) => {
  const saved = await prisma.savedPost.findMany({
    where: { businessId: req.businessId! },
    orderBy: { createdAt: 'desc' },
    include: { post: { include: postInclude(req.businessId!) } },
  });
  res.json({ posts: saved.map((s) => serializePost(s.post)) });
});

postsRouter.post('/:id/save', requireAuth, async (req: AuthedRequest, res) => {
  const postId = req.params.id;
  const businessId = req.businessId!;
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const existing = await prisma.savedPost.findUnique({ where: { businessId_postId: { businessId, postId } } });
  if (existing) {
    await prisma.savedPost.delete({ where: { id: existing.id } });
  } else {
    await prisma.savedPost.create({ data: { businessId, postId } });
  }
  res.json({ saved: !existing });
});

postsRouter.get('/:id', optionalAuth, async (req: AuthedRequest, res) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    include: postInclude(req.businessId),
  });
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // Only the author may fetch a post that isn't live yet. Previously this checked `hidden`
  // but not `status`, so a draft or a not-yet-due scheduled post — an unannounced menu
  // change, a promo timed to a specific hour — was readable by anyone holding its id, even
  // though the feed, discover, and profile listings all correctly hide it via
  // visibilityWhere(). 404 rather than 403 so this endpoint doesn't confirm that an id
  // exists to someone who isn't allowed to see it.
  const isLive = !post.hidden && (post.status === 'published' || (post.status === 'scheduled' && post.scheduledFor !== null && post.scheduledFor <= new Date()));
  if (!isLive && post.businessId !== req.businessId) {
    return res.status(404).json({ error: 'Post not found' });
  }
  res.json({ post: serializePost(post) });
});

const createSchema = z
  .object({
    caption: z.string().max(2200).default(''),
    tag: z.string().min(1).max(40),
    status: z.enum(['draft', 'scheduled', 'published']).optional().default('published'),
    scheduledFor: z.string().datetime().optional(),
  })
  .refine((data) => data.status !== 'scheduled' || Boolean(data.scheduledFor), {
    message: 'scheduledFor is required when status is "scheduled"',
    path: ['scheduledFor'],
  });

const postUpload = upload.fields([
  { name: 'media', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

postsRouter.post('/', requireAuth, postUpload, verifyUploadedMedia, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  if (containsBlockedContent(parsed.data.caption)) {
    return res.status(400).json({ error: 'This caption violates our content guidelines' });
  }

  const files = req.files as { media?: Express.Multer.File[]; thumbnail?: Express.Multer.File[] } | undefined;
  const mediaFile = files?.media?.[0];
  const thumbnailFile = files?.thumbnail?.[0];
  if (!mediaFile) return res.status(400).json({ error: 'A photo or video is required' });

  const mediaType = mediaTypeFromMime(mediaFile.mimetype);
  let mediaFilename = mediaFile.filename;
  if (mediaType === 'video') {
    try {
      mediaFilename = await transcodeVideo(mediaFile.filename);
    } catch {
      // Transcoding is a nice-to-have — fall back to the original upload rather than blocking the post.
    }
  }

  const [mediaUrl, thumbnailUrl] = await Promise.all([
    persistUpload(mediaFilename),
    thumbnailFile ? persistUpload(thumbnailFile.filename) : Promise.resolve(null),
  ]);

  const post = await prisma.post.create({
    data: {
      businessId: req.businessId!,
      mediaUrl,
      mediaType,
      thumbnailUrl,
      caption: parsed.data.caption,
      tag: parsed.data.tag,
      status: parsed.data.status,
      scheduledFor: parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null,
    },
    include: postInclude(req.businessId),
  });
  await linkHashtags(post.id, post.caption);
  res.status(201).json({ post: serializePost(post) });
});

const updateSchema = z.object({
  caption: z.string().max(2200).optional(),
  tag: z.string().min(1).max(40).optional(),
  status: z.enum(['draft', 'scheduled', 'published']).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
});

postsRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.businessId !== req.businessId) return res.status(404).json({ error: 'Post not found' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  if (parsed.data.caption !== undefined && containsBlockedContent(parsed.data.caption)) {
    return res.status(400).json({ error: 'This caption violates our content guidelines' });
  }

  const post = await prisma.post.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.caption !== undefined ? { caption: parsed.data.caption } : {}),
      ...(parsed.data.tag !== undefined ? { tag: parsed.data.tag } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.scheduledFor !== undefined
        ? { scheduledFor: parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null }
        : {}),
    },
    include: postInclude(req.businessId),
  });
  if (parsed.data.caption !== undefined) await linkHashtags(post.id, post.caption);
  res.json({ post: serializePost(post) });
});

postsRouter.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const existing = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.businessId !== req.businessId) return res.status(404).json({ error: 'Post not found' });

  await prisma.$transaction([
    prisma.like.deleteMany({ where: { postId: existing.id } }),
    prisma.comment.deleteMany({ where: { postId: existing.id } }),
    prisma.postView.deleteMany({ where: { postId: existing.id } }),
    prisma.postHashtag.deleteMany({ where: { postId: existing.id } }),
    prisma.savedPost.deleteMany({ where: { postId: existing.id } }),
    prisma.post.delete({ where: { id: existing.id } }),
  ]);
  res.json({ ok: true });
});

postsRouter.post('/:id/like', requireAuth, async (req: AuthedRequest, res) => {
  const postId = req.params.id;
  const businessId = req.businessId!;
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const existing = await prisma.like.findUnique({ where: { postId_businessId: { postId, businessId } } });
  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } });
  } else {
    await prisma.like.create({ data: { postId, businessId } });
    void notify({ recipientId: post.businessId, actorId: businessId, type: 'like', postId });
  }
  const likeCount = await prisma.like.count({ where: { postId } });
  res.json({ likedByMe: !existing, likeCount });
});

postsRouter.post('/:id/view', optionalAuth, async (req: AuthedRequest, res) => {
  const postId = req.params.id;
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  await prisma.postView.create({ data: { postId, viewerId: req.businessId ?? null } });
  res.status(201).json({ ok: true });
});

postsRouter.post('/:id/share', optionalAuth, async (req: AuthedRequest, res) => {
  const postId = req.params.id;
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const updated = await prisma.post.update({ where: { id: postId }, data: { shareCount: { increment: 1 } } });
  res.json({ shareCount: updated.shareCount });
});

const commentSchema = z.object({
  text: z.string().min(1).max(500),
  // Opt-in flag marking this as a question directed at the restaurant rather than a public
  // remark. Defaults false so every existing client keeps posting plain comments.
  isReply: z.boolean().optional().default(false),
});

function serializeComment(c: {
  id: string;
  text: string;
  createdAt: Date;
  isReply: boolean;
  answered: boolean;
  business: { id: string; name: string; handle: string; avatarUrl: string | null };
}) {
  return {
    id: c.id,
    text: c.text,
    createdAt: c.createdAt,
    isReply: c.isReply,
    answered: c.answered,
    business: { id: c.business.id, name: c.business.name, handle: c.business.handle, avatarUrl: c.business.avatarUrl },
  };
}

postsRouter.get('/:id/comments', optionalAuth, async (req: AuthedRequest, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const comments = await prisma.comment.findMany({
    where: { postId: req.params.id, hidden: false },
    orderBy: { createdAt: 'asc' },
    include: { business: true },
  });

  // The post's owner sees unanswered questions pulled to the top — that's the whole point
  // of the reply lane, so they don't have to scan a long thread to find what needs a
  // response. Everyone else sees the thread in plain chronological order, so replies read
  // as ordinary comments and the ordering isn't different for different viewers.
  const isOwner = Boolean(req.businessId) && post.businessId === req.businessId;
  const ordered = isOwner
    ? [...comments].sort((a, b) => {
        const aOpen = a.isReply && !a.answered ? 0 : 1;
        const bOpen = b.isReply && !b.answered ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
    : comments;

  res.json({
    comments: ordered.map(serializeComment),
    // Drives the small "N questions" indicator on the owner's own post.
    openReplyCount: comments.filter((c) => c.isReply && !c.answered).length,
  });
});

// Marks a question as handled. Restricted to the post's owner: it's their inbox indicator,
// and letting the asker (or anyone else) clear it would make the count meaningless.
postsRouter.post('/:postId/comments/:commentId/answered', requireAuth, async (req: AuthedRequest, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
  if (!comment || comment.postId !== req.params.postId) return res.status(404).json({ error: 'Comment not found' });

  const post = await prisma.post.findUnique({ where: { id: comment.postId } });
  if (!post || post.businessId !== req.businessId) {
    return res.status(403).json({ error: 'Only the post owner can do this' });
  }

  const updated = await prisma.comment.update({
    where: { id: comment.id },
    data: { answered: true },
    include: { business: true },
  });
  res.json({ comment: serializeComment(updated) });
});

postsRouter.post('/:id/comments', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Comment text is required' });
  if (containsBlockedContent(parsed.data.text)) {
    return res.status(400).json({ error: 'This comment violates our content guidelines' });
  }
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const comment = await prisma.comment.create({
    data: { postId: req.params.id, businessId: req.businessId!, text: parsed.data.text, isReply: parsed.data.isReply },
    include: { business: true },
  });
  void notify({ recipientId: post.businessId, actorId: req.businessId!, type: 'comment', postId: post.id });
  res.status(201).json({ comment: serializeComment(comment) });
});

postsRouter.delete('/:postId/comments/:commentId', requireAuth, async (req: AuthedRequest, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
  if (!comment || comment.postId !== req.params.postId) return res.status(404).json({ error: 'Comment not found' });

  const post = await prisma.post.findUnique({ where: { id: comment.postId } });
  const canDelete = comment.businessId === req.businessId || post?.businessId === req.businessId;
  if (!canDelete) return res.status(403).json({ error: "You can't delete this comment" });

  await prisma.comment.delete({ where: { id: comment.id } });
  res.json({ ok: true });
});
