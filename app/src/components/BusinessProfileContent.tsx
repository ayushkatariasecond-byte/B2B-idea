import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
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
            {coverUri ? <Image source={{ uri: coverUri }} style={styles.coverImage} contentFit="cover" /> : <View style={styles.coverPlaceholder} />}
            {moreAction && <View style={styles.moreWrap}>{moreAction}</View>}
          </View>

          <View style={styles.body}>
            <View style={styles.avatarRow}>
              <Avatar uri={business.avatarUrl} name={business.name} size={76} borderColor={colors.white} borderWidth={4} />
              {headerAction}
            </View>

            <View style={styles.nameRow}>
              <Text style={styles.name}>{business.name}</Text>
              <Icon name="checkBadge" color={colors.gold} size={16} />
            </View>
            <Text style={styles.handle}>
              {'@' + business.handle} · {business.category}
            </Text>
            {business.bio ? <Text style={styles.bio}>{business.bio}</Text> : null}

            <View style={styles.statsRow}>
              <Text style={styles.statText}>
                <Text style={styles.statNum}>{formatCount(business.postCount ?? posts.length)}</Text> posts
              </Text>
              <Text style={styles.statText}>
                <Text style={styles.statNum}>{formatCount(business.followerCount ?? 0)}</Text> followers
              </Text>
              <Text style={styles.statText}>
                <Text style={styles.statNum}>{formatCount(business.followingCount ?? 0)}</Text> following
              </Text>
            </View>

            {business.isMe && (
              <Pressable style={styles.analyticsButton} onPress={() => navigation.navigate('Analytics')}>
                <Icon name="barChart" color={colors.goldDeep} size={16} />
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
          <PostMedia uri={item.mediaUrl} mediaType={item.mediaType} />
        </Pressable>
      )}
      ListEmptyComponent={tab === 'posts' ? <Text style={styles.emptyGrid}>No posts yet.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  gridContent: { paddingBottom: 100 },
  gridRow: { gap: 6, paddingHorizontal: 20 },
  cover: { height: 130, backgroundColor: colors.paper2 },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: { width: '100%', height: '100%', backgroundColor: colors.avatarPlaceholder },
  moreWrap: { position: 'absolute', top: 58, right: 16 },
  body: { paddingHorizontal: 20 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -34 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  name: { fontFamily: fonts.display.bold, fontSize: 19, color: colors.ink },
  handle: { fontSize: 13, color: colors.inkSoft, marginTop: 2, fontFamily: fonts.body.regular },
  bio: { fontSize: 14, color: colors.bodyText, lineHeight: 21, marginTop: 10, fontFamily: fonts.body.regular },
  statsRow: { flexDirection: 'row', gap: 22, marginTop: 14 },
  statText: { fontSize: 13, color: colors.inkSoft2, fontFamily: fonts.body.regular },
  statNum: { fontWeight: '700', fontSize: 15, color: colors.ink, fontFamily: fonts.body.bold },
  analyticsButton: {
    marginTop: 14,
    height: 44,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.paper2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  analyticsButtonText: { fontWeight: '700', fontSize: 13, color: colors.bodyText, fontFamily: fonts.body.bold },
  tabsRow: { flexDirection: 'row', gap: 24, marginTop: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  tabLabel: { paddingBottom: 10, fontWeight: '600', fontSize: 13, color: colors.inkSoft2, fontFamily: fonts.body.semiBold },
  tabLabelActive: { color: colors.ink, fontFamily: fonts.body.bold, borderBottomWidth: 2, borderBottomColor: colors.gold },
  aboutWrap: { paddingVertical: 16 },
  aboutLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: fonts.body.bold },
  aboutValue: { fontSize: 14, color: colors.bodyText, marginTop: 4, lineHeight: 20, fontFamily: fonts.body.regular },
  tile: { flex: 1, aspectRatio: 9 / 13, borderRadius: 10, overflow: 'hidden', marginBottom: 6 },
  emptyGrid: { textAlign: 'center', color: colors.inkSoft2, marginTop: 24, fontFamily: fonts.body.medium },
});
