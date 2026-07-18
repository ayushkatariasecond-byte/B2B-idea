import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PostMedia } from '../components/PostMedia';
import { Icon } from '../components/Icon';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { Post } from '../api/types';
import * as postsApi from '../api/posts';
import { alert } from '../utils/alert';

type Props = NativeStackScreenProps<RootStackParamList, 'Drafts'>;

function formatScheduled(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `Scheduled for ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function DraftsScreen({ navigation }: Props) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await postsApi.getDrafts();
    setPosts(res.posts);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const publishNow = async (post: Post) => {
    await postsApi.updatePost(post.id, { status: 'published' });
    load();
  };

  const discard = (post: Post) => {
    alert('Discard draft?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await postsApi.deletePost(post.id);
          load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Go back" accessibilityRole="button">
          <Icon name="chevronLeft" color={colors.backIcon} size={9} />
        </Pressable>
        <Text style={styles.title}>Drafts &amp; Scheduled</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No drafts or scheduled posts yet.</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.thumb}>
                <PostMedia uri={item.mediaUrl} mediaType={item.mediaType} thumbnailUri={item.thumbnailUrl} active={false} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusPill}>{item.status === 'draft' ? 'DRAFT' : 'SCHEDULED'}</Text>
                <Text style={styles.caption} numberOfLines={2}>
                  {item.caption || '(no caption)'}
                </Text>
                {item.scheduledFor && <Text style={styles.scheduled}>{formatScheduled(item.scheduledFor)}</Text>}
                <View style={styles.actions}>
                  <Pressable style={styles.actionButton} onPress={() => publishNow(item)} accessibilityRole="button">
                    <Text style={styles.actionText}>Publish now</Text>
                  </Pressable>
                  <Pressable style={[styles.actionButton, styles.discardButton]} onPress={() => discard(item)} accessibilityRole="button">
                    <Text style={[styles.actionText, styles.discardText]}>Discard</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display.bold, fontSize: 18, color: colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: colors.inkSoft, textAlign: 'center', fontFamily: fonts.body.medium },
  list: { padding: 16, gap: 14 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: colors.paper2, borderRadius: radius.md, padding: 10 },
  thumb: { width: 64, height: 90, borderRadius: 10, overflow: 'hidden' },
  statusPill: { fontSize: 10, fontFamily: fonts.body.bold, color: colors.goldDeep, letterSpacing: 0.4 },
  caption: { fontSize: 13, color: colors.ink, marginTop: 4, fontFamily: fonts.body.medium },
  scheduled: { fontSize: 11, color: colors.inkSoft2, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionButton: { backgroundColor: colors.gold, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  actionText: { fontSize: 12, fontFamily: fonts.body.bold, color: colors.white },
  discardButton: { backgroundColor: colors.line },
  discardText: { color: colors.bodyText },
});
