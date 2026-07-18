import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../components/Icon';
import { colors, fonts } from '../theme/tokens';

interface Props {
  onDone: () => void;
}

export function SplashScreen({ onDone }: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(14)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const float1 = useRef(new Animated.Value(0)).current;
  const float2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
    Animated.timing(ctaFade, { toValue: 1, duration: 800, delay: 250, useNativeDriver: true }).start();

    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(float1, { toValue: 1, duration: 3500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float1, { toValue: 0, duration: 3500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(float2, { toValue: 1, duration: 4250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float2, { toValue: 0, duration: 4250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [fade, slide, ctaFade, spin, float1, float2]);

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const float1Style = {
    transform: [
      { translateX: float1.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) },
      { translateY: float1.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
      { scale: float1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
    ],
  };
  const float2Style = {
    transform: [
      { translateX: float2.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) },
      { translateY: float2.interpolate({ inputRange: [0, 1], outputRange: [0, 16] }) },
      { scale: float2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
    ],
  };

  return (
    <Pressable style={styles.container} onPress={onDone} accessibilityRole="button" accessibilityLabel="Tap to enter Verve">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="bg" cx="30%" cy="20%" r="75%">
            <Stop offset="0%" stopColor={colors.darkGold} />
            <Stop offset="60%" stopColor={colors.darkGoldDeep} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" />
      </Svg>

      <Animated.View style={[styles.glow1, float1Style]} pointerEvents="none">
        <Svg width={240} height={240}>
          <Defs>
            <RadialGradient id="glow1" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.splashGlow1} stopOpacity={0.5} />
              <Stop offset="70%" stopColor={colors.splashGlow1} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={120} cy={120} r={120} fill="url(#glow1)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.glow2, float2Style]} pointerEvents="none">
        <Svg width={280} height={280}>
          <Defs>
            <RadialGradient id="glow2" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.splashGlow2} stopOpacity={0.4} />
              <Stop offset="70%" stopColor={colors.splashGlow2} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={140} cy={140} r={140} fill="url(#glow2)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.ring, { transform: [{ rotate: spinDeg }] }]} pointerEvents="none">
        <Svg width={90} height={90}>
          <Circle cx={45} cy={45} r={43} stroke={colors.splashGlow1} strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="4,5" fill="none" />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.content, { opacity: fade, transform: [{ translateY: slide }] }]}>
        <Text style={styles.wordmark}>
          verve<Text style={styles.wordmarkDot}>.</Text>
        </Text>
        <LinearGradient
          colors={['transparent', colors.splashGlow1, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.divider}
        />
        <Text style={styles.headline}>Keep scrolling. Your next favorite vendor is one post away.</Text>
        <Text style={styles.subhead}>Real products, real teams, no boring decks.</Text>
      </Animated.View>

      <Animated.View style={[styles.ctaWrap, { opacity: ctaFade }]}>
        <LinearGradient
          colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ctaPill}
        >
          <Text style={styles.ctaText}>Tap to enter Verve</Text>
          <Icon name="arrowRight" color={colors.white} size={14} />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkGold,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 40,
  },
  glow1: { position: 'absolute', top: -60, left: -50 },
  glow2: { position: 'absolute', bottom: -80, right: -60 },
  ring: { position: 'absolute', top: '40%', right: '8%' },
  content: { alignItems: 'center', gap: 26 },
  wordmark: { fontFamily: fonts.display.bold, fontSize: 24, letterSpacing: -0.5, color: colors.white },
  wordmarkDot: { color: colors.splashGlow1 },
  divider: { width: 40, height: 2 },
  headline: {
    fontFamily: fonts.display.bold,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.6,
    color: colors.white,
    textAlign: 'center',
    maxWidth: 280,
  },
  subhead: { fontSize: 14, lineHeight: 21, color: colors.splashSubtext, textAlign: 'center', maxWidth: 260, fontFamily: fonts.body.regular },
  ctaWrap: { marginTop: 44, alignItems: 'center' },
  ctaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: 100,
  },
  ctaText: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.white },
});
