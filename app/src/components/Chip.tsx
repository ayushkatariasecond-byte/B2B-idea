import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radius } from '../theme/tokens';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export function Chip({ label, active, onPress }: ChipProps) {
  return (
    <Pressable onPress={onPress} style={[styles.base, active ? styles.active : styles.inactive]}>
      <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  active: { backgroundColor: colors.gold },
  inactive: { backgroundColor: colors.paper2 },
  label: { fontSize: 13 },
  labelActive: { fontFamily: fonts.body.bold, color: colors.white },
  labelInactive: { fontFamily: fonts.body.semiBold, color: colors.chipText },
});
