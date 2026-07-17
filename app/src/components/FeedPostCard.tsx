import React from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PostMedia } from './PostMedia';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { colors, fonts } from '../theme/tokens';
import { Post } from '../api/types';
import { RootStackParamList } from '../navigation/types';

interface FeedPostCardProps {
  post: Post;
  height: number;
  onToggleLike: (post: Post) => void;
  onShare: (post: Post) => void;
}

export function FeedPostCard({ post, height, onToggleLike, onShare }: FeedPostCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleShare = async () => {
    onShare(post);
    try {
      await Share.share({ message: `${post.business.name} on Verve: ${post.caption}` });
    } catch {
      // user dismissed share sheet; nothing to do
    }
  };

  return (
    <View style={{ height, width: '100%' }}>
      <View style={StyleSheet.absoluteFill}>
        <PostMedia uri={post.mediaUrl} mediaType={post.mediaType} />
      </View>

      <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={styles.topScrim} pointerEvents="none" />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']} style={styles.bottomScrim} pointerEvents="none" />

      <View style={styles.rail}>
        <Pressable style={styles.railItem} onPress={() => onToggleLike(post)} hitSlop={10}>
          <Icon name={post.likedByMe ? 'heartFilled' : 'heart'} color={post.likedByMe ? colors.gold : colors.white} size={30} />
          <Text style={styles.railLabel}>{post.likeCount}</Text>
        </Pressable>
        <Pressable style={styles.railItem} onPress={() => navigation.navigate('PostDetail', { postId: post.id })} hitSlop={10}>
          <Icon name="comment" color={colors.white} size={28} />
          <Text style={styles.railLabel}>{post.commentCount}</Text>
        </Pressable>
        <Pressable style={styles.railItem} onPress={handleShare} hitSlop={10}>
          <Icon name="send" color={colors.white} size={27} />
          <Text style={styles.railLabel}>{post.shareCount}</Text>
        </Pressable>
        <Pressable
          style={styles.avatarButton}
          onPress={() => navigation.navigate('BusinessProfile', { businessId: post.businessId })}
        >
          <Avatar uri={post.business.avatarUrl} name={post.business.name} size={40} />
        </Pressable>
      </View>

      <Pressable
        style={styles.captionWrap}
        onPress={() => navigation.navigate('BusinessProfile', { businessId: post.businessId })}
      >
        {post.trending && (
          <View style={styles.trendingPill}>
            <Text style={styles.trendingText}>TRENDING · {post.score} SCORE</Text>
          </View>
        )}
        <Text style={styles.handle}>{'@' + post.business.handle}</Text>
        <Text style={styles.tag}>{post.tag}</Text>
        <Text style={styles.caption} numberOfLines={3}>
          {post.caption}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 220 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 320 },
  rail: { position: 'absolute', right: 12, bottom: 130, alignItems: 'center', gap: 22 },
  railItem: { alignItems: 'center', gap: 4 },
  railLabel: { color: colors.white, fontSize: 12, fontWeight: '700', fontFamily: fonts.body.bold },
  avatarButton: { borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: colors.gold },
  captionWrap: { position: 'absolute', left: 16, right: 90, bottom: 34 },
  trendingPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.gold,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 100,
    marginBottom: 8,
  },
  trendingText: { color: colors.white, fontFamily: fonts.display.bold, fontSize: 11 },
  handle: { color: colors.white, fontFamily: fonts.display.bold, fontSize: 16 },
  tag: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: fonts.body.medium, marginTop: 2 },
  caption: { color: colors.white, fontSize: 14, lineHeight: 19.6, marginTop: 6, fontFamily: fonts.body.regular },
});
