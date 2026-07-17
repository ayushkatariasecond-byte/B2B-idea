import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/tokens';
import { RootStackParamList } from './types';
import { TabNavigator } from './TabNavigator';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ComposeScreen } from '../screens/ComposeScreen';
import { PostDetailScreen } from '../screens/PostDetailScreen';
import { BusinessProfileScreen } from '../screens/BusinessProfileScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { ThreadScreen } from '../screens/ThreadScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { business, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (!business) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Compose" component={ComposeScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Analytics" component={AnalyticsScreen} />
      <Stack.Screen name="Thread" component={ThreadScreen} />
    </Stack.Navigator>
  );
}
