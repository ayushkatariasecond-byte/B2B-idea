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

type Props = NativeStackScreenProps<RootStackParamList, 'Saved'>;

export function SavedPostsScreen({ navigation }: Props) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      postsApi.getSaved().then((res) => {
        setPosts(res.posts);
        setLoading(false);
      });
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Go back" accessibilityRole="button">
          <Icon name="chevronLeft" color={colors.backIcon} size={9} />
        </Pressable>
        <Text style={styles.title}>Saved</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Posts you save will show up here.</Text>
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
              <PostMedia uri={item.mediaUrl} mediaType={item.mediaType} thumbnailUri={item.thumbnailUrl} active={false} />
            </Pressable>
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
  grid: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 40, gap: 6 },
  gridRow: { gap: 6 },
  tile: { flex: 1, aspectRatio: 9 / 13, borderRadius: radius.sm, overflow: 'hidden', marginBottom: 6 },
});
