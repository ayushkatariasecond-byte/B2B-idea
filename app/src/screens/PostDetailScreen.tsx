import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PostMedia } from '../components/PostMedia';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { Comment, Post } from '../api/types';
import * as postsApi from '../api/posts';
import { useAuth } from '../context/AuthContext';
import { useRequireLogin } from '../hooks/useRequireLogin';
import { promptReport } from '../utils/reportPrompt';

type Props = NativeStackScreenProps<RootStackParamList, 'PostDetail'>;

export function PostDetailScreen({ route, navigation }: Props) {
  const { postId } = route.params;
  const { business: me } = useAuth();
  const requireLogin = useRequireLogin();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [postRes, commentsRes] = await Promise.all([postsApi.getPost(postId), postsApi.getComments(postId)]);
      setPost(postRes.post);
      setSaved(postRes.post.savedByMe);
      setComments(commentsRes.comments);
      postsApi.recordView(postId).catch(() => undefined);
    } catch {
      setError("Couldn't load this post. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleLike = () =>
    requireLogin(async () => {
      if (!post) return;
      const prevLiked = post.likedByMe;
      const prevCount = post.likeCount;
      setPost({ ...post, likedByMe: !prevLiked, likeCount: prevCount + (prevLiked ? -1 : 1) });
      try {
        const res = await postsApi.toggleLike(post.id);
        setPost((p) => (p ? { ...p, likedByMe: res.likedByMe, likeCount: res.likeCount } : p));
      } catch {
        setPost((p) => (p ? { ...p, likedByMe: prevLiked, likeCount: prevCount } : p));
      }
    });

  const toggleSave = () =>
    requireLogin(async () => {
      if (!post) return;
      const res = await postsApi.toggleSave(post.id);
      setSaved(res.saved);
    });

  const sendComment = () =>
    requireLogin(async () => {
      if (!commentText.trim() || !post) return;
      setSending(true);
      try {
        const res = await postsApi.addComment(post.id, commentText.trim());
        setComments((prev) => [...prev, res.comment]);
        setPost({ ...post, commentCount: post.commentCount + 1 });
        setCommentText('');
      } finally {
        setSending(false);
      }
    });

  const removeComment = (comment: Comment) =>
    requireLogin(async () => {
      if (!post) return;
      await postsApi.deleteComment(post.id, comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      setPost({ ...post, commentCount: Math.max(0, post.commentCount - 1) });
    });

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>{error ?? "Couldn't load this post."}</Text>
        <Pressable onPress={load} hitSlop={10} accessibilityRole="button">
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mediaWrap}>
        <PostMedia uri={post.mediaUrl} mediaType={post.mediaType} />
        <View style={[StyleSheet.absoluteFill, styles.mediaScrim]} pointerEvents="none" />
        <SafeAreaView style={styles.topBarWrap} edges={['top']}>
          <View style={styles.topBar}>
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Go back" accessibilityRole="button">
              <Icon name="chevronLeft" color={colors.white} size={10} />
            </Pressable>
            <View style={styles.topBarActions}>
              <Pressable style={styles.backButton} onPress={toggleSave} hitSlop={10} accessibilityLabel={saved ? 'Unsave post' : 'Save post'} accessibilityRole="button">
                <Icon name="star" color={saved ? colors.gold : colors.white} size={16} />
              </Pressable>
              <Pressable
                style={styles.backButton}
                onPress={() => requireLogin(() => promptReport('post', post.id))}
                hitSlop={10}
                accessibilityLabel="Report post"
                accessibilityRole="button"
              >
                <Icon name="moreDots" color={colors.white} size={16} />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
        <View style={styles.mediaCaption}>
          <View style={styles.handleRow}>
            <Text style={styles.handle}>{'@' + post.business.handle}</Text>
            {post.business.verified && <Icon name="checkBadge" color={colors.gold} size={14} />}
          </View>
          <Text style={styles.caption}>{post.caption}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.statsRow}>
          <Pressable style={styles.stat} onPress={toggleLike} accessibilityRole="button" accessibilityLabel="Like this post">
            <Icon name={post.likedByMe ? 'heartFilled' : 'heart'} color={post.likedByMe ? colors.gold : colors.ink} size={18} />
            <Text style={styles.statValue}>{post.likeCount}</Text>
            <Text style={styles.statLabel}>Likes</Text>
          </Pressable>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{post.commentCount}</Text>
            <Text style={styles.statLabel}>Comments</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{post.shareCount}</Text>
            <Text style={styles.statLabel}>Shares</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.goldDeep }]}>{post.score}</Text>
            <Text style={styles.statLabel}>Score</Text>
          </View>
        </View>

        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.commentList}
          renderItem={({ item }) => {
            const canDelete = me && (me.id === item.business.id || me.id === post.businessId);
            return (
              <View style={styles.commentRow}>
                <Avatar uri={item.business.avatarUrl} name={item.business.name} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.commentWho}>{item.business.name}</Text>
                  <Text style={styles.commentText}>{item.text}</Text>
                </View>
                {canDelete && (
                  <Pressable onPress={() => removeComment(item)} hitSlop={8} accessibilityLabel="Delete comment" accessibilityRole="button">
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyComments}>Be the first to comment.</Text>}
        />

        <View style={styles.inputBar}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            placeholderTextColor={colors.inkSoft2}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={sendComment}
          />
          <Pressable style={styles.sendButton} onPress={sendComment} disabled={sending} hitSlop={8} accessibilityLabel="Send comment" accessibilityRole="button">
            <Icon name="send" color={colors.white} size={16} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark, padding: 32, gap: 14 },
  errorText: { color: colors.white, textAlign: 'center', fontFamily: fonts.body.medium, fontSize: 15 },
  retryText: { color: colors.gold, textAlign: 'center', fontFamily: fonts.body.bold, fontSize: 14 },
  container: { flex: 1, backgroundColor: colors.dark },
  mediaWrap: { height: '56%', flexShrink: 0 },
  mediaScrim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  topBarWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 8 },
  topBarActions: { flexDirection: 'row', gap: 10 },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaCaption: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  handle: { color: colors.white, fontFamily: fonts.display.bold, fontSize: 15 },
  caption: { color: colors.white, fontSize: 13, lineHeight: 18, marginTop: 4, fontFamily: fonts.body.regular },
  sheet: { flex: 1, backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: -18, overflow: 'hidden' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line2,
  },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontWeight: '700', fontSize: 14, color: colors.ink, fontFamily: fonts.body.bold },
  statLabel: { fontSize: 11, color: colors.inkSoft2, fontFamily: fonts.body.medium },
  commentList: { padding: 18, gap: 16, flexGrow: 1 },
  commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentWho: { fontSize: 13, fontWeight: '700', color: colors.ink, fontFamily: fonts.body.bold },
  commentText: { fontSize: 13, color: colors.bodyText, lineHeight: 18, marginTop: 2, fontFamily: fonts.body.regular },
  deleteText: { fontSize: 11, color: '#b3261e', fontFamily: fonts.body.semiBold },
  emptyComments: { color: colors.inkSoft2, textAlign: 'center', marginTop: 24, fontFamily: fonts.body.medium },
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
  commentInput: {
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
