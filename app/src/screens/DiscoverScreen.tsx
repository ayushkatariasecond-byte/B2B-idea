import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { PostMedia } from '../components/PostMedia';
import { BottomNav } from '../components/BottomNav';
import { colors, fonts, radius } from '../theme/tokens';
import { Business, Post, POST_TAGS, TrendingTag } from '../api/types';
import * as postsApi from '../api/posts';
import * as businessesApi from '../api/businesses';
import { RootStackParamList } from '../navigation/types';

const FILTERS = ['Trending', ...POST_TAGS];

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  if (active) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: true }}>
        <LinearGradient
          colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.chip}
        >
          <Text style={styles.chipTextActive}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={[styles.chip, styles.chipInactive]} accessibilityRole="button" accessibilityState={{ selected: false }}>
      <Text style={styles.chipTextInactive}>{label}</Text>
    </Pressable>
  );
}

export function DiscoverScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [filter, setFilter] = useState('Trending');
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendingTags, setTrendingTags] = useState<TrendingTag[]>([]);
  const [businessMatches, setBusinessMatches] = useState<Business[]>([]);

  const isHashtagQuery = query.trim().startsWith('#');

  const load = useCallback(async (activeFilter: string, activeQuery: string) => {
    setLoading(true);
    try {
      const trimmed = activeQuery.trim();
      const res = await postsApi.discover({
        tag: activeFilter === 'Trending' ? undefined : activeFilter,
        q: trimmed.startsWith('#') ? undefined : trimmed || undefined,
        hashtag: trimmed.startsWith('#') ? trimmed.slice(1) : undefined,
      });
      setPosts(res.posts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    postsApi.getTrendingTags().then((res) => setTrendingTags(res.tags));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => load(filter, query), 250);
    return () => clearTimeout(timeout);
  }, [filter, query, load]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      setBusinessMatches([]);
      return;
    }
    const timeout = setTimeout(() => {
      businessesApi.searchBusinesses(trimmed).then((res) => setBusinessMatches(res.businesses));
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.header} edges={['top']}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.searchBar}>
          <Icon name="search" size={17} color={colors.inkMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search businesses, tags, #topics"
            placeholderTextColor={colors.inkMuted}
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search businesses, tags, or hashtags"
          />
        </View>

        {businessMatches.length > 0 && (
          <View style={styles.autocompleteBox}>
            {businessMatches.map((b) => (
              <Pressable
                key={b.id}
                style={styles.autocompleteRow}
                onPress={() => {
                  setQuery('');
                  setBusinessMatches([]);
                  navigation.navigate('BusinessProfile', { businessId: b.id });
                }}
              >
                <Avatar uri={b.avatarUrl} name={b.name} size={28} />
                <View style={styles.autocompleteNameRow}>
                  <Text style={styles.autocompleteText}>{b.name}</Text>
                  {b.verified && <Icon name="checkBadge" color={colors.gold} size={13} />}
                </View>
                <Text style={styles.autocompleteHandle}>@{b.handle}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {!query && trendingTags.length > 0 && (
          <FlatList
            horizontal
            data={trendingTags}
            keyExtractor={(item) => item.tag}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item }) => (
              <FilterChip label={`#${item.tag}`} active={false} onPress={() => setQuery(`#${item.tag}`)} />
            )}
            ListHeaderComponent={<Text style={styles.trendingLabel}>Trending: </Text>}
          />
        )}

        {!isHashtagQuery && (
          <FlatList
            horizontal
            data={FILTERS}
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item }) => <FilterChip label={item} active={item === filter} onPress={() => setFilter(item)} />}
          />
        )}
      </SafeAreaView>

      {loading && posts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No posts match yet.</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <Pressable style={styles.tile} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
              <PostMedia
                uri={item.mediaUrl}
                mediaType={item.mediaType}
                thumbnailUri={item.thumbnailUrl}
                active={false}
                style={styles.tileMediaFallback}
              />
              <LinearGradient
                colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']}
                locations={[0, 0.55]}
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              {item.trending && (
                <LinearGradient
                  colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.scoreBadge}
                >
                  <Icon name="lightning" color={colors.white} size={9} />
                  <Text style={styles.scoreBadgeText}>{item.score}</Text>
                </LinearGradient>
              )}
              <View style={styles.tileCaption}>
                <View style={styles.tileNameRow}>
                  <Text style={styles.tileBiz} numberOfLines={1}>
                    {item.business.name}
                  </Text>
                  {item.business.verified && <Icon name="checkBadge" color={colors.gold} size={11} />}
                </View>
                <Text style={styles.tileLikes}>{item.likeCount} likes</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <BottomNav active="discover" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 14 },
  title: { fontFamily: fonts.display.bold, fontSize: 26, letterSpacing: -0.6, color: colors.ink },
  searchBar: {
    height: 42,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceMuted2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, fontFamily: fonts.body.regular },
  autocompleteBox: { backgroundColor: colors.white, borderRadius: radius.smd, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden' },
  autocompleteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  autocompleteNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autocompleteText: { fontSize: 13, fontFamily: fonts.body.semiBold, color: colors.ink },
  autocompleteHandle: { fontSize: 12, color: colors.inkFaint, marginLeft: 'auto' },
  trendingLabel: { fontSize: 12, color: colors.inkMuted, fontFamily: fonts.body.semiBold, alignSelf: 'center', marginRight: 4 },
  chipRow: { gap: 8, alignItems: 'center' },
  chip: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: radius.pill },
  chipInactive: { backgroundColor: colors.surfaceMuted2 },
  chipTextActive: { fontSize: 13, fontFamily: fonts.body.bold, color: colors.white },
  chipTextInactive: { fontSize: 13, fontFamily: fonts.body.semiBold, color: colors.inkSoft },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.inkSoft, fontFamily: fonts.body.medium },
  grid: { paddingTop: 4, paddingHorizontal: 3, paddingBottom: 100, gap: 3 },
  gridRow: { gap: 3 },
  tile: { flex: 1, aspectRatio: 0.75, overflow: 'hidden', backgroundColor: colors.surfaceMuted2 },
  tileMediaFallback: { backgroundColor: colors.surfaceMuted2 },
  scoreBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
  },
  scoreBadgeText: { color: colors.white, fontSize: 10, fontFamily: fonts.display.bold },
  tileCaption: { position: 'absolute', bottom: 8, left: 8, right: 8 },
  tileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileBiz: { color: colors.white, fontSize: 12, fontFamily: fonts.display.bold },
  tileLikes: { color: 'rgba(255,255,255,0.82)', fontSize: 10, marginTop: 1, fontFamily: fonts.body.medium },
});
