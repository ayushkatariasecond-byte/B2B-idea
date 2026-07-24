import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { Chip } from '../components/Chip';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import * as businessesApi from '../api/businesses';
import { Cuisine } from '../api/types';
import { useLocationPermission, Coords } from '../hooks/useLocationPermission';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

export function SignupScreen({ navigation }: Props) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [isRestaurant, setIsRestaurant] = useState(true);
  const [category, setCategory] = useState('');
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [cuisineSlug, setCuisineSlug] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const { status: locationStatus, request: requestLocation } = useLocationPermission();

  const onUseLocation = async () => {
    const result = await requestLocation();
    if (result) setCoords(result);
  };

  useEffect(() => {
    businessesApi.getCuisines().then((res) => {
      setCuisines(res.cuisines);
      setCuisineSlug((prev) => prev ?? res.cuisines[0]?.slug ?? null);
    });
  }, []);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !handle.trim() || !city.trim() || !email.trim() || !password) {
      setError('Please fill in every field.');
      return;
    }
    if (isRestaurant && !cuisineSlug) {
      setError('Please choose a cuisine type.');
      return;
    }
    if (!isRestaurant && !category.trim()) {
      setError('Please fill in every field.');
      return;
    }
    setLoading(true);
    try {
      await signup({
        name: name.trim(),
        handle: handle.trim().toLowerCase(),
        city: city.trim(),
        email: email.trim(),
        password,
        isRestaurant,
        // Only included when the user actually granted permission — omitting them puts
        // the account on the city-matching fallback path rather than failing signup.
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
        ...(isRestaurant ? { cuisineSlug: cuisineSlug! } : { category: category.trim() }),
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
        <Text style={styles.title}>Join Nibbler</Text>
        <Text style={styles.subtitle}>Short food videos from restaurants in your city.</Text>

        <View style={styles.toggleRow}>
          <Chip label="I run a restaurant" active={isRestaurant} onPress={() => setIsRestaurant(true)} />
          <Chip label="I'm just browsing" active={!isRestaurant} onPress={() => setIsRestaurant(false)} />
        </View>

        <View style={styles.form}>
          <TextField
            label={isRestaurant ? 'Restaurant name' : 'Your name'}
            placeholder={isRestaurant ? "Franklin's Firehouse BBQ" : 'Jamie'}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <TextField label="Handle" placeholder="franklinsfirehouse" value={handle} onChangeText={setHandle} />
          <TextField label="City" placeholder="Austin" value={city} onChangeText={setCity} autoCapitalize="words" />

          {/* Location is an enhancement on top of the city field, never a replacement for
              it — the city stays required so declining (or a device with no fix) still
              produces a working account. */}
          <View style={styles.locationBox}>
            {locationStatus === 'granted' && coords ? (
              <Text style={styles.locationOn}>
                ✓ Using your location — you&apos;ll see restaurants within 20 miles.
              </Text>
            ) : (
              <>
                <Text style={styles.locationLabel}>
                  {isRestaurant
                    ? 'Add your location so nearby diners can find you.'
                    : 'Use your location to find restaurants near you.'}
                </Text>
                <Text
                  style={[styles.locationAction, locationStatus === 'requesting' && styles.locationActionDisabled]}
                  onPress={locationStatus === 'requesting' ? undefined : onUseLocation}
                  accessibilityRole="button"
                >
                  {locationStatus === 'requesting' ? 'Getting location…' : 'Use my location'}
                </Text>
                {(locationStatus === 'denied' || locationStatus === 'unavailable') && (
                  <Text style={styles.locationFallback}>
                    No problem — we&apos;ll use the city you entered above instead.
                  </Text>
                )}
              </>
            )}
          </View>

          {isRestaurant ? (
            <View style={styles.field}>
              <Text style={styles.label}>Cuisine type</Text>
              <View style={styles.chipWrap}>
                {cuisines.map((c) => (
                  <Chip key={c.id} label={c.name} active={c.slug === cuisineSlug} onPress={() => setCuisineSlug(c.slug)} />
                ))}
              </View>
            </View>
          ) : (
            <TextField label="Category" placeholder="Just here to eat" value={category} onChangeText={setCategory} autoCapitalize="words" />
          )}

          <TextField label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <TextField label="Password" placeholder="At least 8 characters" value={password} onChangeText={setPassword} secureTextEntry />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton label={isRestaurant ? 'Create restaurant page' : 'Create account'} onPress={submit} loading={loading} style={styles.submit} />
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
  toggleRow: { flexDirection: 'row', gap: 8 },
  form: { gap: 14 },
  field: { gap: 6 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: fonts.body.bold,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationBox: {
    backgroundColor: colors.paper2,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  locationLabel: { fontFamily: fonts.body.regular, fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  locationAction: { fontFamily: fonts.body.bold, fontSize: 14, color: colors.gold },
  locationActionDisabled: { color: colors.inkFaint2 },
  locationOn: { fontFamily: fonts.body.semiBold, fontSize: 13, color: colors.green, lineHeight: 18 },
  locationFallback: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.inkFaint2, lineHeight: 16 },
  error: { color: '#b3261e', fontFamily: fonts.body.semiBold, fontSize: 13 },
  submit: { marginTop: 4 },
  switchText: { textAlign: 'center', fontFamily: fonts.body.medium, fontSize: 13, color: colors.inkSoft },
  switchLink: { color: colors.gold, fontFamily: fonts.body.bold },
});
