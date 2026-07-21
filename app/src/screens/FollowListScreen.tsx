import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { Business } from '../api/types';
import * as businessesApi from '../api/businesses';

type Props = NativeStackScreenProps<RootStackParamList, 'FollowList'>;
type Mode = 'followers' | 'following';

export function FollowListScreen({ route, navigation }: Props) {
  const { businessId, mode: initialMode, name } = route.params;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const request = mode === 'followers' ? businessesApi.getFollowers(businessId) : businessesApi.getFollowing(businessId);
    request
      .then((res) => {
        setBusinesses(res.businesses);
        setFollowedIds(new Set(res.businesses.filter((b) => b.isFollowedByMe).map((b) => b.id)));
      })
      .catch(() => setError("Couldn't load this list. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [businessId, mode]);

  useEffect(load, [load]);

  const toggle = async (business: Business) => {
    const isFollowed = followedIds.has(business.id);
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (isFollowed) next.delete(business.id);
      else next.add(business.id);
      return next;
    });
    try {
      await businessesApi.toggleFollow(business.id);
    } catch {
      // Revert on failure so the button never lies about the real state.
      setFollowedIds((prev) => {
        const next = new Set(prev);
        if (isFollowed) next.add(business.id);
        else next.delete(business.id);
        return next;
      });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Go back" accessibilityRole="button">
          <Icon name="chevronLeft" color={colors.backIcon} size={9} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {name ?? 'Community'}
        </Text>
        <View style={{ width: 16 }} />
      </View>

      <View style={styles.tabsRow}>
        <Pressable style={styles.tab} onPress={() => setMode('followers')}>
          <Text style={[styles.tabLabel, mode === 'followers' && styles.tabLabelActive]}>Followers</Text>
          {mode === 'followers' && <View style={styles.tabUnderline} />}
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setMode('following')}>
          <Text style={[styles.tabLabel, mode === 'following' && styles.tabLabelActive]}>Following</Text>
          {mode === 'following' && <View style={styles.tabUnderline} />}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{error}</Text>
          <Pressable onPress={load} hitSlop={10} accessibilityRole="button">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</Text>
          }
          renderItem={({ item }) => {
            const isFollowed = followedIds.has(item.id);
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.push('BusinessProfile', { businessId: item.id })}
                accessibilityRole="button"
                accessibilityLabel={`View ${item.name}`}
              >
                <Avatar uri={item.avatarUrl} name={item.name} size={44} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.verified && <Icon name="checkBadge" color={colors.gold} size={13} />}
                  </View>
                  <Text style={styles.category}>@{item.handle}</Text>
                </View>
                {!item.isMe && (
                  <Pressable
                    style={[styles.followButton, isFollowed && styles.followingButton]}
                    onPress={() => toggle(item)}
                    accessibilityRole="button"
                    accessibilityLabel={isFollowed ? `Unfollow ${item.name}` : `Follow ${item.name}`}
                  >
                    <Text style={[styles.followButtonText, isFollowed && styles.followingButtonText]}>
                      {isFollowed ? 'Following' : 'Follow'}
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display.bold, fontSize: 18, color: colors.ink, flex: 1, textAlign: 'center' },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel: { fontSize: 14, color: colors.inkSoft2, fontFamily: fonts.body.semiBold },
  tabLabelActive: { color: colors.ink, fontFamily: fonts.body.bold },
  tabUnderline: { position: 'absolute', bottom: -1, height: 2, width: 68, backgroundColor: colors.gold, borderRadius: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  retryText: { color: colors.gold, textAlign: 'center', fontFamily: fonts.body.bold, fontSize: 14 },
  empty: { textAlign: 'center', color: colors.inkSoft2, marginTop: 40, fontFamily: fonts.body.medium, fontSize: 14 },
  list: { padding: 20, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 14, fontFamily: fonts.body.bold, color: colors.ink },
  category: { fontSize: 12, color: colors.inkSoft2, marginTop: 2 },
  followButton: { backgroundColor: colors.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  followingButton: { backgroundColor: colors.paper2 },
  followButtonText: { fontSize: 13, fontFamily: fonts.body.bold, color: colors.white },
  followingButtonText: { color: colors.ink },
});
