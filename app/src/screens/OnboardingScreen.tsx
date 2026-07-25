import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { PrimaryButton } from '../components/PrimaryButton';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { alert } from '../utils/alert';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

// Short, punchy rotation — cross-faded on a timer instead of the old scroll-driven intro.
const HEADLINES = ['Get hungry.', 'Find it. Crave it. Go eat it.', "Your city's best bites, one video away."];
const ROTATE_MS = 3200;

export function OnboardingScreen({ navigation }: Props) {
  const { loginAsGuest } = useAuth();
  const insets = useSafeAreaInsets();
  const [guestLoading, setGuestLoading] = useState(false);
  const [headlineIndex, setHeadlineIndex] = useState(0);

  const entrance = useRef(new Animated.Value(0)).current;
  const headlineOpacity = useRef(new Animated.Value(1)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [entrance, float]);

  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(headlineOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
        setHeadlineIndex((i) => (i + 1) % HEADLINES.length);
        Animated.timing(headlineOpacity, { toValue: 1, duration: 360, useNativeDriver: true }).start();
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [headlineOpacity]);

  const onGuest = async () => {
    setGuestLoading(true);
    try {
      await loginAsGuest();
    } catch (e) {
      // Surface what actually failed, the way every other auth screen does
      // (LoginScreen/SignupScreen both use this exact ApiError check).
      //
      // This previously swallowed the error entirely and always said "Something went wrong",
      // which cost real debugging time during an outage: the backend's database credentials
      // were invalid, so every auth path was returning a server error, but the guest button
      // reported the same generic sentence it would have shown for a network drop, a 429, or
      // a bad response. The message the server actually sent — and ApiError's "can't reach
      // the server" case, which points at a completely different cause — never reached the
      // screen. Guest is the first thing a new visitor taps, so it's the worst place to hide
      // the reason.
      alert('Could not continue', e instanceof ApiError ? e.message : 'Something went wrong starting a guest session. Please try again.');
      setGuestLoading(false);
    }
  };

  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -16] });
  const entranceStyle = {
    opacity: entrance,
    transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <RadialGradient id="hero" cx="50%" cy="0%" r="85%">
              <Stop offset="0%" stopColor={colors.darkGold} />
              <Stop offset="100%" stopColor={colors.darkGoldDeep} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="0%" r="75%" fill="url(#hero)" />
        </Svg>

        <Animated.View style={[styles.glow, { transform: [{ translateY: floatY }] }]} pointerEvents="none">
          <Svg width={260} height={260}>
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={colors.splashGlow1} stopOpacity={0.35} />
                <Stop offset="70%" stopColor={colors.splashGlow1} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={130} cy={130} r={130} fill="url(#glow)" />
          </Svg>
        </Animated.View>

        <View style={styles.navbar}>
          <Text style={styles.wordmark}>
            nibbler<Text style={{ color: colors.gradientGoldEnd }}>.</Text>
          </Text>
          <View style={styles.navActions}>
            <Pressable onPress={() => navigation.navigate('Login')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.navSignIn}>Sign in</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Signup')} accessibilityRole="button">
              <LinearGradient
                colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.navCta}
              >
                <Text style={styles.navCtaText}>Get Started</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        <Animated.View style={[styles.heroBody, entranceStyle]}>
          <Animated.Text style={[styles.headline, { opacity: headlineOpacity }]}>{HEADLINES[headlineIndex]}</Animated.Text>
        </Animated.View>
      </SafeAreaView>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.subhead}>
          Short videos from real restaurants in your city — see what&apos;s cooking before you decide where to eat.
        </Text>

        <View style={styles.ctaWrap}>
          <PrimaryButton label="Get Started" onPress={() => navigation.navigate('Signup')} />
          <PrimaryButton label="I already have an account" variant="ghost" onPress={() => navigation.navigate('Login')} />
        </View>

        <Text
          style={styles.guestLink}
          onPress={guestLoading ? undefined : onGuest}
          accessibilityRole="button"
        >
          {guestLoading ? 'One sec…' : 'Continue as guest'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.dark },
  topSafe: { flex: 1, overflow: 'hidden' },
  glow: { position: 'absolute', top: -60, right: -60 },

  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  wordmark: { fontFamily: fonts.display.bold, fontSize: 20, letterSpacing: -0.5, color: colors.white },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  navSignIn: { fontFamily: fonts.body.bold, fontSize: 14, color: colors.splashSubtext },
  navCta: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: radius.pill },
  navCtaText: { fontFamily: fonts.display.bold, fontSize: 13, color: colors.white },

  heroBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  headline: {
    fontFamily: fonts.display.bold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.8,
    color: colors.white,
    textAlign: 'center',
    maxWidth: 320,
  },

  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 28,
    paddingTop: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
  subhead: {
    fontFamily: fonts.body.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: 22,
  },
  ctaWrap: { gap: 10 },
  guestLink: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: fonts.body.medium,
    fontSize: 13,
    color: colors.inkFaint2,
  },
});
