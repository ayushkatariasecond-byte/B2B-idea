import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { resolveMediaUrl } from '../api/client';
import * as storiesApi from '../api/stories';

type Props = NativeStackScreenProps<RootStackParamList, 'StoryViewer'>;

const IMAGE_DURATION_MS = 5000;
const DEFAULT_VIDEO_DURATION_MS = 5000;
const TICK_MS = 50;

function formatTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function StoryVideo({ uri, paused, onDuration }: { uri: string; paused: boolean; onDuration: (ms: number) => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay' && player.duration > 0) {
      onDuration(player.duration * 1000);
    }
  });

  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  return <VideoView player={player} style={styles.media} contentFit="contain" nativeControls={false} />;
}

export function StoryViewerScreen({ route, navigation }: Props) {
  const { groups, startIndex } = route.params;
  const [groupIndex, setGroupIndex] = useState(() => Math.min(Math.max(startIndex, 0), Math.max(groups.length - 1, 0)));
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [videoDurationMs, setVideoDurationMs] = useState(DEFAULT_VIDEO_DURATION_MS);
  const viewedRef = useRef(new Set<string>());
  const leftHeld = useRef(false);
  const rightHeld = useRef(false);

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];
  const durationMs = story?.mediaType === 'video' ? videoDurationMs : IMAGE_DURATION_MS;

  const goNext = useCallback(() => {
    if (!group) {
      navigation.goBack();
      return;
    }
    if (storyIndex + 1 < group.stories.length) {
      setStoryIndex(storyIndex + 1);
    } else if (groupIndex + 1 < groups.length) {
      setGroupIndex(groupIndex + 1);
      setStoryIndex(0);
    } else {
      navigation.goBack();
    }
  }, [group, groupIndex, storyIndex, groups.length, navigation]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
    } else if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1];
      setGroupIndex(groupIndex - 1);
      setStoryIndex(Math.max(prevGroup.stories.length - 1, 0));
    }
  }, [groupIndex, storyIndex, groups]);

  // Reset the progress clock whenever the visible story changes.
  useEffect(() => {
    setElapsed(0);
    setVideoDurationMs(DEFAULT_VIDEO_DURATION_MS);
  }, [groupIndex, storyIndex]);

  // Record a view once per story, the first time it's actually shown (not just prefetched).
  useEffect(() => {
    if (!story || viewedRef.current.has(story.id)) return;
    viewedRef.current.add(story.id);
    storiesApi.viewStory(story.id).catch(() => undefined);
  }, [story]);

  // Progress clock — ticks while not paused, advances to the next story on completion.
  useEffect(() => {
    if (paused || !story) return undefined;
    const interval = setInterval(() => setElapsed((e) => e + TICK_MS), TICK_MS);
    return () => clearInterval(interval);
  }, [paused, story]);

  useEffect(() => {
    if (elapsed >= durationMs) goNext();
  }, [elapsed, durationMs, goNext]);

  if (!group || !story) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.emptyWrap} edges={['top']}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <View style={{ transform: [{ rotate: '45deg' }] }}>
              <Icon name="plus" color={colors.white} size={22} />
            </View>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  const resolvedUri = resolveMediaUrl(story.mediaUrl);

  const leftZoneProps = {
    delayLongPress: 220,
    onLongPress: () => {
      leftHeld.current = true;
      setPaused(true);
    },
    onPressOut: () => {
      if (leftHeld.current) {
        leftHeld.current = false;
        setPaused(false);
      }
    },
    onPress: () => {
      if (leftHeld.current) {
        leftHeld.current = false;
        return;
      }
      goPrev();
    },
  };

  const rightZoneProps = {
    delayLongPress: 220,
    onLongPress: () => {
      rightHeld.current = true;
      setPaused(true);
    },
    onPressOut: () => {
      if (rightHeld.current) {
        rightHeld.current = false;
        setPaused(false);
      }
    },
    onPress: () => {
      if (rightHeld.current) {
        rightHeld.current = false;
        return;
      }
      goNext();
    },
  };

  return (
    <View style={styles.container}>
      <View style={styles.mediaWrap}>
        {resolvedUri ? (
          story.mediaType === 'video' ? (
            <StoryVideo uri={resolvedUri} paused={paused} onDuration={setVideoDurationMs} />
          ) : (
            <Image source={{ uri: resolvedUri }} style={styles.media} contentFit="contain" />
          )
        ) : (
          <View style={[styles.media, styles.mediaPlaceholder]} />
        )}

        <Pressable style={styles.leftZone} accessibilityRole="button" accessibilityLabel="Previous story" {...leftZoneProps} />
        <Pressable style={styles.rightZone} accessibilityRole="button" accessibilityLabel="Next story" {...rightZoneProps} />
      </View>

      <SafeAreaView style={styles.topOverlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.progressRow} pointerEvents="none">
          {group.stories.map((s, i) => (
            <View key={s.id} style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: i < storyIndex ? '100%' : i === storyIndex ? `${Math.min(100, (elapsed / durationMs) * 100)}%` : '0%' },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.headerRow}>
          <Pressable
            style={styles.headerInfo}
            onPress={() => navigation.navigate('BusinessProfile', { businessId: group.business.id })}
            accessibilityRole="button"
            accessibilityLabel={`View ${group.business.name}'s profile`}
          >
            <Avatar uri={group.business.avatarUrl} name={group.business.name} size={32} borderColor={colors.white} borderWidth={1} />
            <View style={styles.headerText}>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {group.business.name}
                </Text>
                {group.business.verified && <Icon name="checkBadge" color={colors.gold} size={13} />}
              </View>
              <Text style={styles.headerTime}>{formatTime(story.createdAt)}</Text>
            </View>
          </Pressable>
          <Pressable style={styles.closeButton} onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <View style={{ transform: [{ rotate: '45deg' }] }}>
              <Icon name="plus" color={colors.white} size={20} />
            </View>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  emptyWrap: { padding: 16, alignItems: 'flex-end' },
  mediaWrap: { flex: 1 },
  media: { width: '100%', height: '100%' },
  mediaPlaceholder: { backgroundColor: colors.dark },
  leftZone: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '35%' },
  rightZone: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '65%' },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingTop: 8 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.white, borderRadius: 2 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 12 },
  headerText: { flex: 1 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerName: { color: colors.white, fontFamily: fonts.display.bold, fontSize: 14 },
  headerTime: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontFamily: fonts.body.medium, marginTop: 1 },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
