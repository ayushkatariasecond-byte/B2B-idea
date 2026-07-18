import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, optionalAuth, AuthedRequest } from '../middleware/auth';
import { serializePost } from '../utils/serialize';
import { upload, mediaTypeFromMime } from '../upload';
import { extractHashtags } from '../utils/hashtags';
import { getExcludedBusinessIds } from '../utils/blocking';
import { notify } from '../utils/notifications';

export const postsRouter = Router();

const postInclude = (viewerId?: string) => ({
  business: true,
  _count: { select: { likes: true, comments: true } },
  likes: viewerId ? { where: { businessId: viewerId }, select: { id: true } } : false,
  savedBy: viewerId ? { where: { businessId: viewerId }, select: { id: true } } : false,
});

const PAGE_SIZE = 20;

/** Only posts that are actually live: published, or scheduled posts whose time has arrived. */
function visibilityWhere() {
  return {
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

  // For You: ranked by live creativity score, rewarding engaging/creative posts over recency.
  const all = await prisma.post.findMany({
    where: { ...visibilityWhere(), businessId: { notIn: excluded } },
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: postInclude(req.businessId),
  });
  const serialized = all.map(serializePost).sort((a, b) => b.score - a.score || (b.createdAt > a.createdAt ? 1 : -1));
  const pageItems = serialized.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  res.json({ posts: pageItems, page, hasMore: page * PAGE_SIZE < serialized.length });
});

postsRouter.get('/discover', optionalAuth, async (req: AuthedRequest, res) => {
  const tag = typeof req.query.tag === 'string' && req.query.tag !== 'Trending' ? req.query.tag : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const hashtag = typeof req.query.hashtag === 'string' ? req.query.hashtag.toLowerCase().replace(/^#/, '') : undefined;
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

postsRouter.post('/', requireAuth, postUpload, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });

  const files = req.files as { media?: Express.Multer.File[]; thumbnail?: Express.Multer.File[] } | undefined;
  const mediaFile = files?.media?.[0];
  const thumbnailFile = files?.thumbnail?.[0];
  if (!mediaFile) return res.status(400).json({ error: 'A photo or video is required' });

  const post = await prisma.post.create({
    data: {
      businessId: req.businessId!,
      mediaUrl: `/uploads/${mediaFile.filename}`,
      mediaType: mediaTypeFromMime(mediaFile.mimetype),
      thumbnailUrl: thumbnailFile ? `/uploads/${thumbnailFile.filename}` : null,
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

const commentSchema = z.object({ text: z.string().min(1).max(500) });

postsRouter.get('/:id/comments', async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const comments = await prisma.comment.findMany({
    where: { postId: req.params.id },
    orderBy: { createdAt: 'asc' },
    include: { business: true },
  });
  res.json({
    comments: comments.map((c) => ({
      id: c.id,
      text: c.text,
      createdAt: c.createdAt,
      business: { id: c.business.id, name: c.business.name, handle: c.business.handle, avatarUrl: c.business.avatarUrl },
    })),
  });
});

postsRouter.post('/:id/comments', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Comment text is required' });
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const comment = await prisma.comment.create({
    data: { postId: req.params.id, businessId: req.businessId!, text: parsed.data.text },
    include: { business: true },
  });
  void notify({ recipientId: post.businessId, actorId: req.businessId!, type: 'comment', postId: post.id });
  res.status(201).json({
    comment: {
      id: comment.id,
      text: comment.text,
      createdAt: comment.createdAt,
      business: { id: comment.business.id, name: comment.business.name, handle: comment.business.handle, avatarUrl: comment.business.avatarUrl },
    },
  });
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
