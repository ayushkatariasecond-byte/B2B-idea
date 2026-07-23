import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login({ email: email.trim(), password });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to your business page.</Text>

        <View style={styles.form}>
          <TextField label="Email" placeholder="you@company.com" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <TextField label="Password" placeholder="Your password" value={password} onChangeText={setPassword} secureTextEntry />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.forgot} onPress={() => navigation.navigate('ForgotPassword')} accessibilityRole="button">
          Forgot password?
        </Text>

        <PrimaryButton label="Log in" onPress={submit} loading={loading} style={styles.submit} />
        <Text style={styles.switchText} onPress={() => navigation.navigate('Signup')}>
          New to Nibbler? <Text style={styles.switchLink}>Create a page</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  scroll: { padding: 24, paddingTop: 72, gap: 20 },
  title: { fontFamily: fonts.display.bold, fontSize: 26, color: colors.ink },
  subtitle: { fontFamily: fonts.body.regular, fontSize: 14, color: colors.inkSoft },
  form: { gap: 14 },
  error: { color: '#b3261e', fontFamily: fonts.body.semiBold, fontSize: 13 },
  forgot: { alignSelf: 'flex-end', color: colors.gold, fontFamily: fonts.body.bold, fontSize: 13 },
  submit: { marginTop: 4 },
  switchText: { textAlign: 'center', fontFamily: fonts.body.medium, fontSize: 13, color: colors.inkSoft },
  switchLink: { color: colors.gold, fontFamily: fonts.body.bold },
});
