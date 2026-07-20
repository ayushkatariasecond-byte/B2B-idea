import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinkingOptions, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ResponsiveContainer } from './src/components/ResponsiveContainer';
import { AlertHost } from './src/components/AlertHost';
import { useAppFonts } from './src/theme/useAppFonts';
import { colors } from './src/theme/tokens';
import { RootStackParamList } from './src/navigation/types';
import { initAppSentry, wrapApp } from './src/observability';

initAppSentry();

// Public post/profile pages get real URLs; everything else stays app-only (no useful state to deep-link into pre-auth).
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [],
  config: {
    screens: {
      Onboarding: '',
      Signup: 'signup',
      Login: 'login',
      ForgotPassword: 'forgot-password',
      ResetPassword: 'reset-password',
      VerifyEmail: 'verify-email',
      PostDetail: 'post/:postId',
      BusinessProfile: 'biz/:businessId',
    } as never,
  },
};

function App() {
  const [fontsLoaded] = useAppFonts();

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ResponsiveContainer>
        <AuthProvider>
          <NavigationContainer linking={linking}>
            <RootNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
          <AlertHost />
        </AuthProvider>
      </ResponsiveContainer>
    </SafeAreaProvider>
  );
}

export default wrapApp(App);
