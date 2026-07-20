import { computeCreativityScore, TRENDING_THRESHOLD } from './score';

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
    createdAt: post.createdAt,
  };
}
