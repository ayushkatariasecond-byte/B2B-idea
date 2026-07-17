import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

export function SignupScreen({ navigation }: Props) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [category, setCategory] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !handle.trim() || !category.trim() || !email.trim() || !password) {
      setError('Please fill in every field.');
      return;
    }
    setLoading(true);
    try {
      await signup({
        name: name.trim(),
        handle: handle.trim().toLowerCase(),
        category: category.trim(),
        email: email.trim(),
        password,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create your business page</Text>
        <Text style={styles.subtitle}>Set up your presence on Verve in under a minute.</Text>

        <View style={styles.form}>
          <TextField label="Business name" placeholder="Nova Robotics" value={name} onChangeText={setName} autoCapitalize="words" />
          <TextField label="Handle" placeholder="novarobotics" value={handle} onChangeText={setHandle} />
          <TextField label="Category" placeholder="Industrial Automation" value={category} onChangeText={setCategory} autoCapitalize="words" />
          <TextField label="Email" placeholder="you@company.com" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <TextField label="Password" placeholder="At least 8 characters" value={password} onChangeText={setPassword} secureTextEntry />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton label="Create page" onPress={submit} loading={loading} style={styles.submit} />
        <Text style={styles.switchText} onPress={() => navigation.navigate('Login')}>
          Already have an account? <Text style={styles.switchLink}>Log in</Text>
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
  submit: { marginTop: 4 },
  switchText: { textAlign: 'center', fontFamily: fonts.body.medium, fontSize: 13, color: colors.inkSoft },
  switchLink: { color: colors.gold, fontFamily: fonts.body.bold },
});
