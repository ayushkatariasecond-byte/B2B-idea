import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { alert } from '../utils/alert';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export function OnboardingScreen({ navigation }: Props) {
  const { loginAsGuest } = useAuth();
  const [guestLoading, setGuestLoading] = useState(false);

  const onGuest = async () => {
    setGuestLoading(true);
    try {
      await loginAsGuest();
    } catch {
      alert('Could not continue', 'Something went wrong starting a guest session. Please try again.');
      setGuestLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.decorCardBack} />
      <LinearGradient
        colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.decorCardFront}
      >
        <Text style={styles.decorText}>96 creativity score</Text>
      </LinearGradient>

      <View style={styles.headlineWrap}>
        <Text style={styles.headline}>
          B2B marketing{'\n'}that isn&apos;t boring.
        </Text>
        <Text style={styles.subhead}>A feed built for business buyers — where creative posts get seen, not suppressed.</Text>
      </View>

      <View style={styles.spacer} />

      <View style={styles.ctaWrap}>
        <PrimaryButton label="Create your business page" onPress={() => navigation.navigate('Signup')} />
        <PrimaryButton label="I already have an account" variant="ghost" onPress={() => navigation.navigate('Login')} />
        <PrimaryButton label="Look around as a guest" variant="ghost" loading={guestLoading} onPress={onGuest} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: 28,
    paddingTop: 90,
    paddingBottom: 24,
  },
  decorCardBack: {
    position: 'absolute',
    top: -20,
    right: -100,
    width: 220,
    height: 300,
    borderRadius: 28,
    backgroundColor: colors.decorativeCard,
    transform: [{ rotate: '9deg' }],
  },
  decorCardFront: {
    position: 'absolute',
    top: 40,
    right: -30,
    width: 190,
    height: 230,
    borderRadius: 24,
    transform: [{ rotate: '-6deg' }],
    justifyContent: 'flex-end',
    padding: 18,
    shadowColor: colors.splashGlow2,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 26,
    elevation: 8,
  },
  decorText: { color: colors.white, fontFamily: fonts.display.bold, fontSize: 15, lineHeight: 20 },
  headlineWrap: { marginTop: 260 },
  headline: { fontFamily: fonts.display.bold, fontSize: 40, lineHeight: 42, color: colors.ink, letterSpacing: -1 },
  subhead: { marginTop: 14, fontSize: 15, lineHeight: 22, color: colors.inkSoft, maxWidth: 270, fontFamily: fonts.body.regular },
  spacer: { flex: 1 },
  ctaWrap: { gap: 10 },
});
