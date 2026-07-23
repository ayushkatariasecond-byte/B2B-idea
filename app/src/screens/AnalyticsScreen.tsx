import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '../components/Icon';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { AnalyticsResponse } from '../api/types';
import * as analyticsApi from '../api/analytics';

type Props = NativeStackScreenProps<RootStackParamList, 'Analytics'>;

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const CHART_HEIGHT = 104;

function deltaLabel(value: number, suffix: string): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value}${suffix} vs last month`;
}

export function AnalyticsScreen({ navigation }: Props) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    analyticsApi
      .getMyAnalytics()
      .then(setData)
      .catch(() => setError("Couldn't load analytics. Check your connection and try again."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Couldn't load analytics."}</Text>
        <Pressable onPress={load} hitSlop={10} accessibilityRole="button">
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const ringOffset = RING_CIRCUMFERENCE * (1 - data.creativityScore / 100);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Icon name="chevronLeft" color={colors.ink} size={9} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.headerTitle}>Analytics</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statCardLabel}>Views (30d)</Text>
            <Text style={styles.statCardValue}>{data.views30d.toLocaleString()}</Text>
            <Text style={styles.statCardDelta}>{deltaLabel(data.viewsDeltaPct, '%')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statCardLabel}>Engagement</Text>
            <Text style={styles.statCardValue}>{data.engagementPct}%</Text>
            <Text style={styles.statCardDelta}>{deltaLabel(data.engagementDeltaPts, 'pt')}</Text>
          </View>
        </View>

        <LinearGradient
          colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.scoreCard}
        >
          <View>
            <Text style={styles.scoreLabel}>Creativity Score</Text>
            <Text style={styles.scoreValue}>
              {data.creativityScore}
              <Text style={styles.scoreOutOf}> / 100</Text>
            </Text>
            <Text style={styles.scorePercentile}>Top {data.percentileTop}% of restaurants on Nibbler</Text>
          </View>
          <Svg width={62} height={62} viewBox="0 0 62 62">
            <Circle cx={31} cy={31} r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={6} />
            <Circle
              cx={31}
              cy={31}
              r={RING_RADIUS}
              fill="none"
              stroke="#ffffff"
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 31 31)"
            />
          </Svg>
        </LinearGradient>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Weekly views</Text>
          <View style={styles.chartRow}>
            {data.weeklyViews.map((w) =>
              w.isCurrent ? (
                <View key={w.label} style={styles.chartCol}>
                  <LinearGradient
                    colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.chartBar, { height: `${w.heightPct}%` }]}
                  />
                  <Text style={styles.chartLabel}>{w.label}</Text>
                </View>
              ) : (
                <View key={w.label} style={styles.chartCol}>
                  <View style={[styles.chartBar, styles.chartBarInactive, { height: `${w.heightPct}%` }]} />
                  <Text style={styles.chartLabel}>{w.label}</Text>
                </View>
              )
            )}
          </View>
        </View>

        {data.topPost && (
          <View style={styles.topPostCard}>
            <View style={styles.topPostIcon}>
              <Icon name="trophy" color={colors.gradientGoldEnd} size={22} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.topPostTitle} numberOfLines={1}>
                Top post: &quot;{data.topPost.caption}&quot;
              </Text>
              <Text style={styles.topPostSubtitle}>
                {data.topPost.score} score · {data.topPost.likeCount} likes · {data.topPost.shareCount} shares
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14, backgroundColor: colors.white },
  errorText: { color: colors.inkSoft, textAlign: 'center', fontFamily: fonts.body.medium, fontSize: 15 },
  retryText: { color: colors.gold, textAlign: 'center', fontFamily: fonts.body.bold, fontSize: 14 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: fonts.display.bold, fontSize: 21, letterSpacing: -0.4, color: colors.ink },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40, gap: 12 },
  statsGrid: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.lg,
    padding: 16,
  },
  statCardLabel: { fontSize: 12, color: colors.inkFaint, fontFamily: fonts.body.semiBold },
  statCardValue: { fontFamily: fonts.display.bold, fontSize: 25, color: colors.ink, letterSpacing: -0.4, marginTop: 5 },
  statCardDelta: { fontSize: 11, color: colors.green, fontFamily: fonts.body.bold, marginTop: 3 },
  scoreCard: {
    borderRadius: radius.heroCard,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#c58300',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
  },
  scoreLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontFamily: fonts.body.semiBold },
  scoreValue: { fontFamily: fonts.display.bold, fontSize: 32, color: colors.white, marginTop: 6 },
  scoreOutOf: { fontSize: 15, color: 'rgba(255,255,255,0.8)' },
  scorePercentile: { fontSize: 11.5, color: 'rgba(255,255,255,0.9)', marginTop: 4, fontFamily: fonts.body.regular },
  chartCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.lg,
    padding: 20,
  },
  chartTitle: { fontSize: 13.5, color: colors.ink, marginBottom: 16, fontFamily: fonts.body.bold },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: CHART_HEIGHT },
  chartCol: { flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', maxWidth: 22, borderRadius: 7 },
  chartBarInactive: { backgroundColor: colors.chartBarInactive },
  chartLabel: { fontSize: 10, color: colors.inkFaint, fontFamily: fonts.body.semiBold },
  topPostCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  topPostIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.bannerGoldBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPostTitle: { fontSize: 13.5, color: colors.ink, fontFamily: fonts.body.bold },
  topPostSubtitle: { fontSize: 12, color: colors.inkFaint, marginTop: 1, fontFamily: fonts.body.regular },
});
