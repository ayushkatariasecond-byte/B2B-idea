import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ navigation, route }: Props) {
  const token = route.params?.token ?? '';
  const { business } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (!token) {
      setError('This reset link is invalid. Request a new one from the login screen.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don’t match.');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword({ token, password });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Set a new password</Text>
        {done ? (
          <>
            <Text style={styles.subtitle}>Your password has been updated. You can log in with it now.</Text>
            <PrimaryButton label={business ? 'Continue' : 'Log in'} onPress={() => navigation.navigate(business ? 'Tabs' : 'Login')} style={styles.submit} />
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>Choose a new password for your Nibbler account.</Text>
            <View style={styles.form}>
              <TextField label="New password" placeholder="At least 8 characters" value={password} onChangeText={setPassword} secureTextEntry />
              <TextField label="Confirm password" placeholder="Re-enter password" value={confirm} onChangeText={setConfirm} secureTextEntry />
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
            <PrimaryButton label="Update password" onPress={submit} loading={loading} style={styles.submit} />
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
  form: { gap: 14 },
  error: { color: '#b3261e', fontFamily: fonts.body.semiBold, fontSize: 13 },
  submit: { marginTop: 4 },
});
