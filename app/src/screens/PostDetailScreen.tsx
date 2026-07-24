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
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PostMedia } from '../components/PostMedia';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { Comment, Post } from '../api/types';
import * as postsApi from '../api/posts';
import { useAuth } from '../context/AuthContext';
import { useRequireLogin } from '../hooks/useRequireLogin';
import { promptReport } from '../utils/reportPrompt';

type Props = NativeStackScreenProps<RootStackParamList, 'PostDetail'>;

function CommentAvatar({ uri, name }: { uri?: string | null; name: string }) {
  return (
    <LinearGradient
      colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.avatarRing}
    >
      <View style={styles.avatarRingInner}>
        <Avatar uri={uri} name={name} size={27} />
      </View>
    </LinearGradient>
  );
}

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
  const [askMode, setAskMode] = useState(false);
  const [openReplyCount, setOpenReplyCount] = useState(0);

  // The post's own restaurant — they see the questions indicator and can mark answered.
  const isPostOwner = Boolean(post && me && post.businessId === me.id);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [postRes, commentsRes] = await Promise.all([postsApi.getPost(postId), postsApi.getComments(postId)]);
      setPost(postRes.post);
      setSaved(postRes.post.savedByMe);
      setComments(commentsRes.comments);
      setOpenReplyCount(commentsRes.openReplyCount ?? 0);
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
        const res = await postsApi.addComment(post.id, commentText.trim(), askMode);
        setComments((prev) => [...prev, res.comment]);
        setPost({ ...post, commentCount: post.commentCount + 1 });
        setCommentText('');
        setAskMode(false);
      } finally {
        setSending(false);
      }
    });

  const markAnswered = (comment: Comment) =>
    requireLogin(async () => {
      if (!post) return;
      const res = await postsApi.markReplyAnswered(post.id, comment.id);
      setComments((prev) => prev.map((c) => (c.id === comment.id ? res.comment : c)));
      setOpenReplyCount((n) => Math.max(0, n - 1));
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
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          locations={[0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
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
            <Text style={[styles.statValue, { color: colors.gradientGoldEnd }]}>{post.score}</Text>
            <Text style={styles.statLabel}>Score</Text>
          </View>
        </View>

        {/* Only the restaurant sees this — it's their inbox indicator, and the server
            already sorts their unanswered questions to the top of the list below. */}
        {isPostOwner && openReplyCount > 0 && (
          <View style={styles.questionsBanner}>
            <Text style={styles.questionsBannerText}>
              {openReplyCount === 1 ? '1 question needs an answer' : `${openReplyCount} questions need an answer`}
            </Text>
          </View>
        )}

        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.commentList}
          renderItem={({ item }) => {
            const canDelete = me && (me.id === item.business.id || me.id === post.businessId);
            const isOpenQuestion = item.isReply && !item.answered;
            return (
              <View style={[styles.commentRow, isOpenQuestion && styles.commentRowQuestion]}>
                <CommentAvatar uri={item.business.avatarUrl} name={item.business.name} />
                <View style={{ flex: 1 }}>
                  <View style={styles.commentWhoRow}>
                    <Text style={styles.commentWho}>{item.business.name}</Text>
                    {item.isReply && (
                      <Text style={[styles.questionTag, item.answered && styles.questionTagAnswered]}>
                        {item.answered ? 'Answered' : 'Question'}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.commentText}>{item.text}</Text>
                  {isPostOwner && isOpenQuestion && (
                    <Pressable onPress={() => markAnswered(item)} hitSlop={6} accessibilityRole="button">
                      <Text style={styles.markAnsweredText}>Mark as answered</Text>
                    </Pressable>
                  )}
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

        {/* Hidden for the restaurant's own post — they answer questions, they don't ask
            themselves one. Everyone else can flag a comment as a question. */}
        {!isPostOwner && (
          <Pressable
            onPress={() => setAskMode((v) => !v)}
            style={styles.askToggleRow}
            accessibilityRole="button"
            accessibilityState={{ selected: askMode }}
          >
            <View style={[styles.askCheckbox, askMode && styles.askCheckboxOn]}>
              {askMode && <Text style={styles.askCheckboxMark}>✓</Text>}
            </View>
            <Text style={styles.askToggleLabel}>Ask the restaurant a question</Text>
          </Pressable>
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.commentInput}
            placeholder={askMode ? 'Ask about hours, allergens, the menu...' : 'Add a comment...'}
            placeholderTextColor={colors.inkMuted}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={sendComment}
          />
          <Pressable onPress={sendComment} disabled={sending} hitSlop={8} accessibilityLabel="Send comment" accessibilityRole="button">
            <LinearGradient
              colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendButton}
            >
              <Icon name="send" color={colors.white} size={16} />
            </LinearGradient>
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
  mediaWrap: { height: '56%', flexShrink: 0, backgroundColor: colors.dark },
  topBarWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 8 },
  topBarActions: { flexDirection: 'row', gap: 10 },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaCaption: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  handle: { color: colors.white, fontFamily: fonts.display.bold, fontSize: 16 },
  caption: { color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 19, marginTop: 4, fontFamily: fonts.body.regular },
  sheet: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    marginTop: -18,
    overflow: 'hidden',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontWeight: '700', fontSize: 15, color: colors.ink, fontFamily: fonts.display.bold },
  statLabel: { fontSize: 11, color: colors.inkFaint, fontFamily: fonts.body.medium },
  commentList: { padding: 18, gap: 16, flexGrow: 1 },
  commentRow: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  commentRowQuestion: {
    backgroundColor: colors.bannerGoldBg,
    borderRadius: radius.smd,
    padding: 10,
    marginHorizontal: -10,
  },
  commentWhoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  questionTag: {
    fontSize: 10,
    fontFamily: fonts.body.extraBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.bannerGoldTitle,
  },
  questionTagAnswered: { color: colors.inkFaint2 },
  markAnsweredText: { marginTop: 6, fontSize: 12, fontFamily: fonts.body.bold, color: colors.gold },
  questionsBanner: {
    backgroundColor: colors.bannerGoldBg,
    borderWidth: 1,
    borderColor: colors.bannerGoldBorder,
    borderRadius: radius.smd,
    paddingVertical: 9,
    paddingHorizontal: 13,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  questionsBannerText: { fontSize: 13, fontFamily: fonts.body.bold, color: colors.bannerGoldTitle },
  askToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  askCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askCheckboxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  askCheckboxMark: { color: colors.white, fontSize: 11, fontFamily: fonts.body.extraBold, lineHeight: 14 },
  askToggleLabel: { fontSize: 13, fontFamily: fonts.body.medium, color: colors.inkSoft },
  avatarRing: { width: 34, height: 34, borderRadius: 17, padding: 2, alignItems: 'center', justifyContent: 'center' },
  avatarRingInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.white,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  commentWho: { fontSize: 13, fontWeight: '700', color: colors.ink, fontFamily: fonts.body.bold },
  commentText: { fontSize: 13, color: colors.inkSoft, lineHeight: 19, marginTop: 2, fontFamily: fonts.body.regular },
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
    borderTopColor: colors.hairline,
  },
  commentInput: {
    flex: 1,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted2,
    paddingHorizontal: 17,
    fontSize: 13,
    color: colors.ink,
    fontFamily: fonts.body.regular,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gradientGoldEnd,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 4,
  },
});
