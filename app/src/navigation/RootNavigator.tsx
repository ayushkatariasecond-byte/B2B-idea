import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { colors } from '../theme/tokens';
import { RootStackParamList } from './types';
import { TabNavigator } from './TabNavigator';
import { SplashScreen } from '../screens/SplashScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SuggestedFollowsScreen } from '../screens/SuggestedFollowsScreen';
import { ComposeScreen } from '../screens/ComposeScreen';
import { PostDetailScreen } from '../screens/PostDetailScreen';
import { BusinessProfileScreen } from '../screens/BusinessProfileScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { ThreadScreen } from '../screens/ThreadScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { DraftsScreen } from '../screens/DraftsScreen';
import { TeamMembersScreen } from '../screens/TeamMembersScreen';
import { SavedPostsScreen } from '../screens/SavedPostsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * React Navigation only reads `initialRouteName` the first time this Stack.Navigator ever
 * mounts — it's not re-evaluated on later renders, so a stale `justSignedUp` computed once
 * at signup would keep sending every later login back to SuggestedFollows. Doing the
 * redirect here instead (a real screen inside the navigator, so `useNavigation` works and
 * runs on every mount) makes it react correctly each time `justSignedUp` changes.
 */
function TabsGate() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { justSignedUp } = useAuth();

  useEffect(() => {
    if (justSignedUp) {
      navigation.replace('SuggestedFollows');
    }
  }, [justSignedUp, navigation]);

  return <TabNavigator />;
}

/**
 * Splash is meant to greet a real app open once, not to be an addressable route — it has
 * no useful state to deep-link into and (per the TabsGate lesson above) fighting React
 * Navigation's web `linking` sync to make an unmapped screen "sticky" doesn't work: the
 * URL/state sync kept snapping straight back to Onboarding. Rendering it as a plain gate
 * above the navigator sidesteps routing entirely. The module-level flag (reset only by an
 * actual page/app reload) keeps it to once per session.
 */
let hasShownSplash = false;

export function RootNavigator() {
  const { business, isLoading } = useAuth();
  const [showSplash, setShowSplash] = useState(() => !hasShownSplash);
  usePushNotifications(Boolean(business));

  if (showSplash) {
    return (
      <SplashScreen
        onDone={() => {
          hasShownSplash = true;
          setShowSplash(false);
        }}
      />
    );
  }

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
        <Stack.Screen name="PostDetail" component={PostDetailScreen} />
        <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Tabs">
      <Stack.Screen name="Tabs" component={TabsGate} />
      <Stack.Screen name="SuggestedFollows" component={SuggestedFollowsScreen} />
      <Stack.Screen name="Compose" component={ComposeScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Analytics" component={AnalyticsScreen} />
      <Stack.Screen name="Thread" component={ThreadScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Drafts" component={DraftsScreen} />
      <Stack.Screen name="TeamMembers" component={TeamMembersScreen} />
      <Stack.Screen name="Saved" component={SavedPostsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}
