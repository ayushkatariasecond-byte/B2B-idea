import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BusinessProfileContent } from '../components/BusinessProfileContent';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { colors, fonts, radius } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';
import { Business, Post } from '../api/types';
import * as businessesApi from '../api/businesses';
import * as notificationsApi from '../api/notifications';
import { RootStackParamList } from '../navigation/types';
import { alert } from '../utils/alert';
import { onRealtimeEvent } from '../utils/realtimeEvents';

export function ProfileScreen() {
  const { business: me } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [business, setBusiness] = useState<Business | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    if (!me) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [businessRes, postsRes, unreadRes] = await Promise.all([
        businessesApi.getBusiness(me.id),
        businessesApi.getBusinessPosts(me.id),
        notificationsApi.getUnreadCount(),
      ]);
      setBusiness(businessRes.business);
      setPosts(postsRes.posts);
      setUnreadCount(unreadRes.count);
    } catch {
      setError("Couldn't load your profile. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    return onRealtimeEvent((event) => {
      if (event.kind === 'notification') {
        notificationsApi.getUnreadCount().then((res) => setUnreadCount(res.count));
      }
    });
  }, []);

  const showMoreMenu = () => {
    alert('More', undefined, [
      { text: `Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`, onPress: () => navigation.navigate('Notifications') },
      { text: 'Drafts & Scheduled', onPress: () => navigation.navigate('Drafts') },
      { text: 'Saved', onPress: () => navigation.navigate('Saved') },
      { text: 'Team', onPress: () => navigation.navigate('TeamMembers') },
      { text: 'Settings', onPress: () => navigation.navigate('Settings') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (!business) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Couldn't load your profile."}</Text>
        <Pressable onPress={() => { setLoading(true); load(); }} hitSlop={10} accessibilityRole="button">
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BusinessProfileContent
        business={business}
        posts={posts}
        headerAction={
          <Pressable style={styles.editButton} onPress={() => navigation.navigate('EditProfile')} accessibilityRole="button">
            <Text style={styles.editButtonText}>Edit profile</Text>
          </Pressable>
        }
        moreAction={
          <Pressable style={styles.moreButton} onPress={showMoreMenu} hitSlop={8} accessibilityLabel="More options" accessibilityRole="button">
            <Icon name="moreDots" color={colors.white} size={16} />
            {unreadCount > 0 && <View style={styles.unreadDot} />}
          </Pressable>
        }
      />
      <BottomNav active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  errorText: { color: colors.inkSoft, textAlign: 'center', fontFamily: fonts.body.medium, fontSize: 15 },
  retryText: { color: colors.gold, textAlign: 'center', fontFamily: fonts.body.bold, fontSize: 14 },
  editButton: {
    backgroundColor: colors.surfaceMuted2,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: radius.pill,
    marginBottom: 6,
  },
  editButtonText: { fontWeight: '700', fontSize: 13, color: colors.ink, fontFamily: fonts.body.bold },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
});
