import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { PostMedia } from './PostMedia';
import { resolveMediaUrl } from '../api/client';
import { colors, fonts, radius } from '../theme/tokens';
import { Business, Post } from '../api/types';
import { RootStackParamList } from '../navigation/types';

interface BusinessProfileContentProps {
  business: Business;
  posts: Post[];
  headerAction?: React.ReactNode;
  moreAction?: React.ReactNode;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

export function BusinessProfileContent({ business, posts, headerAction, moreAction }: BusinessProfileContentProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<'posts' | 'about'>('posts');
  const coverUri = resolveMediaUrl(business.coverUrl);

  return (
    <FlatList
      data={tab === 'posts' ? posts : []}
      keyExtractor={(item) => item.id}
      numColumns={3}
      contentContainerStyle={styles.gridContent}
      columnWrapperStyle={posts.length > 0 && tab === 'posts' ? styles.gridRow : undefined}
      ListHeaderComponent={
        <View>
          <View style={styles.cover}>
            {coverUri && <Image source={{ uri: coverUri }} style={styles.coverImage} contentFit="cover" />}
            {moreAction && <View style={styles.moreWrap}>{moreAction}</View>}
          </View>

          <View style={styles.body}>
            <View style={styles.avatarRow}>
              <LinearGradient
                colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarRing}
              >
                <View style={styles.avatarInnerBorder}>
                  <Avatar uri={business.avatarUrl} name={business.name} size={70} />
                </View>
              </LinearGradient>
              {headerAction}
            </View>

            <View style={styles.nameRow}>
              <Text style={styles.name}>{business.name}</Text>
              {business.verified && <Icon name="checkBadge" color={colors.gold} size={17} />}
            </View>
            <Text style={styles.handle}>
              {'@' + business.handle} · {business.category}
            </Text>
            {business.bio ? <Text style={styles.bio}>{business.bio}</Text> : null}

            <View style={styles.statsRow}>
              <Text style={styles.statText}>
                <Text style={styles.statNum}>{formatCount(business.postCount ?? posts.length)}</Text> posts
              </Text>
              <Pressable
                onPress={() => navigation.navigate('FollowList', { businessId: business.id, mode: 'followers', name: business.name })}
                accessibilityRole="button"
                accessibilityLabel="View followers"
              >
                <Text style={styles.statText}>
                  <Text style={styles.statNum}>{formatCount(business.followerCount ?? 0)}</Text> followers
                </Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('FollowList', { businessId: business.id, mode: 'following', name: business.name })}
                accessibilityRole="button"
                accessibilityLabel="View following"
              >
                <Text style={styles.statText}>
                  <Text style={styles.statNum}>{formatCount(business.followingCount ?? 0)}</Text> following
                </Text>
              </Pressable>
            </View>

            {business.isMe && (
              <Pressable style={styles.analyticsButton} onPress={() => navigation.navigate('Analytics')}>
                <Icon name="barChart" color={colors.gradientGoldEnd} size={16} />
                <Text style={styles.analyticsButtonText}>View Analytics</Text>
              </Pressable>
            )}

            <View style={styles.tabsRow}>
              <Pressable onPress={() => setTab('posts')}>
                <Text style={[styles.tabLabel, tab === 'posts' && styles.tabLabelActive]}>Posts</Text>
              </Pressable>
              <Pressable onPress={() => setTab('about')}>
                <Text style={[styles.tabLabel, tab === 'about' && styles.tabLabelActive]}>About</Text>
              </Pressable>
            </View>

            {tab === 'about' && (
              <View style={styles.aboutWrap}>
                <Text style={styles.aboutLabel}>Category</Text>
                <Text style={styles.aboutValue}>{business.category}</Text>
                <Text style={[styles.aboutLabel, { marginTop: 12 }]}>About</Text>
                <Text style={styles.aboutValue}>{business.bio || 'No description yet.'}</Text>
              </View>
            )}
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.tile} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
          <PostMedia
            uri={item.mediaUrl}
            mediaType={item.mediaType}
            thumbnailUri={item.thumbnailUrl}
            active={false}
            style={styles.tileMediaFallback}
          />
        </Pressable>
      )}
      ListEmptyComponent={tab === 'posts' ? <Text style={styles.emptyGrid}>No posts yet.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  gridContent: { paddingBottom: 100, gap: 3 },
  gridRow: { gap: 3, paddingHorizontal: 3 },
  cover: { height: 130, backgroundColor: colors.surfaceMuted2 },
  coverImage: { width: '100%', height: '100%' },
  moreWrap: { position: 'absolute', top: 56, right: 14 },
  body: { paddingHorizontal: 20 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -34 },
  avatarRing: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center' },
  avatarInnerBorder: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  name: { fontFamily: fonts.display.bold, fontSize: 20, letterSpacing: -0.3, color: colors.ink },
  handle: { fontSize: 13, color: colors.inkSoft, marginTop: 3, fontFamily: fonts.body.regular },
  bio: { fontSize: 14, color: colors.captionText, lineHeight: 21.7, marginTop: 11, fontFamily: fonts.body.regular },
  statsRow: { flexDirection: 'row', gap: 24, marginTop: 16 },
  statText: { fontSize: 13, color: colors.inkFaint, fontFamily: fonts.body.regular },
  statNum: { fontWeight: '700', fontSize: 15, color: colors.ink, fontFamily: fonts.display.bold },
  analyticsButton: {
    marginTop: 16,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  analyticsButtonText: { fontWeight: '700', fontSize: 13.5, color: colors.ink, fontFamily: fonts.body.bold },
  tabsRow: { flexDirection: 'row', gap: 26, marginTop: 22, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  tabLabel: {
    paddingBottom: 11,
    fontWeight: '600',
    fontSize: 13,
    color: colors.inkFaint,
    fontFamily: fonts.body.semiBold,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabLabelActive: { color: colors.ink, fontFamily: fonts.body.bold, borderBottomColor: colors.gold },
  aboutWrap: { paddingVertical: 16 },
  aboutLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: fonts.body.bold },
  aboutValue: { fontSize: 14, color: colors.captionText, marginTop: 4, lineHeight: 20, fontFamily: fonts.body.regular },
  tile: { flex: 1, aspectRatio: 0.75, overflow: 'hidden', backgroundColor: colors.surfaceMuted2 },
  tileMediaFallback: { backgroundColor: colors.surfaceMuted2 },
  emptyGrid: { textAlign: 'center', color: colors.inkFaint, marginTop: 24, fontFamily: fonts.body.medium },
});
