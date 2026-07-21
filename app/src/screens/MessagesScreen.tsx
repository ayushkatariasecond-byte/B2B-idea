import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { BottomNav } from '../components/BottomNav';
import { colors, fonts } from '../theme/tokens';
import { ThreadSummary } from '../api/types';
import * as threadsApi from '../api/threads';
import { RootStackParamList } from '../navigation/types';
import { onRealtimeEvent } from '../utils/realtimeEvents';

function formatTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ThreadAvatar({ uri, name, unread }: { uri?: string | null; name: string; unread: boolean }) {
  const inner = (
    <View style={styles.avatarRingInner}>
      <Avatar uri={uri} name={name} size={45} />
    </View>
  );
  if (unread) {
    return (
      <LinearGradient
        colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.avatarRing}
      >
        {inner}
      </LinearGradient>
    );
  }
  return <View style={[styles.avatarRing, styles.avatarRingRead]}>{inner}</View>;
}

export function MessagesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    threadsApi
      .getThreads()
      .then((res) => {
        if (active) {
          setThreads(res.threads);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError("Couldn't load your messages. Check your connection and try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  useEffect(() => {
    return onRealtimeEvent((event) => {
      if (event.kind === 'thread-message') {
        threadsApi.getThreads().then((res) => setThreads(res.threads));
      }
    });
  }, []);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.header} edges={['top']}>
        <Text style={styles.title}>Messages</Text>
        <Pressable
          onPress={() => navigation.navigate('Tabs', { screen: 'Discover' } as never)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Find a business to message"
        >
          <Icon name="mail" color={colors.ink} size={20} />
        </Pressable>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : threads.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{error ?? 'No conversations yet. Message a business from their profile.'}</Text>
          {error && (
            <Pressable onPress={() => { setLoading(true); load(); }} hitSlop={10} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate('Thread', { threadId: item.id, otherName: item.business.name })}
              accessibilityRole="button"
              accessibilityLabel={`Conversation with ${item.business.name}${item.unread ? ', unread' : ''}`}
            >
              <ThreadAvatar uri={item.business.avatarUrl} name={item.business.name} unread={item.unread} />
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.business.name}
                </Text>
                <Text style={[styles.rowLast, item.unread ? styles.rowLastUnread : styles.rowLastRead]} numberOfLines={1}>
                  {item.lastMessage?.text ?? 'Say hello 👋'}
                </Text>
              </View>
              <View style={styles.rowMeta}>
                <Text style={styles.rowTime}>{item.lastMessage ? formatTime(item.lastMessage.createdAt) : ''}</Text>
                {item.unread && (
                  <LinearGradient
                    colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.unreadDot}
                  />
                )}
              </View>
            </Pressable>
          )}
        />
      )}

      <BottomNav active="messages" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  title: { fontFamily: fonts.display.bold, fontSize: 25, letterSpacing: -0.6, color: colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  emptyText: { color: colors.inkSoft, textAlign: 'center', fontFamily: fonts.body.medium },
  retryText: { color: colors.gold, textAlign: 'center', fontFamily: fonts.body.bold, fontSize: 14 },
  list: { paddingHorizontal: 12, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11, paddingHorizontal: 8 },
  avatarRing: { width: 52, height: 52, borderRadius: 26, padding: 2, alignItems: 'center', justifyContent: 'center' },
  avatarRingRead: { backgroundColor: colors.threadReadRing },
  avatarRingInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.white,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: '700', color: colors.ink, fontFamily: fonts.body.bold },
  rowLast: { fontSize: 13, marginTop: 3, fontFamily: fonts.body.regular },
  rowLastUnread: { color: colors.ink },
  rowLastRead: { color: colors.inkFaint },
  rowMeta: { alignItems: 'flex-end', gap: 6 },
  rowTime: { fontSize: 11, color: colors.inkFaint, fontFamily: fonts.body.medium },
  unreadDot: { width: 9, height: 9, borderRadius: 4.5 },
});
