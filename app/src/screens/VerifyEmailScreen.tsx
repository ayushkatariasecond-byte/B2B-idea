import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '../components/PrimaryButton';
import { Icon } from '../components/Icon';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import * as authApi from '../api/auth';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>;

export function VerifyEmailScreen({ navigation, route }: Props) {
  const token = route.params?.token ?? '';
  const { business } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setStatus('error');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => !cancelled && setStatus('ok'))
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Where "Continue" goes depends on whether they're already signed in on this device.
  const onContinue = () => navigation.navigate(business ? 'Tabs' : 'Login');

  return (
    <View style={styles.container}>
      {status === 'loading' && <ActivityIndicator color={colors.gold} />}

      {status === 'ok' && (
        <>
          <View style={styles.badge}>
            <Icon name="checkBadge" size={40} color={colors.gold} />
          </View>
          <Text style={styles.title}>Email confirmed</Text>
          <Text style={styles.subtitle}>Your Verve email is verified. You're all set.</Text>
          <PrimaryButton label="Continue" onPress={onContinue} style={styles.submit} />
        </>
      )}

      {status === 'error' && (
        <>
          <Text style={styles.title}>Link expired</Text>
          <Text style={styles.subtitle}>
            This verification link is invalid or has expired. You can request a new one from Settings after logging in.
          </Text>
          <PrimaryButton label="Continue" onPress={onContinue} style={styles.submit} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  badge: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.goldPale, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontFamily: fonts.display.bold, fontSize: 24, color: colors.ink, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body.regular, fontSize: 14, color: colors.inkSoft, textAlign: 'center', lineHeight: 21 },
  submit: { marginTop: 10, alignSelf: 'stretch' },
});
