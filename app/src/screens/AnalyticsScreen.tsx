import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

function deltaLabel(value: number, suffix: string): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value}${suffix} vs last month`;
}

export function AnalyticsScreen({ navigation }: Props) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  useEffect(() => {
    analyticsApi.getMyAnalytics().then(setData);
  }, []);

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const ringOffset = RING_CIRCUMFERENCE * (1 - data.creativityScore / 100);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" color={colors.backIcon} size={9} />
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

        <View style={styles.scoreCard}>
          <View>
            <Text style={styles.scoreLabel}>Creativity Score</Text>
            <Text style={styles.scoreValue}>
              {data.creativityScore}
              <Text style={styles.scoreOutOf}> / 100</Text>
            </Text>
            <Text style={styles.scorePercentile}>Top {data.percentileTop}% of businesses on Verve</Text>
          </View>
          <Svg width={60} height={60} viewBox="0 0 60 60">
            <Circle cx={30} cy={30} r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={6} />
            <Circle
              cx={30}
              cy={30}
              r={RING_RADIUS}
              fill="none"
              stroke={colors.gold}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 30 30)"
            />
          </Svg>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Weekly views</Text>
          <View style={styles.chartRow}>
            {data.weeklyViews.map((w) => (
              <View key={w.label} style={styles.chartCol}>
                <View style={[styles.chartBar, { height: `${w.heightPct}%`, backgroundColor: w.isCurrent ? colors.gold : colors.barNeutral }]} />
                <Text style={styles.chartLabel}>{w.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {data.topPost && (
          <View style={styles.topPostCard}>
            <View style={styles.topPostIcon}>
              <Icon name="star" color={colors.goldDeep} size={20} />
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
  container: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: fonts.display.bold, fontSize: 20, color: colors.ink },
  body: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  statsGrid: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16 },
  statCardLabel: { fontSize: 12, color: colors.inkSoft2, fontFamily: fonts.body.semiBold },
  statCardValue: { fontFamily: fonts.display.bold, fontSize: 24, color: colors.ink, marginTop: 4 },
  statCardDelta: { fontSize: 11, color: colors.green, fontFamily: fonts.body.bold, marginTop: 2 },
  scoreCard: {
    backgroundColor: colors.darkGold,
    borderRadius: radius.lg,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreLabel: { fontSize: 12, color: colors.goldSubtext, fontFamily: fonts.body.semiBold },
  scoreValue: { fontFamily: fonts.display.bold, fontSize: 30, color: colors.white, marginTop: 4 },
  scoreOutOf: { fontSize: 15, color: colors.goldSubtext },
  scorePercentile: { fontSize: 11, color: colors.goldSubtext2, marginTop: 2, fontFamily: fonts.body.regular },
  chartCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18 },
  chartTitle: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 14, fontFamily: fonts.body.bold },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 100 },
  chartCol: { flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', maxWidth: 22, borderRadius: 6 },
  chartLabel: { fontSize: 10, color: colors.inkSoft2 },
  topPostCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  topPostIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.goldPaleAlt, alignItems: 'center', justifyContent: 'center' },
  topPostTitle: { fontSize: 13, fontWeight: '700', color: colors.ink, fontFamily: fonts.body.bold },
  topPostSubtitle: { fontSize: 12, color: colors.inkSoft2, marginTop: 1, fontFamily: fonts.body.regular },
});
