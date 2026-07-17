export interface Business {
  id: string;
  name: string;
  handle: string;
  category: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  createdAt: string;
  postCount?: number;
  followerCount?: number;
  followingCount?: number;
  isFollowedByMe?: boolean;
  isMe?: boolean;
}

export interface Post {
  id: string;
  businessId: string;
  business: Business;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  thumbnailUrl: string | null;
  caption: string;
  tag: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  score: number;
  trending: boolean;
  likedByMe: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  business: Pick<Business, 'id' | 'name' | 'handle' | 'avatarUrl'>;
}

export interface ThreadSummary {
  id: string;
  business: Pick<Business, 'id' | 'name' | 'handle' | 'avatarUrl'>;
  lastMessage: { text: string; createdAt: string; senderId: string } | null;
  unread: boolean;
  updatedAt: string;
}

export interface ThreadMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
  mine: boolean;
}

export interface AnalyticsResponse {
  views30d: number;
  viewsDeltaPct: number;
  engagementPct: number;
  engagementDeltaPts: number;
  creativityScore: number;
  percentileTop: number;
  weeklyViews: { label: string; count: number; heightPct: number; isCurrent: boolean }[];
  topPost: { id: string; caption: string; score: number; likeCount: number; shareCount: number } | null;
}

export const POST_TAGS = ['Product Launch', 'Culture', 'Case Study', 'Behind the Build', 'Customer Story'];
