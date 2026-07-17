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

type Props = NativeStackScreenProps<RootStackParamList, 'BusinessProfile'>;

export function BusinessProfileScreen({ route, navigation }: Props) {
  const { businessId } = route.params;
  const [business, setBusiness] = useState<Business | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

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

  const toggleFollow = async () => {
    if (!business || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await businessesApi.toggleFollow(business.id);
      setBusiness({ ...business, isFollowedByMe: res.following, followerCount: res.followerCount });
    } finally {
      setFollowBusy(false);
    }
  };

  const message = async () => {
    if (!business || messaging) return;
    setMessaging(true);
    try {
      const res = await threadsApi.startThread(business.id);
      navigation.navigate('Thread', { threadId: res.threadId, otherName: business.name });
    } finally {
      setMessaging(false);
    }
  };

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
            <Pressable style={styles.messageButton} onPress={message} disabled={messaging} hitSlop={6}>
              <Icon name="comment" color={colors.ink} size={17} />
            </Pressable>
            <Pressable
              style={[styles.followButton, business.isFollowedByMe && styles.followingButton]}
              onPress={toggleFollow}
              disabled={followBusy}
            >
              <Text style={[styles.followButtonText, business.isFollowedByMe && styles.followingButtonText]}>
                {business.isFollowedByMe ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          </View>
        }
      />
      <SafeAreaView style={styles.backWrap} edges={['top']} pointerEvents="box-none">
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
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
