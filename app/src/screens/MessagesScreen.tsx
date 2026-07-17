import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { BottomNav } from '../components/BottomNav';
import { colors, fonts } from '../theme/tokens';
import { ThreadSummary } from '../api/types';
import * as threadsApi from '../api/threads';
import { RootStackParamList } from '../navigation/types';

function formatTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function MessagesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      threadsApi.getThreads().then((res) => {
        if (active) {
          setThreads(res.threads);
          setLoading(false);
        }
      });
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.header} edges={['top']}>
        <Text style={styles.title}>Messages</Text>
        <Pressable onPress={() => navigation.navigate('Tabs', { screen: 'Discover' } as never)} hitSlop={8}>
          <Icon name="mail" color={colors.backIcon} size={20} />
        </Pressable>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : threads.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No conversations yet. Message a business from their profile.</Text>
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
            >
              <Avatar uri={item.business.avatarUrl} name={item.business.name} size={48} />
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.business.name}
                </Text>
                <Text style={styles.rowLast} numberOfLines={1}>
                  {item.lastMessage?.text ?? 'Say hello 👋'}
                </Text>
              </View>
              <View style={styles.rowMeta}>
                <Text style={styles.rowTime}>{item.lastMessage ? formatTime(item.lastMessage.createdAt) : ''}</Text>
                {item.unread && <View style={styles.unreadDot} />}
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
  header: { paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display.bold, fontSize: 26, color: colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: colors.inkSoft, textAlign: 'center', fontFamily: fonts.body.medium },
  list: { paddingHorizontal: 12, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: '700', color: colors.ink, fontFamily: fonts.body.bold },
  rowLast: { fontSize: 13, color: colors.inkSoft2, marginTop: 2, fontFamily: fonts.body.regular },
  rowMeta: { alignItems: 'flex-end', gap: 6 },
  rowTime: { fontSize: 11, color: colors.inkFaint },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
});
