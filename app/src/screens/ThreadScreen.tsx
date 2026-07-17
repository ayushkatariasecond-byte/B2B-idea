import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '../components/Icon';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { ThreadMessage } from '../api/types';
import * as threadsApi from '../api/threads';

type Props = NativeStackScreenProps<RootStackParamList, 'Thread'>;

const POLL_MS = 4000;

export function ThreadScreen({ route, navigation }: Props) {
  const { threadId, otherName } = route.params;
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ThreadMessage>>(null);

  const load = useCallback(async () => {
    const res = await threadsApi.getMessages(threadId);
    setMessages(res.messages);
  }, [threadId]);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, POLL_MS);
      return () => clearInterval(interval);
    }, [load])
  );

  const send = async () => {
    if (!text.trim() || sending) return;
    const draft = text.trim();
    setText('');
    setSending(true);
    try {
      const res = await threadsApi.sendMessage(threadId, draft);
      setMessages((prev) => [...prev, res.message]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.header} edges={['top']}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" color={colors.backIcon} size={9} />
        </Pressable>
        <Text style={styles.headerTitle}>{otherName}</Text>
        <View style={{ width: 20 }} />
      </SafeAreaView>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <View style={[styles.bubbleRow, item.mine && styles.bubbleRowMine]}>
            <View style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={[styles.bubbleText, item.mine && styles.bubbleTextMine]}>{item.text}</Text>
            </View>
          </View>
        )}
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor={colors.inkSoft2}
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
        />
        <Pressable style={styles.sendButton} onPress={send} disabled={sending} hitSlop={8}>
          <Icon name="send" color={colors.white} size={16} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontFamily: fonts.display.bold, fontSize: 16, color: colors.ink },
  list: { padding: 16, gap: 10 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleTheirs: { backgroundColor: colors.paper2, borderTopLeftRadius: 4 },
  bubbleMine: { backgroundColor: colors.gold, borderTopRightRadius: 4 },
  bubbleText: { fontSize: 14, color: colors.ink, lineHeight: 19, fontFamily: fonts.body.regular },
  bubbleTextMine: { color: colors.white },
  inputBar: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line3,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 100,
    backgroundColor: colors.paper2,
    paddingHorizontal: 16,
    fontSize: 13,
    color: colors.ink,
    fontFamily: fonts.body.regular,
  },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
});
