import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useRealtimeConnection } from '../hooks/useRealtimeConnection';
import { colors } from '../theme/tokens';
import { RootStackParamList } from './types';
import { TabNavigator } from './TabNavigator';
import { ReopenIntro } from '../screens/ReopenIntro';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';
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
 * The reopen intro greets a real app open once, then hands off into the live feed. It is
 * NOT an addressable route (per the TabsGate lesson above, fighting React Navigation's web
 * `linking` sync to make an unmapped screen "sticky" doesn't work). Instead the real app is
 * mounted underneath and the intro is a plain absolute overlay on top that dissolves to
 * reveal it — so the handoff is seamless with no navigation and no unmount mid-gesture. The
 * module-level flag (reset only by an actual page/app reload) keeps it to once per session.
 */
let hasShownReopen = false;

export function RootNavigator() {
  const { business, isLoading } = useAuth();
  const [showReopen, setShowReopen] = useState(() => !hasShownReopen);
  usePushNotifications(Boolean(business));
  useRealtimeConnection(Boolean(business));

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  } else if (!business) {
    content = (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        <Stack.Screen name="PostDetail" component={PostDetailScreen} />
        <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
      </Stack.Navigator>
    );
  } else {
    content = (
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
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {content}
      {showReopen && (
        <ReopenIntro
          onDone={() => {
            hasShownReopen = true;
            setShowReopen(false);
          }}
        />
      )}
    </View>
  );
}
