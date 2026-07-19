import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, IconName } from '../components/Icon';
import { colors, fonts } from '../theme/tokens';

/**
 * Verve — scroll-driven reopen / cold-start animation.
 *
 * Implements `design_handoff_verve_app/REOPEN_ANIMATION.md`. The user's scroll IS the
 * timeline: one Animated.ScrollView captures the gesture, its offset drives a single
 * progress value `p = clamp(scrollY / L, 0, 1)` (L = 3 × container height), and every
 * animated value below is an `interpolate(...)` off that offset using the exact stop
 * arrays from §3 of the spec. No timers, no time-based animation during the gesture —
 * only transform / opacity / color are ever animated.
 *
 * The spec calls for react-native-reanimated; we use React Native's built-in Animated
 * driven by Animated.event instead. On web (react-native-web) — the surface this app is
 * tested on — the two are visually identical for scroll-linked interpolation, and this
 * avoids adding reanimated + gesture-handler + a babel-plugin/worklet setup that isn't
 * present in this project.
 *
 * Handoff: the real app is mounted underneath this overlay (see RootNavigator). Once the
 * scroll reaches the end, the overlay fades out over ~220ms, revealing the live feed —
 * "one committed flick lands you in your feed."
 */

interface Props {
  onDone: () => void;
}

// Spec §4 coin gradient stops.
const FACE_STOPS = ['#f8e08a', '#e3b842', '#c58300', '#7c5300'];
const BACK_STOPS = ['#f2d377', '#dcae3c', '#b87a00', '#6f4a00'];

const CALLOUTS: { label: string; icon: IconName }[] = [
  { label: 'Real engagement, ranked live', icon: 'barChart' },
  { label: 'Teams & scheduling', icon: 'mail' },
  { label: 'Notifications that matter', icon: 'checkBadge' },
];

// Copy stages — hard swaps at the §3 thresholds. size in px (scaled to container width at render).
const COPY_STAGES: { at: number; text: string; size: number }[] = [
  { at: 0, text: 'MAKE NOISE.', size: 112 },
  { at: 0.18, text: 'A NEW ANGLE ON REACH', size: 56 },
  { at: 0.38, text: 'EVERY POST COUNTS', size: 60 },
  { at: 0.55, text: '', size: 60 },
  { at: 0.78, text: 'YOUR FEED.', size: 72 },
];

function copyStageFor(p: number) {
  let cur = COPY_STAGES[0];
  for (const s of COPY_STAGES) if (p >= s.at) cur = s;
  return cur;
}

export function ReopenIntro({ onDone }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  const { w: W, h: H } = size;
  const L = H * 3; // spec §1 — one committed flick spans the intro
  const ready = W > 0 && H > 0;

  const scrollY = useRef(new Animated.Value(0)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<any>(null);

  // Copy is a hard swap (not per-frame animated), so it lives in React state, updated from
  // a scroll listener only when the stage actually changes. Status-bar tint flips at .87.
  const [stage, setStage] = useState(COPY_STAGES[0]);
  const [statusDark, setStatusDark] = useState(true);
  const lastStageRef = useRef(0);
  const lastStatusRef = useRef(true);
  const finishingRef = useRef(false);
  const lastYRef = useRef(0);

  useEffect(() => {
    if (!ready) return;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;

    // "One committed flick completes the intro." We detect the scroll settling (no scroll
    // event for a beat) and, if the user has scrolled past the commit point, glide the rest
    // of the way into the feed. This works on web (wheel/trackpad, where momentum-end
    // callbacks don't fire) and native alike, since both stop emitting scroll events at rest.
    // We only ever complete forward — never yank the user backward — so a small scroll just
    // rests on a valid frame they can keep scrubbing.
    const COMMIT = 0.4;
    const completeForward = () => {
      if (finishingRef.current) return;
      const p = lastYRef.current / L;
      if (p >= COMMIT && p < 0.99) {
        const node: any = scrollRef.current;
        if (node?.scrollTo) node.scrollTo({ y: L, animated: true });
        else node?.getScrollableNode?.()?.scrollTo?.({ top: L, behavior: 'smooth' });
      }
    };

    const id = scrollY.addListener(({ value }) => {
      lastYRef.current = value;
      const p = Math.min(1, Math.max(0, value / L));

      const s = copyStageFor(p);
      if (s.at !== lastStageRef.current) {
        lastStageRef.current = s.at;
        setStage(s);
      }

      const dark = p < 0.87;
      if (dark !== lastStatusRef.current) {
        lastStatusRef.current = dark;
        setStatusDark(dark);
      }

      if (p >= 0.99 && !finishingRef.current) {
        finishingRef.current = true;
        // The one allowed non-scroll transition: dissolve the overlay to reveal the live
        // feed mounted beneath it (spec §1: "once p has reached 1 you can unmount").
        Animated.timing(exitOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onDone());
      }

      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(completeForward, 160);
    });
    return () => {
      scrollY.removeListener(id);
      if (stopTimer) clearTimeout(stopTimer);
    };
  }, [ready, L, scrollY, exitOpacity, onDone]);

  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false }),
    [scrollY]
  );

  // Everything below is derived from scrollY. `at(p) = p * L` maps a progress stop to a
  // scroll offset so the §3 arrays read one-to-one.
  const anim = useMemo(() => {
    if (!ready) return null;
    const at = (p: number) => p * L;
    const COIN = Math.min(240, Math.round(W * 0.62)); // ⌀240 @ 390, scaled to container
    const dockScale = 34 / COIN; // land as the 34px nav mark regardless of coin size

    const bg = scrollY.interpolate({
      inputRange: [at(0.15), at(0.4), at(0.58), at(0.84), at(0.96)],
      outputRange: [colors.darkGoldDeep, colors.gradientGoldEnd, colors.reopenPlum, colors.reopenPlum, colors.reopenPaper],
      extrapolate: 'clamp',
    });

    // Medallion group transform (order matters — spec §3).
    const translateX = scrollY.interpolate({
      inputRange: [at(0.78), at(1)],
      outputRange: [0, -(W / 2 - 40)],
      extrapolate: 'clamp',
    });
    const translateY = scrollY.interpolate({
      inputRange: [at(0.55), at(0.62), at(0.78), at(1)],
      outputRange: [0, -95, -95, -(H / 2 - 78)],
      extrapolate: 'clamp',
    });
    const rotateZ = scrollY.interpolate({
      inputRange: [at(0.15), at(0.3), at(0.45), at(0.55)],
      outputRange: ['0deg', '-18deg', '12deg', '0deg'],
      extrapolate: 'clamp',
    });
    const rotateY = scrollY.interpolate({
      inputRange: [at(0.15), at(0.35), at(0.55)],
      outputRange: ['0deg', '25deg', '0deg'],
      extrapolate: 'clamp',
    });
    const scale = scrollY.interpolate({
      inputRange: [at(0.15), at(0.35), at(0.55), at(0.62), at(0.78), at(1)],
      outputRange: [1, 1.12, 0.95, 0.72, 0.72, dockScale],
      extrapolate: 'clamp',
    });

    // Coin tumble: rotX 0 → −720° linear over [.15,.55].
    const rotateX = scrollY.interpolate({
      inputRange: [at(0.15), at(0.55)],
      outputRange: ['0deg', '-720deg'],
      extrapolate: 'clamp',
    });

    // Face/back hard-swap at each cos(rotX)=0 crossing (p = .20/.30/.40/.50 for turns=2).
    const faceOpacity = scrollY.interpolate({
      inputRange: [at(0.15), at(0.1999), at(0.2), at(0.2999), at(0.3), at(0.3999), at(0.4), at(0.4999), at(0.5), at(0.55)],
      outputRange: [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
      extrapolate: 'clamp',
    });
    const backOpacity = scrollY.interpolate({
      inputRange: [at(0.15), at(0.1999), at(0.2), at(0.2999), at(0.3), at(0.3999), at(0.4), at(0.4999), at(0.5), at(0.55)],
      outputRange: [0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
      extrapolate: 'clamp',
    });
    // Edge bar flashes as the coin turns edge-on — triangular peaks at the crossings.
    const edgeOpacity = scrollY.interpolate({
      inputRange: [
        at(0.15), at(0.188), at(0.2), at(0.212), at(0.288), at(0.3), at(0.312),
        at(0.388), at(0.4), at(0.412), at(0.488), at(0.5), at(0.512), at(0.55),
      ],
      outputRange: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
      extrapolate: 'clamp',
    });

    // Copy exit (only bites at p ≥ .84, i.e. "YOUR FEED." leaving).
    const copyOpacity = scrollY.interpolate({
      inputRange: [at(0.84), at(0.88)],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    const copyTranslateY = scrollY.interpolate({
      inputRange: [at(0.84), at(0.88)],
      outputRange: [0, -46],
      extrapolate: 'clamp',
    });

    // Callouts: slide + fade in staggered, all exit together over [.76,.80].
    const calloutExit = scrollY.interpolate({
      inputRange: [at(0.76), at(0.8)],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    const callouts = [0, 1, 2].map((i) => {
      const t = 0.58 + 0.06 * i;
      const tx = scrollY.interpolate({ inputRange: [at(t), at(t + 0.06)], outputRange: [-44, 0], extrapolate: 'clamp' });
      const inOpacity = scrollY.interpolate({ inputRange: [at(t), at(t + 0.06)], outputRange: [0, 1], extrapolate: 'clamp' });
      return { tx, opacity: Animated.multiply(inOpacity, calloutExit) };
    });

    const hintOpacity = scrollY.interpolate({ inputRange: [at(0.02), at(0.06)], outputRange: [1, 0], extrapolate: 'clamp' });
    const navOpacity = scrollY.interpolate({ inputRange: [at(0.88), at(0.97)], outputRange: [0, 1], extrapolate: 'clamp' });
    // Feed sharpen — budget fallback (§5): opacity .45→1 (gated hidden until .76) + scale .96→1.
    const feedOpacity = scrollY.interpolate({ inputRange: [at(0.76), at(0.8), at(1)], outputRange: [0, 0.45, 1], extrapolate: 'clamp' });
    const feedScale = scrollY.interpolate({ inputRange: [at(0.8), at(1)], outputRange: [0.96, 1], extrapolate: 'clamp' });

    return {
      COIN,
      bg,
      group: { translateX, translateY, rotateZ, rotateY, scale },
      rotateX,
      faceOpacity,
      backOpacity,
      edgeOpacity,
      copyOpacity,
      copyTranslateY,
      callouts,
      hintOpacity,
      navOpacity,
      feedOpacity,
      feedScale,
    };
  }, [ready, L, W, H, scrollY]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: exitOpacity }]} onLayout={onLayout}>
      <StatusBar style={statusDark ? 'light' : 'dark'} />

      {/* Gesture surface: a transparent scroller behind the visual stage. Dragging anywhere
          scrolls it, which drives every value above. Content height = L + H → max offset L. */}
      <Animated.ScrollView
        ref={scrollRef}
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ height: L + H }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        decelerationRate="normal"
      />

      {ready && anim && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Background cross-fade (spec applies bg to the scroller; equivalent here). */}
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: anim.bg }]} />

          {/* Feed sharpen preview (paper feed, §5 fallback: opacity + scale). */}
          <Animated.View
            style={[styles.feedPreview, { opacity: anim.feedOpacity, transform: [{ scale: anim.feedScale }] }]}
          >
            <View style={styles.feedNavSpacer} />
            {[0, 1].map((i) => (
              <View key={i} style={styles.feedCard}>
                <View style={styles.feedCardHead}>
                  <View style={styles.feedAvatar} />
                  <View style={{ flex: 1 }}>
                    <View style={[styles.feedLine, { width: '55%' }]} />
                    <View style={[styles.feedLine, { width: '32%', marginTop: 5, height: 7 }]} />
                  </View>
                </View>
                <LinearGradient
                  colors={i === 0 ? ['#6b4a2a', '#2e1f12'] : ['#3a4450', '#171c22']}
                  style={styles.feedMedia}
                />
                <View style={styles.feedCardFoot} />
              </View>
            ))}
          </Animated.View>

          {/* Copy — hard swap via state, exit fade/slide via interpolation. */}
          <Animated.View
            style={[styles.copyWrap, { opacity: anim.copyOpacity, transform: [{ translateY: anim.copyTranslateY }] }]}
            pointerEvents="none"
          >
            <Text style={[styles.copyText, { fontSize: Math.round(stage.size * (W / 390)) }]}>{stage.text}</Text>
          </Animated.View>

          {/* Callouts */}
          <View style={styles.calloutWrap} pointerEvents="none">
            {CALLOUTS.map((c, i) => (
              <Animated.View
                key={c.label}
                style={[styles.calloutRow, { opacity: anim.callouts[i].opacity, transform: [{ translateX: anim.callouts[i].tx }] }]}
              >
                <View style={styles.calloutDot}>
                  <Icon name={c.icon} size={15} color={colors.gradientGoldStart} />
                </View>
                <Text style={styles.calloutText}>{c.label}</Text>
              </Animated.View>
            ))}
          </View>

          {/* Nav bar that fades in as the coin docks into it. */}
          <Animated.View style={[styles.nav, { opacity: anim.navOpacity }]}>
            <Text style={styles.navWord}>
              verve<Text style={{ color: colors.gradientGoldEnd }}>.</Text>
            </Text>
            <LinearGradient colors={[colors.gradientGoldStart, colors.gradientGoldEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.navPill}>
              <Text style={styles.navPillText}>96</Text>
            </LinearGradient>
          </Animated.View>

          {/* Medallion group — centered, transforms in spec order. */}
          <View style={[styles.medAnchor, { left: W / 2, top: H / 2 }]}>
            <Animated.View
              style={{
                position: 'absolute',
                left: -anim.COIN / 2,
                top: -anim.COIN / 2,
                width: anim.COIN,
                height: anim.COIN,
                transform: [
                  { translateX: anim.group.translateX },
                  { translateY: anim.group.translateY },
                  { perspective: 900 },
                  { rotateZ: anim.group.rotateZ },
                  { rotateY: anim.group.rotateY },
                  { scale: anim.group.scale },
                ],
              }}
            >
              {/* Coin (takes the rotateX tumble) */}
              <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ perspective: 900 }, { rotateX: anim.rotateX }] }]}>
                <CoinFace diameter={anim.COIN} opacity={anim.faceOpacity} stops={FACE_STOPS} glyph="V" />
                <CoinFace diameter={anim.COIN} opacity={anim.backOpacity} stops={BACK_STOPS} glyph="96" sub="CREATIVITY" flipped />
              </Animated.View>
              {/* Edge bar — ignores rotateX (sibling of the coin, per spec §4) */}
              <Animated.View style={[styles.edge, { top: anim.COIN / 2 - 13, opacity: anim.edgeOpacity }]}>
                <LinearGradient colors={['#96660a', '#5d3c00']} style={StyleSheet.absoluteFill} />
                {[0.2, 0.4, 0.6, 0.8].map((f) => (
                  <View key={f} style={[styles.reed, { left: `${f * 100}%` }]} />
                ))}
              </Animated.View>
            </Animated.View>
          </View>

          {/* Scroll hint */}
          <Animated.View style={[styles.hint, { opacity: anim.hintOpacity }]} pointerEvents="none">
            <Text style={styles.hintText}>SCROLL</Text>
            <Text style={styles.hintChevron}>⌄</Text>
          </Animated.View>
        </View>
      )}
    </Animated.View>
  );
}

function CoinFace({
  diameter,
  opacity,
  stops,
  glyph,
  sub,
  flipped,
}: {
  diameter: number;
  opacity: Animated.AnimatedInterpolation<number>;
  stops: string[];
  glyph: string;
  sub?: string;
  flipped?: boolean;
}) {
  const r = diameter / 2;
  const gradId = `coin-${glyph}`;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.coinFace, { opacity, transform: flipped ? [{ scaleY: -1 }] : undefined }]}>
      <Svg width={diameter} height={diameter} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={gradId} cx="32%" cy="26%" r="85%">
            <Stop offset="0%" stopColor={stops[0]} />
            <Stop offset="38%" stopColor={stops[1]} />
            <Stop offset="68%" stopColor={stops[2]} />
            <Stop offset="100%" stopColor={stops[3]} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#${gradId})`} />
        <Circle cx={r} cy={r} r={r - diameter * 0.06} fill="none" stroke="rgba(255,240,190,0.5)" strokeWidth={1.5} />
      </Svg>
      {sub ? (
        <View style={styles.coinCenter}>
          <Text style={[styles.coinScore, { fontSize: diameter * 0.35 }]}>{glyph}</Text>
          <Text style={styles.coinScoreSub}>{sub}</Text>
        </View>
      ) : (
        <Text style={[styles.coinGlyph, { fontSize: diameter * 0.49 }]}>{glyph}</Text>
      )}
    </Animated.View>
  );
}

const GLYPH_COLOR = '#a87400';

const styles = StyleSheet.create({
  feedPreview: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.reopenPaper, paddingHorizontal: 14 },
  feedNavSpacer: { height: 108 },
  feedCard: { backgroundColor: '#ffffff', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(23,19,8,0.06)', overflow: 'hidden', marginBottom: 14 },
  feedCardHead: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  feedAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.gradientGoldStart },
  feedLine: { height: 9, borderRadius: 5, backgroundColor: 'rgba(23,19,8,0.14)' },
  feedMedia: { marginHorizontal: 12, borderRadius: 16, height: 220 },
  feedCardFoot: { height: 46 },

  copyWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  copyText: { fontFamily: fonts.display.bold, color: '#f5efe2', textAlign: 'center', letterSpacing: 0.5, lineHeight: undefined },

  calloutWrap: { position: 'absolute', left: 30, right: 30, top: '56%', gap: 16 },
  calloutRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  calloutDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(227,184,66,0.55)', backgroundColor: 'rgba(227,184,66,0.08)', alignItems: 'center', justifyContent: 'center' },
  calloutText: { fontSize: 16, fontFamily: fonts.body.bold, color: '#f5efe2', flex: 1 },

  nav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'rgba(242,239,231,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(20,14,4,0.08)',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingLeft: 68,
    paddingRight: 16,
    paddingBottom: 12,
  },
  navWord: { fontFamily: fonts.display.bold, fontSize: 21, letterSpacing: -0.5, color: '#171308' },
  navPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 100 },
  navPillText: { fontFamily: fonts.display.bold, fontSize: 13, color: '#ffffff' },

  medAnchor: { position: 'absolute', width: 0, height: 0 },
  coinFace: {
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
  },
  coinGlyph: { fontFamily: fonts.display.bold, color: GLYPH_COLOR, textShadowColor: 'rgba(255,240,185,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 },
  coinCenter: { alignItems: 'center', justifyContent: 'center' },
  coinScore: { fontFamily: fonts.display.bold, color: GLYPH_COLOR, lineHeight: undefined },
  coinScoreSub: { fontSize: 11, fontFamily: fonts.body.extraBold, letterSpacing: 3, color: '#8a6100', marginTop: 2 },

  edge: { position: 'absolute', left: -3, right: -3, height: 26, borderRadius: 13, overflow: 'hidden' },
  reed: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,224,150,0.28)' },

  hint: { position: 'absolute', bottom: 26, left: 0, right: 0, alignItems: 'center' },
  hintText: { fontSize: 10.5, fontFamily: fonts.body.extraBold, letterSpacing: 3.5, color: colors.gradientGoldStart },
  hintChevron: { fontSize: 18, color: colors.gradientGoldStart, marginTop: -4, fontWeight: '700' },
});
