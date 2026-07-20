import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import * as authApi from '../api/auth';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
    } catch {
      // The endpoint always succeeds by design; ignore transient errors and still show the
      // neutral confirmation so we never reveal whether an account exists.
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Reset your password</Text>
        {sent ? (
          <>
            <Text style={styles.subtitle}>
              If an account exists for <Text style={styles.email}>{email.trim()}</Text>, we've sent a link to reset your
              password. Check your inbox (and spam).
            </Text>
            <PrimaryButton label="Back to log in" onPress={() => navigation.navigate('Login')} style={styles.submit} />
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>Enter your email and we'll send you a link to set a new password.</Text>
            <View style={styles.form}>
              <TextField
                label="Email"
                placeholder="you@company.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />
            </View>
            <PrimaryButton label="Send reset link" onPress={submit} loading={loading} style={styles.submit} />
            <Text style={styles.switchText} onPress={() => navigation.goBack()}>
              <Text style={styles.switchLink}>Back to log in</Text>
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  scroll: { padding: 24, paddingTop: 72, gap: 20 },
  title: { fontFamily: fonts.display.bold, fontSize: 26, color: colors.ink },
  subtitle: { fontFamily: fonts.body.regular, fontSize: 14, color: colors.inkSoft, lineHeight: 21 },
  email: { fontFamily: fonts.body.bold, color: colors.ink },
  form: { gap: 14 },
  submit: { marginTop: 4 },
  switchText: { textAlign: 'center', fontFamily: fonts.body.medium, fontSize: 13, color: colors.inkSoft },
  switchLink: { color: colors.gold, fontFamily: fonts.body.bold },
});
