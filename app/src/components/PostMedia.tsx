import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Icon } from './Icon';
import { resolveMediaUrl } from '../api/client';
import { colors } from '../theme/tokens';

interface PostMediaProps {
  uri: string;
  mediaType: 'image' | 'video';
  thumbnailUri?: string | null;
  /** Whether this is the item currently in view — only the active video actually plays. Defaults to true. */
  active?: boolean;
  style?: ViewStyle;
}

function ActiveVideo({ uri, style }: { uri: string; style?: ViewStyle }) {
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    // On web, useVideoPlayer's setup callback can run before the underlying
    // <video> element exists, so the initial play() call silently no-ops.
    // Re-issuing play() once the player/view is mounted makes autoplay reliable.
    player.play();
  }, [player]);

  return (
    <Pressable style={[styles.fill, style]} onPress={() => setMuted((m) => !m)}>
      <VideoView player={player} style={styles.fill} contentFit="cover" nativeControls={false} />
      <View style={styles.muteBadge} pointerEvents="none">
        <Icon name={muted ? 'volumeOff' : 'volumeOn'} color={colors.white} size={14} />
      </View>
    </Pressable>
  );
}

function InactiveVideoTile({ thumbnailUri, style }: { thumbnailUri?: string | null; style?: ViewStyle }) {
  const resolvedThumb = resolveMediaUrl(thumbnailUri);
  return (
    <View style={[styles.fill, style]}>
      {resolvedThumb ? (
        <Image source={{ uri: resolvedThumb }} style={styles.fill} contentFit="cover" />
      ) : (
        <View style={[styles.fill, styles.placeholder]} />
      )}
      <View style={styles.playOverlay} pointerEvents="none">
        <Icon name="play" color="rgba(255,255,255,0.92)" size={28} />
      </View>
    </View>
  );
}

export function PostMedia({ uri, mediaType, thumbnailUri, active = true, style }: PostMediaProps) {
  const resolved = resolveMediaUrl(uri);
  if (!resolved) return <View style={[styles.fill, styles.placeholder, style]} />;

  if (mediaType === 'video') {
    return active ? <ActiveVideo uri={resolved} style={style} /> : <InactiveVideoTile thumbnailUri={thumbnailUri} style={style} />;
  }

  return <Image source={{ uri: resolved }} style={[styles.fill, style] as never} contentFit="cover" transition={150} />;
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  placeholder: { backgroundColor: colors.dark },
  muteBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
