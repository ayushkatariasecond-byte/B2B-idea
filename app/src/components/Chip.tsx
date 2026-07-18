import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../theme/tokens';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export function Chip({ label, active, onPress }: ChipProps) {
  if (active) {
    return (
      <Pressable onPress={onPress}>
        <LinearGradient colors={[colors.gradientGoldStart, colors.gradientGoldEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.base, styles.activeShadow]}>
          <Text style={[styles.label, styles.labelActive]}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={[styles.base, styles.inactive]}>
      <Text style={[styles.label, styles.labelInactive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  activeShadow: {
    shadowColor: colors.splashGlow2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  inactive: { backgroundColor: colors.paper2 },
  label: { fontSize: 13 },
  labelActive: { fontFamily: fonts.body.bold, color: colors.white },
  labelInactive: { fontFamily: fonts.body.semiBold, color: colors.chipText },
});
