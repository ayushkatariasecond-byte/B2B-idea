import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, fonts, radius } from '../theme/tokens';

interface TextFieldProps extends TextInputProps {
  label: string;
}

export function TextField({ label, style, ...rest }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={colors.inkSoft2}
        autoCapitalize="none"
        autoCorrect={false}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: fonts.body.bold,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.paper2,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.ink,
    fontFamily: fonts.body.medium,
  },
});
