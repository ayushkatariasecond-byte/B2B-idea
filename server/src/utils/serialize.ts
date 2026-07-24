import { computeCreativityScore, TRENDING_THRESHOLD } from './score';
import { isSafeWebUrl } from './url';

type CuisineLike = { id: string; name: string; slug: string };

type BusinessLike = {
  id: string;
  name: string;
  handle: string;
  category: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  verified: boolean;
  verificationRequested: boolean;
  emailVerified?: boolean;
  createdAt: Date;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
  isRestaurant?: boolean;
  website?: string | null;
  cuisine?: CuisineLike | null;
  menuItems?: unknown;
};

export function serializeBusiness(b: BusinessLike, extra: Record<string, unknown> = {}) {
  return {
    id: b.id,
    name: b.name,
    handle: b.handle,
    category: b.category,
    bio: b.bio,
    avatarUrl: b.avatarUrl,
    coverUrl: b.coverUrl,
    verified: b.verified,
    verificationRequested: b.verificationRequested,
    emailVerified: b.emailVerified ?? false,
    createdAt: b.createdAt,
    city: b.city ?? '',
    // Deliberately a boolean, NOT the coordinates themselves. This serializer is used for
    // every account including plain viewers, and a viewer's latitude/longitude is their
    // home location — publishing that on a profile any stranger can fetch would be a real
    // privacy leak. The client only needs to know whether to offer the "enable location"
    // prompt. Restaurant pin coordinates are served separately and deliberately coarsened
    // by the map endpoint (see routes/businesses.ts `/nearby`).
    hasLocation: b.latitude != null && b.longitude != null,
    isRestaurant: b.isRestaurant ?? false,
    // Re-checked on the way out, not just on the way in. The write path (PATCH /me) now
    // rejects non-http(s) schemes, but rows written before that existed are still in the
    // database, and this serializer is the single chokepoint every client read passes
    // through — filtering here means a stored `javascript:` URL can't be served to a
    // viewer even if it already got persisted. Dropping to null degrades to "no website
    // shown" rather than handing the client something it will try to open.
    website: b.website && isSafeWebUrl(b.website) ? b.website : null,
    cuisine: b.cuisine ?? null,
    menuItems: Array.isArray(b.menuItems) ? b.menuItems : [],
    ...extra,
  };
}

type PostWithRelations = {
  id: string;
  businessId: string;
  business: BusinessLike;
  mediaUrl: string;
  mediaType: string;
  thumbnailUrl: string | null;
  caption: string;
  tag: string;
  shareCount: number;
  status: string;
  scheduledFor: Date | null;
  hidden: boolean;
  createdAt: Date;
  _count: { likes: number; comments: number };
  likes?: { id: string }[];
  savedBy?: { id: string }[];
};

export function serializePost(post: PostWithRelations) {
  const likeCount = post._count.likes;
  const commentCount = post._count.comments;
  const shareCount = post.shareCount;
  const score = computeCreativityScore({
    caption: post.caption,
    likeCount,
    commentCount,
    shareCount,
  });

  return {
    id: post.id,
    businessId: post.businessId,
    business: serializeBusiness(post.business),
    mediaUrl: post.mediaUrl,
    mediaType: post.mediaType,
    thumbnailUrl: post.thumbnailUrl,
    caption: post.caption,
    tag: post.tag,
    likeCount,
    commentCount,
    shareCount,
    score,
    trending: score >= TRENDING_THRESHOLD,
    likedByMe: Boolean(post.likes && post.likes.length > 0),
    savedByMe: Boolean(post.savedBy && post.savedBy.length > 0),
    status: post.status,
    scheduledFor: post.scheduledFor,
    hidden: post.hidden,
    createdAt: post.createdAt,
  };
}
