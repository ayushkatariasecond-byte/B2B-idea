import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../theme/tokens';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({ label, onPress, variant = 'primary', disabled, loading, style }: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const content = loading ? (
    <ActivityIndicator color={variant === 'primary' ? colors.white : colors.ink} />
  ) : (
    <Text
      style={[
        styles.label,
        variant === 'primary' && styles.labelPrimary,
        variant === 'secondary' && styles.labelSecondary,
        variant === 'ghost' && styles.labelGhost,
      ]}
    >
      {label}
    </Text>
  );

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [styles.shadow, isDisabled && styles.disabled, pressed && !isDisabled && styles.pressed, style]}
      >
        <LinearGradient colors={[colors.gradientGoldStart, colors.gradientGoldEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.base}>
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    borderRadius: radius.lg,
    shadowColor: colors.splashGlow2,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  secondary: { backgroundColor: colors.paper2 },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { fontSize: 16 },
  labelPrimary: { fontFamily: fonts.display.bold, color: colors.white },
  labelSecondary: { fontFamily: fonts.body.bold, color: colors.ink, fontSize: 15 },
  labelGhost: { fontFamily: fonts.body.bold, color: colors.ink, fontSize: 15 },
});
