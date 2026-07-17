import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { resolveMediaUrl } from '../api/client';
import { colors, fonts } from '../theme/tokens';

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
  borderColor?: string;
  borderWidth?: number;
}

export function Avatar({ uri, name, size = 40, borderColor, borderWidth = 0 }: AvatarProps) {
  const resolved = resolveMediaUrl(uri);
  const dimStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth,
    borderColor: borderColor ?? 'transparent',
  };

  if (resolved) {
    return <Image source={{ uri: resolved }} style={[styles.image, dimStyle]} contentFit="cover" />;
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={[styles.placeholder, dimStyle]}>
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.avatarPlaceholder2 },
  placeholder: {
    backgroundColor: colors.avatarPlaceholder2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: fonts.display.bold,
    color: colors.goldDeep,
  },
});
