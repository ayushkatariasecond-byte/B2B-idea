import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, optionalAuth, AuthedRequest } from '../middleware/auth';
import { serializeBusiness } from '../utils/serialize';
import { upload, mediaTypeFromMime } from '../upload';
import { getExcludedBusinessIds } from '../utils/blocking';
import { transcodeVideo } from '../utils/videoTranscode';
import { persistUpload } from '../storage';

export const storiesRouter = Router();

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

storiesRouter.post('/', requireAuth, upload.single('media'), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'A photo or video is required' });

  const mediaType = mediaTypeFromMime(req.file.mimetype);
  let mediaFilename = req.file.filename;
  if (mediaType === 'video') {
    try {
      mediaFilename = await transcodeVideo(req.file.filename);
    } catch {
      // Transcoding is a nice-to-have — fall back to the original upload rather than blocking the story.
    }
  }

  const mediaUrl = await persistUpload(mediaFilename);
  const now = Date.now();

  const story = await prisma.story.create({
    data: {
      businessId: req.businessId!,
      mediaUrl,
      mediaType,
      createdAt: new Date(now),
      expiresAt: new Date(now + STORY_LIFETIME_MS),
    },
    include: { business: true },
  });

  res.status(201).json({
    story: {
      id: story.id,
      businessId: story.businessId,
      business: serializeBusiness(story.business),
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
    },
  });
});

storiesRouter.get('/', optionalAuth, async (req: AuthedRequest, res) => {
  const viewerId = req.businessId;
  const excluded = await getExcludedBusinessIds(viewerId);

  const active = await prisma.story.findMany({
    where: { expiresAt: { gt: new Date() }, businessId: { notIn: excluded } },
    orderBy: { createdAt: 'desc' },
    include: { business: true },
  });

  const storyIds = active.map((s) => s.id);
  const myViews = viewerId && storyIds.length
    ? await prisma.storyView.findMany({
        where: { viewerId, storyId: { in: storyIds } },
        select: { storyId: true },
      })
    : [];
  const viewedStoryIds = new Set(myViews.map((v) => v.storyId));

  const followedIds = new Set<string>();
  if (viewerId) {
    const followed = await prisma.follow.findMany({ where: { followerId: viewerId }, select: { followeeId: true } });
    for (const f of followed) followedIds.add(f.followeeId);
  }

  // Group stories (already ordered newest-first) by business, preserving that order within each group.
  const groupsByBusiness = new Map<string, { business: (typeof active)[number]['business']; stories: typeof active }>();
  for (const story of active) {
    let group = groupsByBusiness.get(story.businessId);
    if (!group) {
      group = { business: story.business, stories: [] };
      groupsByBusiness.set(story.businessId, group);
    }
    group.stories.push(story);
  }

  type StoryGroup = { business: ReturnType<typeof serializeBusiness>; stories: unknown[]; hasUnseen: boolean };
  const mine: StoryGroup[] = [];
  const following: StoryGroup[] = [];
  const others: StoryGroup[] = [];

  for (const [businessId, group] of groupsByBusiness) {
    const stories = group.stories.map((s) => ({
      id: s.id,
      mediaUrl: s.mediaUrl,
      mediaType: s.mediaType,
      createdAt: s.createdAt,
      viewedByMe: viewerId ? viewedStoryIds.has(s.id) : false,
    }));
    const hasUnseen = stories.some((s) => !s.viewedByMe);
    const serialized = { business: serializeBusiness(group.business), stories, hasUnseen };

    if (viewerId && businessId === viewerId) {
      mine.push(serialized);
    } else if (viewerId && followedIds.has(businessId)) {
      following.push(serialized);
    } else {
      others.push(serialized);
    }
  }

  res.json({ groups: [...mine, ...following, ...others] });
});

storiesRouter.post('/:id/view', requireAuth, async (req: AuthedRequest, res) => {
  const storyId = req.params.id;
  const viewerId = req.businessId!;
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story) return res.status(404).json({ error: 'Story not found' });

  await prisma.storyView.upsert({
    where: { storyId_viewerId: { storyId, viewerId } },
    update: {},
    create: { storyId, viewerId },
  });
  res.json({ ok: true });
});
