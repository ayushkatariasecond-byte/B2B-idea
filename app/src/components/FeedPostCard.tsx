import React from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PostMedia } from './PostMedia';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { colors, fonts, radius } from '../theme/tokens';
import { Post } from '../api/types';
import { RootStackParamList } from '../navigation/types';
import { promptReport } from '../utils/reportPrompt';

interface FeedPostCardProps {
  post: Post;
  isActive: boolean;
  onToggleLike: (post: Post) => void;
  onToggleSave: (post: Post) => void;
  onShare: (post: Post) => void;
}

// Header avatar: 36px overall, 2px gold-gradient ring, 1.5px white inner border, avatar fill inside.
const AVATAR_OUTER = 36;
const AVATAR_RING = 2;
const AVATAR_BORDER = 1.5;
const AVATAR_INNER = AVATAR_OUTER - AVATAR_RING * 2;
const AVATAR_SIZE = AVATAR_INNER - AVATAR_BORDER * 2;

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function FeedPostCard({ post, isActive, onToggleLike, onToggleSave, onShare }: FeedPostCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleShare = async () => {
    onShare(post);
    try {
      await Share.share({ message: `${post.business.name} on Nibbler: ${post.caption}` });
    } catch {
      // user dismissed share sheet; nothing to do
    }
  };

  const goToProfile = () => navigation.navigate('BusinessProfile', { businessId: post.businessId });
  const goToDetail = () => navigation.navigate('PostDetail', { postId: post.id });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable style={styles.headerMain} onPress={goToProfile} accessibilityRole="button" accessibilityLabel={`View ${post.business.name}'s profile`}>
          <LinearGradient
            colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarRing}
          >
            <View style={styles.avatarBorder}>
              <Avatar uri={post.business.avatarUrl} name={post.business.name} size={AVATAR_SIZE} />
            </View>
          </LinearGradient>
          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {post.business.name}
              </Text>
              {post.business.verified && <Icon name="checkBadge" color={colors.gold} size={13} />}
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {post.tag} · {formatRelativeTime(post.createdAt)}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.moreButton}
          onPress={() => promptReport('post', post.id)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <View style={styles.moreDotsRotate}>
            <Icon name="moreDots" color={colors.inkMuted} size={17} />
          </View>
        </Pressable>
      </View>

      <View style={styles.mediaOuter}>
        <View style={styles.mediaAspect}>
          <View style={styles.mediaFill}>
            <PostMedia uri={post.mediaUrl} mediaType={post.mediaType} thumbnailUri={post.thumbnailUrl} active={isActive} />
          </View>
          {post.trending && (
            <LinearGradient
              colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.trendingPill}
            >
              <Icon name="lightning" color={colors.white} size={12} />
              <Text style={styles.trendingText}>{post.score}</Text>
            </LinearGradient>
          )}
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          onPress={() => onToggleLike(post)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={post.likedByMe ? 'Unlike post' : 'Like post'}
        >
          <Icon name={post.likedByMe ? 'heartFilled' : 'heart'} color={colors.ink} size={22} />
        </Pressable>
        <Pressable onPress={goToDetail} hitSlop={10} accessibilityRole="button" accessibilityLabel="View comments">
          <Icon name="comment" color={colors.ink} size={22} strokeWidth={1.7} />
        </Pressable>
        <Pressable onPress={handleShare} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share post">
          <Icon name="send" color={colors.ink} size={21} />
        </Pressable>
        <View style={styles.actionSpacer} />
        <Pressable
          onPress={() => onToggleSave(post)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={post.savedByMe ? 'Unsave post' : 'Save post'}
        >
          <Icon name={post.savedByMe ? 'bookmarkFilled' : 'bookmark'} color={colors.ink} size={22} />
        </Pressable>
      </View>

      <View style={styles.likesLine}>
        <Text style={styles.likesText}>{post.likeCount} likes</Text>
      </View>

      <View style={styles.captionLine}>
        <Text style={styles.caption} numberOfLines={2}>
          <Text style={styles.captionHandle}>{'@' + post.business.handle}</Text> {post.caption}
        </Text>
      </View>

      {post.commentCount > 0 && (
        <Pressable style={styles.commentsLink} onPress={goToDetail} hitSlop={6}>
          <Text style={styles.viewComments}>View all {post.commentCount} comments</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  avatarRing: {
    width: AVATAR_OUTER,
    height: AVATAR_OUTER,
    borderRadius: AVATAR_OUTER / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBorder: {
    width: AVATAR_INNER,
    height: AVATAR_INNER,
    borderRadius: AVATAR_INNER / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontFamily: fonts.body.bold, fontSize: 13.5, color: colors.ink },
  subtitle: { fontSize: 11.5, color: colors.inkFaint, marginTop: 1, fontFamily: fonts.body.regular },
  moreButton: { padding: 4 },
  moreDotsRotate: { transform: [{ rotate: '90deg' }] },
  mediaOuter: { marginHorizontal: 14, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.paper2 },
  mediaAspect: { width: '100%', paddingTop: '125%', position: 'relative' },
  mediaFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  trendingPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    shadowColor: colors.gradientGoldEnd,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 4,
  },
  trendingText: { color: colors.white, fontFamily: fonts.display.bold, fontSize: 12 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  actionSpacer: { flex: 1 },
  likesLine: { paddingTop: 2, paddingHorizontal: 16, paddingBottom: 0 },
  likesText: { fontSize: 13.5, fontFamily: fonts.body.bold, color: colors.ink },
  captionLine: { paddingTop: 5, paddingHorizontal: 16, paddingBottom: 0 },
  caption: { fontSize: 13.5, color: colors.captionText, lineHeight: 19.6, fontFamily: fonts.body.regular },
  captionHandle: { fontFamily: fonts.body.bold, color: colors.ink },
  commentsLink: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 15 },
  viewComments: { fontSize: 13, color: colors.inkFaint, fontFamily: fonts.body.medium },
});
