import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FeedPostCard } from '../components/FeedPostCard';
import { StoryTray } from '../components/StoryTray';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { colors, fonts } from '../theme/tokens';
import { Post } from '../api/types';
import * as postsApi from '../api/posts';
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
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const viewedRef = useRef(new Set<string>());

  const load = useCallback(async (activeTab: FeedTab, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await postsApi.getFeed(activeTab);
      setPosts(res.posts);
      setActivePostId(res.posts[0]?.id ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        setError(e.message);
      } else if (e instanceof ApiError && e.status === 401 && activeTab === 'following') {
        setError('Log in to see posts from businesses you follow.');
      } else {
        setError("Couldn't load your feed. Check your connection and try again.");
      }
      setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

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
            verve<Text style={styles.wordmarkDot}>.</Text>
          </Text>
          <Pressable
            onPress={() => navigation.navigate('Notifications')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Icon name="bell" color={colors.ink} size={22} />
          </Pressable>
        </View>
      </SafeAreaView>

      <View style={styles.tabsRow}>
        <Pressable onPress={() => setTab('following')} accessibilityRole="tab" accessibilityState={{ selected: tab === 'following' }}>
          <Text style={[styles.tabLabel, tab === 'following' ? styles.tabActive : styles.tabInactive]}>Following</Text>
        </Pressable>
        <Pressable onPress={() => setTab('forYou')} accessibilityRole="tab" accessibilityState={{ selected: tab === 'forYou' }}>
          <Text style={[styles.tabLabel, tab === 'forYou' ? styles.tabActive : styles.tabInactive]}>For You</Text>
        </Pressable>
      </View>

      <StoryTray />
    </View>
  );

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
          <Text style={styles.emptyText}>{error ?? "Nothing here yet — follow a few businesses to fill this feed."}</Text>
          {error && (
            <Pressable onPress={() => load(tab)} hitSlop={10} accessibilityRole="button">
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
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          refreshing={refreshing}
          onRefresh={() => load(tab, true)}
        />
      )}

      <BottomNav active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-start', paddingBottom: 32 },
  emptyText: { color: colors.inkSoft, textAlign: 'center', fontFamily: fonts.body.medium, fontSize: 15, marginTop: 40, paddingHorizontal: 32 },
  retryText: { color: colors.gold, textAlign: 'center', fontFamily: fonts.body.bold, fontSize: 14, marginTop: 14 },
  listContent: { paddingBottom: 110 },
  topBarSafe: { backgroundColor: colors.paper },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 4,
  },
  wordmark: { fontFamily: fonts.display.bold, fontSize: 20, letterSpacing: -0.4, color: colors.ink },
  wordmarkDot: { color: colors.gold },
  tabsRow: { flexDirection: 'row', justifyContent: 'center', gap: 26, paddingTop: 6, paddingBottom: 4 },
  tabLabel: { fontFamily: fonts.display.semiBold, fontSize: 16, paddingBottom: 8 },
  tabActive: { color: colors.ink, fontFamily: fonts.display.bold, borderBottomWidth: 2, borderBottomColor: colors.gold },
  tabInactive: { color: colors.inkFaint2 },
});
