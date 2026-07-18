import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { computeCreativityScore } from '../utils/score';

export const analyticsRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

function pctDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

analyticsRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const now = Date.now();
  const d30 = new Date(now - 30 * DAY_MS);
  const d60 = new Date(now - 60 * DAY_MS);

  const visible = { OR: [{ status: 'published' }, { status: 'scheduled', scheduledFor: { lte: new Date() } }] };

  const myPosts = await prisma.post.findMany({
    where: { businessId, ...visible },
    include: { _count: { select: { likes: true, comments: true } } },
  });
  const myPostIds = myPosts.map((p) => p.id);

  const [views30, viewsPrev30, likes30, likesPrev30, comments30, commentsPrev30] = await Promise.all([
    prisma.postView.count({ where: { postId: { in: myPostIds }, createdAt: { gte: d30 } } }),
    prisma.postView.count({ where: { postId: { in: myPostIds }, createdAt: { gte: d60, lt: d30 } } }),
    prisma.like.count({ where: { postId: { in: myPostIds }, createdAt: { gte: d30 } } }),
    prisma.like.count({ where: { postId: { in: myPostIds }, createdAt: { gte: d60, lt: d30 } } }),
    prisma.comment.count({ where: { postId: { in: myPostIds }, createdAt: { gte: d30 } } }),
    prisma.comment.count({ where: { postId: { in: myPostIds }, createdAt: { gte: d60, lt: d30 } } }),
  ]);

  const engagement30 = views30 > 0 ? ((likes30 + comments30) / views30) * 100 : 0;
  const engagementPrev30 = viewsPrev30 > 0 ? ((likesPrev30 + commentsPrev30) / viewsPrev30) * 100 : 0;

  const postScores = myPosts.map((p) =>
    computeCreativityScore({
      caption: p.caption,
      likeCount: p._count.likes,
      commentCount: p._count.comments,
      shareCount: p.shareCount,
    })
  );
  const creativityScore = postScores.length
    ? Math.round(postScores.reduce((a, b) => a + b, 0) / postScores.length)
    : 50;

  // Percentile vs every business that has at least one post.
  const allBusinessPosts = await prisma.post.findMany({
    where: visible,
    include: { _count: { select: { likes: true, comments: true } } },
  });
  const scoreByBusiness = new Map<string, number[]>();
  for (const p of allBusinessPosts) {
    const s = computeCreativityScore({
      caption: p.caption,
      likeCount: p._count.likes,
      commentCount: p._count.comments,
      shareCount: p.shareCount,
    });
    const arr = scoreByBusiness.get(p.businessId) ?? [];
    arr.push(s);
    scoreByBusiness.set(p.businessId, arr);
  }
  const avgScores = Array.from(scoreByBusiness.entries()).map(([id, scores]) => ({
    id,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
  }));
  avgScores.sort((a, b) => b.avg - a.avg);
  const myRankIndex = avgScores.findIndex((e) => e.id === businessId);
  const percentile = avgScores.length > 0 && myRankIndex >= 0 ? Math.max(1, Math.round(((myRankIndex + 1) / avgScores.length) * 100)) : 100;

  // Weekly views for the last 6 weeks (own posts), oldest to newest.
  const weeks: { label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now - (i + 1) * 7 * DAY_MS);
    const end = new Date(now - i * 7 * DAY_MS);
    const count = await prisma.postView.count({ where: { postId: { in: myPostIds }, createdAt: { gte: start, lt: end } } });
    weeks.push({ label: `W${6 - i}`, count });
  }
  const maxWeekCount = Math.max(1, ...weeks.map((w) => w.count));
  const weeklyViews = weeks.map((w, idx) => ({
    label: w.label,
    count: w.count,
    heightPct: Math.max(8, Math.round((w.count / maxWeekCount) * 100)),
    isCurrent: idx === weeks.length - 1,
  }));

  const topPost = myPosts
    .map((p, idx) => ({ post: p, score: postScores[idx], engagement: p._count.likes + p._count.comments + p.shareCount }))
    .sort((a, b) => b.engagement - a.engagement)[0];

  res.json({
    views30d: views30,
    viewsDeltaPct: Math.round(pctDelta(views30, viewsPrev30) * 10) / 10,
    engagementPct: Math.round(engagement30 * 10) / 10,
    engagementDeltaPts: Math.round((engagement30 - engagementPrev30) * 10) / 10,
    creativityScore,
    percentileTop: percentile,
    weeklyViews,
    topPost: topPost
      ? {
          id: topPost.post.id,
          caption: topPost.post.caption,
          score: topPost.score,
          likeCount: topPost.post._count.likes,
          shareCount: topPost.post.shareCount,
        }
      : null,
  });
});
