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
      await Share.share({ message: `${post.business.name} on Verve: ${post.caption}` });
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
          <Avatar uri={post.business.avatarUrl} name={post.business.name} size={36} />
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
          <Icon name="moreDots" color={colors.inkSoft2} size={18} />
        </Pressable>
      </View>

      <View style={styles.mediaWrap}>
        <PostMedia uri={post.mediaUrl} mediaType={post.mediaType} thumbnailUri={post.thumbnailUrl} active={isActive} />
        {post.trending && (
          <LinearGradient
            colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.trendingPill}
          >
            <Text style={styles.trendingText}>TRENDING · {post.score}</Text>
          </LinearGradient>
        )}
      </View>

      <View style={styles.actionRow}>
        <View style={styles.actionGroup}>
          <Pressable
            style={styles.actionItem}
            onPress={() => onToggleLike(post)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={post.likedByMe ? 'Unlike post' : 'Like post'}
          >
            <Icon name={post.likedByMe ? 'heartFilled' : 'heart'} color={post.likedByMe ? colors.gold : colors.ink} size={24} />
            <Text style={styles.actionLabel}>{post.likeCount}</Text>
          </Pressable>
          <Pressable style={styles.actionItem} onPress={goToDetail} hitSlop={10} accessibilityRole="button" accessibilityLabel="View comments">
            <Icon name="comment" color={colors.ink} size={22} />
            <Text style={styles.actionLabel}>{post.commentCount}</Text>
          </Pressable>
          <Pressable style={styles.actionItem} onPress={handleShare} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share post">
            <Icon name="send" color={colors.ink} size={21} />
            <Text style={styles.actionLabel}>{post.shareCount}</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => onToggleSave(post)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={post.savedByMe ? 'Unsave post' : 'Save post'}
        >
          <Icon name="star" color={post.savedByMe ? colors.gold : colors.inkFaint2} size={20} />
        </Pressable>
      </View>

      <View style={styles.captionWrap}>
        <Text style={styles.caption} numberOfLines={2}>
          <Text style={styles.captionHandle}>{'@' + post.business.handle}</Text> {post.caption}
        </Text>
        {post.commentCount > 0 && (
          <Pressable onPress={goToDetail} hitSlop={6}>
            <Text style={styles.viewComments}>View all {post.commentCount} comments</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    marginHorizontal: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  headerText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontFamily: fonts.body.bold, fontSize: 14, color: colors.ink },
  subtitle: { fontSize: 12, color: colors.inkFaint, marginTop: 1, fontFamily: fonts.body.regular },
  moreButton: { padding: 4 },
  mediaWrap: { width: '100%', aspectRatio: 4 / 5, backgroundColor: colors.paper2 },
  trendingPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    shadowColor: colors.splashGlow2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  trendingText: { color: colors.white, fontFamily: fonts.display.bold, fontSize: 11 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionLabel: { fontSize: 13, color: colors.inkSoft, fontFamily: fonts.body.semiBold },
  captionWrap: { paddingHorizontal: 12, paddingBottom: 14, paddingTop: 2, gap: 4 },
  caption: { fontSize: 13.5, color: colors.bodyText, lineHeight: 19, fontFamily: fonts.body.regular },
  captionHandle: { fontFamily: fonts.body.bold, color: colors.ink },
  viewComments: { fontSize: 12.5, color: colors.inkFaint, fontFamily: fonts.body.medium },
});
