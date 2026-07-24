import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import * as promoCodesApi from '../api/promoCodes';
import { ApiError } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'PromoCodes'>;

// Deliberately minimal per spec ("doesn't need to be polished") — create a code, then
// check redemption stats for any code you own (including ones created earlier, in an
// earlier session). No list-all-my-codes endpoint exists, so re-checking an older code
// means typing it back in here.
export function PromoCodeScreen({ navigation }: Props) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [checkCode, setCheckCode] = useState('');
  const [stats, setStats] = useState<promoCodesApi.PromoCodeStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStats = async (targetCode: string) => {
    const res = await promoCodesApi.getPromoCodeStats(targetCode);
    setStats(res);
    setCheckCode(res.code);
  };

  const create = async () => {
    setError(null);
    if (!code.trim() || !description.trim()) {
      setError('Enter a code and a description.');
      return;
    }
    setBusy(true);
    try {
      const res = await promoCodesApi.createPromoCode({ code: code.trim(), discountDescription: description.trim() });
      await loadStats(res.promoCode.code);
      setCode('');
      setDescription('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const checkStats = async () => {
    setError(null);
    if (!checkCode.trim()) return;
    setBusy(true);
    try {
      await loadStats(checkCode.trim());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't find that code.");
      setStats(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Promo Codes</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionLabel}>Create a new code</Text>
        <TextField label="Code" placeholder="SAVE10" value={code} onChangeText={setCode} autoCapitalize="characters" />
        <TextField label="Discount" placeholder="10% off" value={description} onChangeText={setDescription} autoCapitalize="sentences" />
        <PrimaryButton label="Create code" onPress={create} loading={busy} style={styles.button} />

        <Text style={[styles.sectionLabel, styles.checkLabel]}>Check redemptions for a code</Text>
        <TextField label="Code" placeholder="SAVE10" value={checkCode} onChangeText={setCheckCode} autoCapitalize="characters" />
        <PrimaryButton label="Check stats" variant="secondary" onPress={checkStats} loading={busy} style={styles.button} />

        {error && <Text style={styles.error}>{error}</Text>}

        {stats && (
          <View style={styles.statsCard}>
            <Text style={styles.statsCode}>{stats.code}</Text>
            <Text style={styles.statsDescription}>{stats.discountDescription}</Text>
            <Text style={styles.statsMeta}>{stats.active ? 'Active' : 'Inactive'}</Text>
            <Text style={styles.statsCount}>{stats.redemptionCount}</Text>
            <Text style={styles.statsCountLabel}>redemptions</Text>
            {stats.redemptions.length > 0 && (
              <View style={styles.timestampList}>
                {stats.redemptions.slice(0, 20).map((t, i) => (
                  <Text key={i} style={styles.timestamp}>
                    {new Date(t).toLocaleString()}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
        {busy && !stats && <ActivityIndicator color={colors.gold} style={{ marginTop: 12 }} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancel: { fontSize: 15, color: colors.inkSoft, fontFamily: fonts.body.semiBold },
  headerTitle: { fontFamily: fonts.display.bold, fontSize: 16, color: colors.ink },
  body: { padding: 20, gap: 14 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: fonts.body.bold,
  },
  checkLabel: { marginTop: 12 },
  button: { marginTop: 2 },
  error: { color: '#b3261e', fontFamily: fonts.body.semiBold, fontSize: 13 },
  statsCard: {
    marginTop: 8,
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    gap: 4,
  },
  statsCode: { fontFamily: fonts.display.bold, fontSize: 20, color: colors.ink, letterSpacing: 1 },
  statsDescription: { fontFamily: fonts.body.medium, fontSize: 14, color: colors.inkSoft },
  statsMeta: { fontFamily: fonts.body.semiBold, fontSize: 12, color: colors.inkFaint, marginBottom: 8 },
  statsCount: { fontFamily: fonts.display.bold, fontSize: 40, color: colors.gold },
  statsCountLabel: { fontFamily: fonts.body.semiBold, fontSize: 12, color: colors.inkSoft, marginBottom: 8 },
  timestampList: { alignSelf: 'stretch', marginTop: 8, gap: 4 },
  timestamp: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.inkFaint, textAlign: 'center' },
});
