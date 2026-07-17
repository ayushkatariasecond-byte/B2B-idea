import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { resolveMediaUrl } from '../api/client';
import { colors } from '../theme/tokens';

interface PostMediaProps {
  uri: string;
  mediaType: 'image' | 'video';
  style?: ViewStyle;
}

function VideoMedia({ uri, style }: { uri: string; style?: ViewStyle }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  return <VideoView player={player} style={[styles.fill, style]} nativeControls contentFit="cover" />;
}

export function PostMedia({ uri, mediaType, style }: PostMediaProps) {
  const resolved = resolveMediaUrl(uri);
  if (!resolved) return <View style={[styles.fill, styles.placeholder, style]} />;

  if (mediaType === 'video') {
    return <VideoMedia uri={resolved} style={style} />;
  }

  return <Image source={{ uri: resolved }} style={[styles.fill, style] as never} contentFit="cover" transition={150} />;
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  placeholder: { backgroundColor: colors.dark },
});
