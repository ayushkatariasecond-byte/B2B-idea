import { computeCreativityScore, TRENDING_THRESHOLD } from './score';

type BusinessLike = {
  id: string;
  name: string;
  handle: string;
  category: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
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
  caption: string;
  tag: string;
  shareCount: number;
  createdAt: Date;
  _count: { likes: number; comments: number };
  likes?: { id: string }[];
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
    caption: post.caption,
    tag: post.tag,
    likeCount,
    commentCount,
    shareCount,
    score,
    trending: score >= TRENDING_THRESHOLD,
    likedByMe: Boolean(post.likes && post.likes.length > 0),
    createdAt: post.createdAt,
  };
}
