import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from '../components/Icon';
import { Chip } from '../components/Chip';
import { PostMedia } from '../components/PostMedia';
import { BottomNav } from '../components/BottomNav';
import { colors, fonts, radius } from '../theme/tokens';
import { Post, POST_TAGS } from '../api/types';
import * as postsApi from '../api/posts';
import { RootStackParamList } from '../navigation/types';

const FILTERS = ['Trending', ...POST_TAGS];

export function DiscoverScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [filter, setFilter] = useState('Trending');
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (activeFilter: string, activeQuery: string) => {
    setLoading(true);
    try {
      const res = await postsApi.discover({ tag: activeFilter === 'Trending' ? undefined : activeFilter, q: activeQuery.trim() || undefined });
      setPosts(res.posts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => load(filter, query), 250);
    return () => clearTimeout(timeout);
  }, [filter, query, load]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.header} edges={['top']}>
        <Text style={styles.title}>Discover</Text>
        <View style={styles.searchBar}>
          <Icon name="search" size={17} color={colors.inkSoft} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search businesses, tags, topics"
            placeholderTextColor={colors.inkSoft2}
            value={query}
            onChangeText={setQuery}
          />
        </View>
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => <Chip label={item} active={item === filter} onPress={() => setFilter(item)} />}
        />
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
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <Pressable style={styles.tile} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
              <PostMedia uri={item.mediaUrl} mediaType={item.mediaType} thumbnailUri={item.thumbnailUrl} active={false} />
              <View style={[StyleSheet.absoluteFill, styles.tileScrim]} pointerEvents="none" />
              {item.trending && (
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreBadgeText}>{item.score}</Text>
                </View>
              )}
              <View style={styles.tileCaption}>
                <Text style={styles.tileBiz} numberOfLines={1}>
                  {item.business.name}
                </Text>
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
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, gap: 12 },
  title: { fontFamily: fonts.display.bold, fontSize: 26, color: colors.ink },
  searchBar: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.paper2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, fontFamily: fonts.body.regular },
  chipRow: { gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.inkSoft, fontFamily: fonts.body.medium },
  grid: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 100, gap: 8 },
  gridRow: { gap: 8 },
  tile: { flex: 1, aspectRatio: 9 / 13, borderRadius: radius.md, overflow: 'hidden' },
  tileScrim: { backgroundColor: 'rgba(0,0,0,0.28)' },
  scoreBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.gold,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 100,
  },
  scoreBadgeText: { color: colors.white, fontSize: 10, fontFamily: fonts.display.bold },
  tileCaption: { position: 'absolute', bottom: 8, left: 8, right: 8 },
  tileBiz: { color: colors.white, fontSize: 12, fontFamily: fonts.display.bold },
  tileLikes: { color: 'rgba(255,255,255,0.8)', fontSize: 10, marginTop: 1, fontFamily: fonts.body.medium },
});
