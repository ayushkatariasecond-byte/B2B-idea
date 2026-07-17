import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ResponsiveContainer } from './src/components/ResponsiveContainer';
import { useAppFonts } from './src/theme/useAppFonts';
import { colors } from './src/theme/tokens';

export default function App() {
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
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
        </AuthProvider>
      </ResponsiveContainer>
    </SafeAreaProvider>
  );
}
