import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, isUniqueConstraintError } from '../db';
import { requireAuth, requireOwner, optionalAuth, rejectGuest, AuthedRequest } from '../middleware/auth';
import { serializeBusiness, serializePost } from '../utils/serialize';
import { upload, verifyUploadedMedia } from '../upload';
import { persistUpload } from '../storage';
import { notify } from '../utils/notifications';
import { getExcludedBusinessIds } from '../utils/blocking';
import { hasCoords, boundingBox, matchesLocation, distanceMiles, DEFAULT_RADIUS_MILES } from '../utils/geo';
import { webUrlSchema, isSafeWebUrl } from '../utils/url';

export const businessesRouter = Router();

function visibilityWhere() {
  return {
    hidden: false,
    OR: [{ status: 'published' }, { status: 'scheduled', scheduledFor: { lte: new Date() } }],
  };
}

async function withStats(businessId: string, viewerId?: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId }, include: { cuisine: true } });
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
  // Capped defensively before it ever reaches a query — a search box has no legitimate
  // reason to send a multi-KB string, and this is one less unbounded value in a `contains`
  // filter.
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (!q) return res.json({ businesses: [] });
  // `suspended` is checked here, not just on the posts: suspending an account hid its
  // posts but left the account itself surfacing in search and suggested-follows, so a
  // moderated business stayed findable and followable. Blocked accounts are excluded for
  // the same reason they are everywhere else.
  const excluded = await getExcludedBusinessIds((req as AuthedRequest).businessId);
  const businesses = await prisma.business.findMany({
    where: {
      suspended: false,
      id: { notIn: excluded },
      OR: [{ name: { contains: q } }, { handle: { contains: q } }],
    },
    take: 8,
  });
  res.json({ businesses: businesses.map((b) => serializeBusiness(b)) });
});

businessesRouter.get('/suggested', requireAuth, async (req: AuthedRequest, res) => {
  const [following, all] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: req.businessId! }, select: { followeeId: true } }),
    prisma.business.findMany({
      where: {
        id: { not: req.businessId!, notIn: await getExcludedBusinessIds(req.businessId) },
        suspended: false,
      },
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

/**
 * Restaurants near the authenticated viewer, with coordinates, for the feed's map view.
 *
 * This is the one place coordinates are ever sent to a client, and only ever a
 * RESTAURANT's — never a viewer's (a viewer's coordinates are their home address; see the
 * note on serializeBusiness). Even so the values are rounded to 3 decimal places, roughly
 * 100m: that's precise enough to put a pin on the right block, while avoiding publishing a
 * an exact fix that a restaurant never explicitly agreed to broadcast.
 *
 * Uses the same two-stage narrowing and the same `matchesLocation` rule as the For You
 * feed, so the map can never show a restaurant the feed itself would have filtered out.
 */
businessesRouter.get('/nearby', requireAuth, async (req: AuthedRequest, res) => {
  const viewer = await prisma.business.findUnique({
    where: { id: req.businessId! },
    select: { city: true, latitude: true, longitude: true },
  });
  if (!viewer) return res.status(404).json({ error: 'Not found' });

  const viewerCity = viewer.city ?? '';
  const excluded = await getExcludedBusinessIds(req.businessId);

  const locationWhere = hasCoords(viewer)
    ? (() => {
        const box = boundingBox(viewer, DEFAULT_RADIUS_MILES);
        return {
          OR: [
            { latitude: { gte: box.minLat, lte: box.maxLat }, longitude: { gte: box.minLon, lte: box.maxLon } },
            { city: viewerCity, latitude: null },
          ],
        };
      })()
    : { city: viewerCity };

  const candidates = await prisma.business.findMany({
    where: { isRestaurant: true, suspended: false, id: { notIn: excluded }, ...locationWhere },
    include: { cuisine: true },
    take: 200,
  });

  // A restaurant with no coordinates can't be placed on a map at all, so it's dropped here
  // (it still appears in the list view — this is a map-only omission, not a feed change).
  const pins = candidates
    .filter((b) => hasCoords(b) && matchesLocation(viewer, b, DEFAULT_RADIUS_MILES))
    .map((b) => ({
      id: b.id,
      name: b.name,
      handle: b.handle,
      avatarUrl: b.avatarUrl,
      cuisine: b.cuisine ? { id: b.cuisine.id, name: b.cuisine.name, slug: b.cuisine.slug } : null,
      latitude: Math.round(b.latitude! * 1000) / 1000,
      longitude: Math.round(b.longitude! * 1000) / 1000,
      distanceMiles: hasCoords(viewer) ? Math.round(distanceMiles(viewer, b as { latitude: number; longitude: number }) * 10) / 10 : null,
    }))
    .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));

  res.json({
    restaurants: pins,
    city: viewerCity,
    radiusMiles: DEFAULT_RADIUS_MILES,
    // Lets the client center the map and decide whether to prompt for location, without
    // ever handing it the viewer's own precise coordinates.
    viewerHasLocation: hasCoords(viewer),
    center: hasCoords(viewer)
      ? { latitude: Math.round(viewer.latitude! * 1000) / 1000, longitude: Math.round(viewer.longitude! * 1000) / 1000 }
      : pins.length > 0
        ? { latitude: pins[0].latitude, longitude: pins[0].longitude }
        : null,
  });
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

const menuItemSchema = z.object({
  name: z.string().min(1).max(80),
  // .finite() matters here: z.number() alone accepts Infinity (it only rejects NaN by
  // default), and nonnegative() doesn't stop Infinity either since Infinity >= 0 is true.
  price: z.number().finite().nonnegative().max(100000, 'Price is unreasonably large'),
  description: z.string().max(200).optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  category: z.string().min(2).max(60).optional(),
  bio: z.string().max(280).optional(),
  // .trim() before .min(1): a city of only spaces used to pass, and since city is the
  // fallback match key it left the account matching nothing at all.
  city: z.string().trim().min(1, 'City is required').max(80).optional(),
  // Sent when the user grants (or re-grants) the location permission from profile setup.
  // Both must arrive together to be applied — see the pairing check in the handler.
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  // Scheme-restricted on purpose — a bare `.url()` here accepted `javascript:` and made
  // this field a stored-XSS vector. See utils/url.ts.
  website: webUrlSchema.optional(),
  cuisineSlug: z.string().min(1).max(50).optional(),
  // Full-replace, matching the update-your-whole-menu-at-once pattern this route already
  // uses elsewhere for small collections — no per-item CRUD endpoints for a flat list this size.
  menuItems: z.array(menuItemSchema).max(100).optional(),
});

businessesRouter.patch('/me', requireAuth, rejectGuest, async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  const { cuisineSlug, website, latitude, longitude, ...rest } = parsed.data;

  // Coordinates are written as a pair or not at all. Letting one through alone would
  // leave a half-set location that reads as "has coordinates" to some checks and not
  // others; requiring both keeps the account in exactly one of the two match modes.
  const coordFields = hasCoords({ latitude, longitude }) ? { latitude, longitude } : {};

  let cuisineFields: { cuisineId: string; category: string } | undefined;
  if (cuisineSlug) {
    const cuisine = await prisma.cuisine.findUnique({ where: { slug: cuisineSlug } });
    if (!cuisine) return res.status(400).json({ error: 'Unknown cuisine type' });
    cuisineFields = { cuisineId: cuisine.id, category: cuisine.name };
  }

  const business = await prisma.business.update({
    where: { id: req.businessId! },
    data: {
      ...rest,
      ...(website !== undefined ? { website: website === '' ? null : website } : {}),
      ...cuisineFields,
      ...coordFields,
    },
    include: { cuisine: true },
  });
  res.json({ business: serializeBusiness(business) });
});

businessesRouter.post('/me/avatar', requireAuth, rejectGuest, upload.single('media'), verifyUploadedMedia, async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const avatarUrl = await persistUpload(req.file.filename);
  const business = await prisma.business.update({ where: { id: req.businessId! }, data: { avatarUrl } });
  res.json({ business: serializeBusiness(business) });
});

businessesRouter.post('/me/cover', requireAuth, rejectGuest, upload.single('media'), verifyUploadedMedia, async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const coverUrl = await persistUpload(req.file.filename);
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

businessesRouter.post('/me/request-verification', requireAuth, requireOwner, rejectGuest, async (req: AuthedRequest, res) => {
  const business = await prisma.business.update({ where: { id: req.businessId! }, data: { verificationRequested: true } });
  res.json({ business: serializeBusiness(business) });
});

businessesRouter.get('/me/export', requireAuth, requireOwner, rejectGuest, async (req: AuthedRequest, res) => {
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

businessesRouter.delete('/me', requireAuth, requireOwner, rejectGuest, async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  // Every relation is cleaned up in child-before-parent order. Anything referencing this
  // business — or referencing a row that belongs to it — has to go first, because these
  // FKs are `onDelete: Restrict` (Prisma's default for a required relation), so a single
  // missed reference doesn't orphan a row, it aborts the whole delete with a 500.
  //
  // This previously only removed rows this account CREATED, which meant a post could not be
  // deleted while anyone else's like/comment/save/view still pointed at it. In practice that
  // made "delete my account" fail outright for any account whose posts had ever been
  // interacted with — i.e. for exactly the accounts most likely to ask. Stories, story
  // views, threads and filed reports were never deleted at all.
  await prisma.$transaction([
    // Stories: views of my stories (by anyone) before the stories themselves, plus views
    // I left on other people's stories.
    prisma.storyView.deleteMany({ where: { story: { businessId } } }),
    prisma.storyView.deleteMany({ where: { viewerId: businessId } }),
    prisma.story.deleteMany({ where: { businessId } }),

    // Threads: every message in any thread I'm part of (not just my own messages — the
    // other participant's messages reference the same thread and would block its delete),
    // then the threads.
    prisma.message.deleteMany({
      where: { thread: { OR: [{ participantAId: businessId }, { participantBId: businessId }] } },
    }),
    prisma.message.deleteMany({ where: { senderId: businessId } }),
    prisma.thread.deleteMany({ where: { OR: [{ participantAId: businessId }, { participantBId: businessId }] } }),

    // Reports I filed. (Reports ABOUT me store a plain targetId string, not an FK, so they
    // don't block anything and are left as moderation history.)
    prisma.report.deleteMany({ where: { reporterId: businessId } }),

    // Post children — both directions. `businessId`/`viewerId` covers what I did to other
    // people's posts; `post: { businessId }` covers what everyone else did to mine, which
    // is the half that was missing.
    prisma.like.deleteMany({ where: { businessId } }),
    prisma.like.deleteMany({ where: { post: { businessId } } }),
    prisma.comment.deleteMany({ where: { businessId } }),
    prisma.comment.deleteMany({ where: { post: { businessId } } }),
    prisma.postView.deleteMany({ where: { viewerId: businessId } }),
    prisma.postView.deleteMany({ where: { post: { businessId } } }),
    prisma.savedPost.deleteMany({ where: { businessId } }),
    prisma.savedPost.deleteMany({ where: { post: { businessId } } }),

    prisma.follow.deleteMany({ where: { OR: [{ followerId: businessId }, { followeeId: businessId }] } }),
    prisma.block.deleteMany({ where: { OR: [{ blockerId: businessId }, { blockedId: businessId }] } }),
    prisma.notification.deleteMany({ where: { OR: [{ recipientId: businessId }, { actorId: businessId }] } }),
    prisma.businessMember.deleteMany({ where: { businessId } }),
    prisma.postHashtag.deleteMany({ where: { post: { businessId } } }),
    prisma.post.deleteMany({ where: { businessId } }),
    // Redemptions this business made (as a logged-in redeemer, via userId) and redemptions
    // against promo codes this business owns (as a restaurant) both reference Business —
    // both have to go before the promo codes themselves, and the promo codes before the
    // business row. See the PromoCode/Redemption schema comment for the cascade-delete
    // rationale (deliberately app-level, matching every other relation cleaned up above).
    prisma.redemption.deleteMany({ where: { userId: businessId } }),
    prisma.redemption.deleteMany({ where: { promoCode: { restaurantId: businessId } } }),
    prisma.promoCode.deleteMany({ where: { restaurantId: businessId } }),
    // Both directions, same reasoning as the Redemption pair above: clicks ON this
    // restaurant's link (restaurantId, an FK with onDelete: Restrict) would otherwise
    // block the delete outright, and clicks this account MADE on other restaurants'
    // links (viewerId) are its own activity data and go with the account.
    prisma.linkClick.deleteMany({ where: { restaurantId: businessId } }),
    prisma.linkClick.deleteMany({ where: { viewerId: businessId } }),
    prisma.business.delete({ where: { id: businessId } }),
  ]);
  res.json({ ok: true });
});

// Logs a tap on a restaurant's website/ordering link — the closest thing this app has to a
// conversion signal. `optionalAuth` rather than `requireAuth` on purpose: restaurant
// profiles are publicly viewable and their links publicly tappable, so requiring a login
// here would silently undercount exactly the traffic a restaurant cares most about.
// Rate limiting comes from the global apiLimiter; there's no per-viewer dedupe because a
// repeat tap is a real repeat intent to order, not a duplicate to be collapsed.
businessesRouter.post('/:id/link-click', optionalAuth, async (req: AuthedRequest, res) => {
  const restaurant = await prisma.business.findUnique({ where: { id: req.params.id } });
  if (!restaurant) return res.status(404).json({ error: 'Business not found' });

  await prisma.linkClick.create({
    data: { restaurantId: restaurant.id, viewerId: req.businessId ?? null },
  });
  res.status(201).json({ ok: true });
});

// Click stats for the authenticated restaurant's OWN link only. There is deliberately no
// `:id` variant of this route — click volume is competitive business intelligence, so the
// only way to read it is as the account that owns it (scoped by req.businessId, which
// comes from the verified token and can't be spoofed via a path param).
businessesRouter.get('/me/link-clicks', requireAuth, async (req: AuthedRequest, res) => {
  const businessId = req.businessId!;
  const now = Date.now();
  const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const d60 = new Date(now - 60 * 24 * 60 * 60 * 1000);

  const [total, last30, prev30, recent] = await Promise.all([
    prisma.linkClick.count({ where: { restaurantId: businessId } }),
    prisma.linkClick.count({ where: { restaurantId: businessId, clickedAt: { gte: d30 } } }),
    prisma.linkClick.count({ where: { restaurantId: businessId, clickedAt: { gte: d60, lt: d30 } } }),
    prisma.linkClick.findMany({
      where: { restaurantId: businessId },
      orderBy: { clickedAt: 'desc' },
      take: 50,
      select: { clickedAt: true },
    }),
  ]);

  res.json({
    totalClicks: total,
    clicks30d: last30,
    clicksPrev30d: prev30,
    recentClicks: recent.map((c) => c.clickedAt),
  });
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
    // deleteMany, not delete: idempotent, so a double-tap unfollow can't 500 on the loser.
    await prisma.follow.deleteMany({ where: { id: existing.id } });
  } else {
    try {
      await prisma.follow.create({ data: { followerId, followeeId } });
      void notify({ recipientId: followeeId, actorId: followerId, type: 'follow' });
    } catch (err) {
      // Lost a double-tap race — the other request already created this follow.
      if (!isUniqueConstraintError(err)) throw err;
    }
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
    await prisma.block.deleteMany({ where: { id: existing.id } });
  } else {
    await prisma.block.createMany({ data: { blockerId, blockedId }, skipDuplicates: true });
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
