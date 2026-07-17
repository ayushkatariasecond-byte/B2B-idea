import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, optionalAuth, AuthedRequest } from '../middleware/auth';
import { serializePost } from '../utils/serialize';
import { upload, mediaTypeFromMime } from '../upload';

export const postsRouter = Router();

const postInclude = (viewerId?: string) => ({
  business: true,
  _count: { select: { likes: true, comments: true } },
  likes: viewerId ? { where: { businessId: viewerId }, select: { id: true } } : false,
});

const PAGE_SIZE = 20;

postsRouter.get('/feed', optionalAuth, async (req: AuthedRequest, res) => {
  const tab = req.query.tab === 'following' ? 'following' : 'forYou';
  const page = Math.max(1, Number(req.query.page) || 1);

  if (tab === 'following') {
    if (!req.businessId) return res.status(401).json({ error: 'Login required for the Following feed' });
    const followed = await prisma.follow.findMany({ where: { followerId: req.businessId }, select: { followeeId: true } });
    const followeeIds = followed.map((f) => f.followeeId);
    if (followeeIds.length === 0) return res.json({ posts: [], page, hasMore: false });

    const posts = await prisma.post.findMany({
      where: { businessId: { in: followeeIds } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: postInclude(req.businessId),
    });
    return res.json({ posts: posts.map(serializePost), page, hasMore: posts.length === PAGE_SIZE });
  }

  // For You: ranked by live creativity score, rewarding engaging/creative posts over recency.
  const all = await prisma.post.findMany({
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

  const where: Record<string, unknown> = {};
  if (tag) where.tag = tag;
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

postsRouter.get('/:id', optionalAuth, async (req: AuthedRequest, res) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    include: postInclude(req.businessId),
  });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ post: serializePost(post) });
});

const createSchema = z.object({
  caption: z.string().max(2200).default(''),
  tag: z.string().min(1).max(40),
});

postsRouter.post('/', requireAuth, upload.single('media'), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  if (!req.file) return res.status(400).json({ error: 'A photo or video is required' });

  const post = await prisma.post.create({
    data: {
      businessId: req.businessId!,
      mediaUrl: `/uploads/${req.file.filename}`,
      mediaType: mediaTypeFromMime(req.file.mimetype),
      caption: parsed.data.caption,
      tag: parsed.data.tag,
    },
    include: postInclude(req.businessId),
  });
  res.status(201).json({ post: serializePost(post) });
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
  res.status(201).json({
    comment: {
      id: comment.id,
      text: comment.text,
      createdAt: comment.createdAt,
      business: { id: comment.business.id, name: comment.business.name, handle: comment.business.handle, avatarUrl: comment.business.avatarUrl },
    },
  });
});
