import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedPostCard } from '../components/FeedPostCard';
import { BottomNav } from '../components/BottomNav';
import { colors, fonts } from '../theme/tokens';
import { Post } from '../api/types';
import * as postsApi from '../api/posts';

type FeedTab = 'forYou' | 'following';

export function HomeFeedScreen() {
  // Measured from our own container rather than the window: on desktop web the
  // app renders inside a fixed-width phone-sized column, not the full browser window.
  const [height, setHeight] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height), []);
  const [tab, setTab] = useState<FeedTab>('forYou');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const viewedRef = useRef(new Set<string>());

  const load = useCallback(async (activeTab: FeedTab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await postsApi.getFeed(activeTab);
      setPosts(res.posts);
      setActivePostId(res.posts[0]?.id ?? null);
    } catch {
      setError('Login required for the Following feed.');
      setPosts([]);
    } finally {
      setLoading(false);
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

  return (
    <View style={styles.container} onLayout={onLayout}>
      {loading && posts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{error ?? "Nothing here yet — follow a few businesses to fill this feed."}</Text>
        </View>
      ) : height === 0 ? null : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FeedPostCard
              post={item}
              height={height}
              isActive={item.id === activePostId}
              onToggleLike={handleToggleLike}
              onShare={handleShare}
            />
          )}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        />
      )}

      <SafeAreaView style={styles.tabsWrap} edges={['top']} pointerEvents="box-none">
        <View style={styles.tabsRow}>
          <Pressable onPress={() => setTab('following')} accessibilityRole="tab" accessibilityState={{ selected: tab === 'following' }}>
            <Text style={[styles.tabLabel, tab === 'following' ? styles.tabActive : styles.tabInactive]}>Following</Text>
          </Pressable>
          <Pressable onPress={() => setTab('forYou')} accessibilityRole="tab" accessibilityState={{ selected: tab === 'forYou' }}>
            <Text style={[styles.tabLabel, tab === 'forYou' ? styles.tabActive : styles.tabInactive]}>For You</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <BottomNav active="home" dark />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: colors.white, textAlign: 'center', fontFamily: fonts.body.medium, fontSize: 15 },
  tabsWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  tabsRow: { flexDirection: 'row', justifyContent: 'center', gap: 26, paddingTop: 12 },
  tabLabel: { fontFamily: fonts.display.semiBold, fontSize: 16, paddingBottom: 6 },
  tabActive: { color: colors.white, fontFamily: fonts.display.bold, borderBottomWidth: 2, borderBottomColor: colors.gold },
  tabInactive: { color: 'rgba(255,255,255,0.6)' },
});
