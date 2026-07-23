import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FeedPostCard } from '../components/FeedPostCard';
import { StoryTray } from '../components/StoryTray';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { Chip } from '../components/Chip';
import { colors, fonts } from '../theme/tokens';
import { Cuisine, Post } from '../api/types';
import * as postsApi from '../api/posts';
import * as businessesApi from '../api/businesses';
import { ApiError } from '../api/client';
import { RootStackParamList } from '../navigation/types';

type FeedTab = 'forYou' | 'following';

export function HomeFeedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<FeedTab>('forYou');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [feedCity, setFeedCity] = useState<string | null>(null);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [cuisineSlug, setCuisineSlug] = useState<string | null>(null);
  const viewedRef = useRef(new Set<string>());

  useEffect(() => {
    businessesApi.getCuisines().then((res) => setCuisines(res.cuisines));
  }, []);

  const load = useCallback(async (activeTab: FeedTab, activeCuisine: string | null, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await postsApi.getFeed(activeTab, 1, activeTab === 'forYou' ? activeCuisine ?? undefined : undefined);
      setPosts(res.posts);
      setHasMore(res.hasMore);
      setActivePostId(res.posts[0]?.id ?? null);
      setFeedCity(res.city ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        setError(e.message);
      } else if (e instanceof ApiError && e.status === 401 && activeTab === 'following') {
        setError('Log in to see posts from businesses you follow.');
      } else if (e instanceof ApiError && e.status === 401) {
        setError('Log in to see your city’s feed.');
      } else {
        setError("Couldn't load your feed. Check your connection and try again.");
      }
      setPosts([]);
      setHasMore(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(tab, cuisineSlug);
  }, [tab, cuisineSlug, load]);

  const handleToggleLike = useCallback(async (post: Post) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) } : p))
    );
    try {
      const res = await postsApi.toggleLike(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, likedByMe: res.likedByMe, likeCount: res.likeCount } : p)));
    } catch {
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likedByMe: post.likedByMe, likeCount: post.likeCount } : p))
      );
    }
  }, []);

  const handleToggleSave = useCallback(async (post: Post) => {
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, savedByMe: !p.savedByMe } : p)));
    try {
      const res = await postsApi.toggleSave(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, savedByMe: res.saved } : p)));
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, savedByMe: post.savedByMe } : p)));
    }
  }, []);

  const handleShare = useCallback((post: Post) => {
    postsApi.recordShare(post.id).then((res) => {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, shareCount: res.shareCount } : p)));
    });
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: Post; isViewable: boolean }[] }) => {
    if (viewableItems.length > 0) {
      setActivePostId(viewableItems[0].item.id);
    }
    for (const { item } of viewableItems) {
      if (!viewedRef.current.has(item.id)) {
        viewedRef.current.add(item.id);
        postsApi.recordView(item.id).catch(() => undefined);
      }
    }
  }).current;

  const header = (
    <View>
      <SafeAreaView edges={['top']} style={styles.topBarSafe}>
        <View style={styles.topBar}>
          <Text style={styles.wordmark}>
            nibbler<Text style={styles.wordmarkDot}>.</Text>
          </Text>
          <View style={styles.headerIcons}>
            <Pressable
              onPress={() => navigation.navigate('Notifications')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Icon name="bell" color={colors.ink} size={22} strokeWidth={1.7} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Tabs', { screen: 'Messages' } as never)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Messages"
            >
              <Icon name="send" color={colors.ink} size={22} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.tabsRow}>
        <Pressable onPress={() => setTab('following')} style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: tab === 'following' }}>
          <Text style={[styles.tabLabel, tab === 'following' ? styles.tabLabelActive : styles.tabLabelInactive]}>Following</Text>
          {tab === 'following' ? (
            <LinearGradient
              colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tabUnderline}
            />
          ) : (
            <View style={styles.tabUnderline} />
          )}
        </Pressable>
        <Pressable onPress={() => setTab('forYou')} style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: tab === 'forYou' }}>
          <Text style={[styles.tabLabel, tab === 'forYou' ? styles.tabLabelActive : styles.tabLabelInactive]}>For You</Text>
          {tab === 'forYou' ? (
            <LinearGradient
              colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tabUnderline}
            />
          ) : (
            <View style={styles.tabUnderline} />
          )}
        </Pressable>
      </View>

      {tab === 'forYou' && cuisines.length > 0 && (
        <FlatList
          horizontal
          data={cuisines}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cuisineRow}
          renderItem={({ item }) => (
            <Chip label={item.name} active={cuisineSlug === item.slug} onPress={() => setCuisineSlug(cuisineSlug === item.slug ? null : item.slug)} />
          )}
          ListHeaderComponent={<Chip label="All" active={cuisineSlug === null} onPress={() => setCuisineSlug(null)} />}
        />
      )}

      <StoryTray />
    </View>
  );

  const endOfFeed = !hasMore ? (
    <Text style={styles.endFeedText}>YOU'RE ALL CAUGHT UP</Text>
  ) : null;

  const emptyMessage =
    error ?? (tab === 'forYou' && feedCity ? `No restaurants in ${feedCity} yet.` : "Nothing here yet — follow a few businesses to fill this feed.");

  return (
    <View style={styles.container}>
      {loading && posts.length === 0 ? (
        <View style={styles.center}>
          {header}
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          {header}
          <Text style={styles.emptyText}>{emptyMessage}</Text>
          {error && (
            <Pressable onPress={() => load(tab, cuisineSlug)} hitSlop={10} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FeedPostCard
              post={item}
              isActive={item.id === activePostId}
              onToggleLike={handleToggleLike}
              onToggleSave={handleToggleSave}
              onShare={handleShare}
            />
          )}
          ListHeaderComponent={header}
          ListFooterComponent={endOfFeed}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          refreshing={refreshing}
          onRefresh={() => load(tab, cuisineSlug, true)}
        />
      )}

      <BottomNav active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  center: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-start', paddingBottom: 32 },
  emptyText: { color: colors.inkSoft, textAlign: 'center', fontFamily: fonts.body.medium, fontSize: 15, marginTop: 40, paddingHorizontal: 32 },
  retryText: { color: colors.gold, textAlign: 'center', fontFamily: fonts.body.bold, fontSize: 14, marginTop: 14 },
  listContent: { paddingBottom: 110 },
  topBarSafe: { backgroundColor: colors.white },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 0,
  },
  wordmark: { fontFamily: fonts.display.bold, fontSize: 25, letterSpacing: -0.7, color: colors.ink },
  wordmarkDot: { color: colors.gold },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  tabsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 30,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  tabItem: { alignItems: 'center' },
  cuisineRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tabLabel: { fontFamily: fonts.display.semiBold, fontSize: 15 },
  tabLabelActive: { color: colors.ink, fontFamily: fonts.display.bold },
  tabLabelInactive: { color: colors.inkFaint, fontFamily: fonts.display.semiBold },
  tabUnderline: { width: 26, height: 2.5, borderRadius: 2, marginTop: 7, backgroundColor: 'transparent' },
  endFeedText: {
    textAlign: 'center',
    paddingTop: 22,
    paddingBottom: 8,
    fontSize: 11,
    fontFamily: fonts.body.extraBold,
    letterSpacing: 2.5,
    color: colors.endFeedText,
  },
});
