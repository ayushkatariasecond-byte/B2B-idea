export interface Cuisine {
  id: string;
  name: string;
  slug: string;
}

export interface MenuItem {
  name: string;
  price: number;
  description?: string;
}

export interface Business {
  id: string;
  name: string;
  handle: string;
  category: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  verified: boolean;
  verificationRequested: boolean;
  createdAt: string;
  postCount?: number;
  followerCount?: number;
  followingCount?: number;
  isFollowedByMe?: boolean;
  isMe?: boolean;
  city: string;
  /** Whether this account has real coordinates stored. The coordinates themselves are
   *  never serialized onto a profile — a viewer's would be their home location. */
  hasLocation?: boolean;
  isRestaurant: boolean;
  website: string | null;
  cuisine: Cuisine | null;
  menuItems: MenuItem[];
}

export type PostStatus = 'draft' | 'scheduled' | 'published';

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
  savedByMe: boolean;
  status: PostStatus;
  scheduledFor: string | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  /** A question aimed at the restaurant rather than a public remark to the room. */
  isReply: boolean;
  /** Set by the post's owner once they've responded, clearing it from their open count. */
  answered: boolean;
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
  /** Taps on this restaurant's website/ordering link — the closest thing to a conversion. */
  linkClicks30d: number;
  linkClicksDeltaPct: number;
  engagementPct: number;
  engagementDeltaPts: number;
  creativityScore: number;
  percentileTop: number;
  weeklyViews: { label: string; count: number; heightPct: number; isCurrent: boolean }[];
  topPost: { id: string; caption: string; score: number; likeCount: number; shareCount: number } | null;
}

export type NotificationType = 'like' | 'comment' | 'follow' | 'message';

export interface AppNotification {
  id: string;
  type: NotificationType;
  postId: string | null;
  threadId: string | null;
  read: boolean;
  createdAt: string;
  actor: Pick<Business, 'id' | 'name' | 'handle' | 'avatarUrl'> | null;
}

export interface TeamMember {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface TrendingTag {
  tag: string;
  count: number;
}

export interface StoryItem {
  id: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  createdAt: string;
  viewedByMe: boolean;
}

export interface StoryGroup {
  business: Business;
  stories: StoryItem[];
  hasUnseen: boolean;
}

export interface CreatedStory {
  id: string;
  businessId: string;
  business: Business;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  createdAt: string;
  expiresAt: string;
}

// Nibbler: only restaurants post here, so these replace the old B2B tag set entirely
// rather than living alongside it.
export const POST_TAGS = ['New Dish', 'Behind the Kitchen', 'Special Offer', 'Customer Favorite'];
