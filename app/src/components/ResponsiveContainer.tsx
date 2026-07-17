import React from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/tokens';

const PHONE_WIDTH = 430;
const DESKTOP_BREAKPOINT = 560;

/**
 * The design is a mobile app; on an actual phone (or a narrow mobile browser)
 * it should fill the screen as-is. On a wide desktop browser it needs to stay
 * phone-width and centered instead of stretching full-bleed, same treatment
 * Threads/Twitter's web apps give their mobile-first layouts.
 */
export function ResponsiveContainer({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web' || width < DESKTOP_BREAKPOINT) {
    return <>{children}</>;
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.phone}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper2,
  },
  phone: {
    width: PHONE_WIDTH,
    height: '90%',
    maxHeight: 900,
    borderRadius: 24,
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
  },
});
