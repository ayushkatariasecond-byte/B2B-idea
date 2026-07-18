import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BusinessProfileContent } from '../components/BusinessProfileContent';
import { Icon } from '../components/Icon';
import { colors, fonts, radius } from '../theme/tokens';
import { Business, Post } from '../api/types';
import * as businessesApi from '../api/businesses';
import * as threadsApi from '../api/threads';
import { RootStackParamList } from '../navigation/types';
import { useRequireLogin } from '../hooks/useRequireLogin';
import { promptReport } from '../utils/reportPrompt';
import { alert } from '../utils/alert';

type Props = NativeStackScreenProps<RootStackParamList, 'BusinessProfile'>;

export function BusinessProfileScreen({ route, navigation }: Props) {
  const { businessId } = route.params;
  const requireLogin = useRequireLogin();
  const [business, setBusiness] = useState<Business | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const load = useCallback(async () => {
    const [businessRes, postsRes] = await Promise.all([
      businessesApi.getBusiness(businessId),
      businessesApi.getBusinessPosts(businessId),
    ]);
    setBusiness(businessRes.business);
    setPosts(postsRes.posts);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = () =>
    requireLogin(async () => {
      if (!business || followBusy) return;
      setFollowBusy(true);
      try {
        const res = await businessesApi.toggleFollow(business.id);
        setBusiness({ ...business, isFollowedByMe: res.following, followerCount: res.followerCount });
      } finally {
        setFollowBusy(false);
      }
    });

  const message = () =>
    requireLogin(async () => {
      if (!business || messaging) return;
      setMessaging(true);
      try {
        const res = await threadsApi.startThread(business.id);
        navigation.navigate('Thread', { threadId: res.threadId, otherName: business.name });
      } finally {
        setMessaging(false);
      }
    });

  const showMoreMenu = () =>
    requireLogin(() => {
      if (!business) return;
      alert(business.name, undefined, [
        {
          text: blocked ? 'Unblock' : 'Block',
          style: 'destructive',
          onPress: async () => {
            const res = await businessesApi.toggleBlock(business.id);
            setBlocked(res.blocked);
          },
        },
        { text: 'Report', onPress: () => promptReport('business', business.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    });

  if (loading || !business) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BusinessProfileContent
        business={business}
        posts={posts}
        headerAction={
          <View style={styles.actionRow}>
            <Pressable style={styles.messageButton} onPress={message} disabled={messaging} hitSlop={6} accessibilityLabel="Message this business" accessibilityRole="button">
              <Icon name="comment" color={colors.ink} size={17} />
            </Pressable>
            <Pressable
              style={[styles.followButton, business.isFollowedByMe && styles.followingButton]}
              onPress={toggleFollow}
              disabled={followBusy}
              accessibilityRole="button"
              accessibilityLabel={business.isFollowedByMe ? 'Unfollow' : 'Follow'}
            >
              <Text style={[styles.followButtonText, business.isFollowedByMe && styles.followingButtonText]}>
                {business.isFollowedByMe ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          </View>
        }
        moreAction={
          <Pressable style={styles.moreButton} onPress={showMoreMenu} hitSlop={8} accessibilityLabel="More options" accessibilityRole="button">
            <Icon name="moreDots" color={colors.white} size={16} />
          </Pressable>
        }
      />
      <SafeAreaView style={styles.backWrap} edges={['top']} pointerEvents="box-none">
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Go back" accessibilityRole="button">
          <Icon name="chevronLeft" color={colors.white} size={10} />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backWrap: { position: 'absolute', top: 0, left: 0 },
  backButton: {
    marginLeft: 16,
    marginTop: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  messageButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButton: { backgroundColor: colors.gold, paddingHorizontal: 18, paddingVertical: 9, borderRadius: radius.pill },
  followingButton: { backgroundColor: colors.paper2 },
  followButtonText: { fontWeight: '700', fontSize: 13, color: colors.white, fontFamily: fonts.body.bold },
  followingButtonText: { color: colors.ink },
});
