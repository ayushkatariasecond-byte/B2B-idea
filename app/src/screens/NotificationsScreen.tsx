import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { AppNotification } from '../api/types';
import * as notificationsApi from '../api/notifications';
import { onRealtimeEvent } from '../utils/realtimeEvents';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const MESSAGES: Record<AppNotification['type'], (name: string) => string> = {
  like: (name) => `${name} liked your post`,
  comment: (name) => `${name} commented on your post`,
  follow: (name) => `${name} started following you`,
  message: (name) => `${name} sent you a message`,
};

const ICONS: Record<AppNotification['type'], 'heartFilled' | 'comment' | 'profile' | 'mail'> = {
  like: 'heartFilled',
  comment: 'comment',
  follow: 'profile',
  message: 'mail',
};

function formatTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function NotificationsScreen({ navigation }: Props) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    notificationsApi
      .getNotifications()
      .then((res) => {
        if (!active) return;
        setNotifications(res.notifications);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Couldn't load notifications. Check your connection and try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    notificationsApi.markAllRead().catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  useEffect(() => {
    return onRealtimeEvent((event) => {
      if (event.kind !== 'notification') return;
      notificationsApi.getNotifications().then((res) => setNotifications(res.notifications));
      notificationsApi.markAllRead().catch(() => undefined);
    });
  }, []);

  const openNotification = (n: AppNotification) => {
    if (n.type === 'message' && n.threadId) {
      navigation.navigate('Thread', { threadId: n.threadId, otherName: n.actor?.name ?? 'Conversation' });
    } else if (n.postId) {
      navigation.navigate('PostDetail', { postId: n.postId });
    } else if (n.actor) {
      navigation.navigate('BusinessProfile', { businessId: n.actor.id });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Go back" accessibilityRole="button">
          <Icon name="chevronLeft" color={colors.backIcon} size={9} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {error ?? 'Nothing yet — likes, comments, follows, and messages will show up here.'}
          </Text>
          {error && (
            <Pressable onPress={() => { setLoading(true); load(); }} hitSlop={10} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openNotification(item)} accessibilityRole="button">
              <Avatar uri={item.actor?.avatarUrl} name={item.actor?.name ?? '?'} size={44} />
              <View style={styles.iconBadge}>
                <Icon name={ICONS[item.type]} color={colors.gold} size={12} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{MESSAGES[item.type](item.actor?.name ?? 'Someone')}</Text>
                <Text style={styles.rowTime}>{formatTime(item.createdAt)}</Text>
              </View>
              {!item.read && <View style={styles.unreadDot} />}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  emptyText: { color: colors.inkSoft, textAlign: 'center', fontFamily: fonts.body.medium },
  retryText: { color: colors.gold, textAlign: 'center', fontFamily: fonts.body.bold, fontSize: 14 },
  list: { paddingHorizontal: 12, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8 },
  iconBadge: {
    position: 'absolute',
    left: 32,
    top: 32,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { fontSize: 14, color: colors.ink, fontFamily: fonts.body.medium, lineHeight: 19 },
  rowTime: { fontSize: 12, color: colors.inkFaint, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
});
