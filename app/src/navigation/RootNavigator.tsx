import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useRealtimeConnection } from '../hooks/useRealtimeConnection';
import { colors } from '../theme/tokens';
import { RootStackParamList } from './types';
import { TabNavigator } from './TabNavigator';
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
import { FollowListScreen } from '../screens/FollowListScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { PromoCodeScreen } from '../screens/PromoCodeScreen';
import { ThreadScreen } from '../screens/ThreadScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { DraftsScreen } from '../screens/DraftsScreen';
import { TeamMembersScreen } from '../screens/TeamMembersScreen';
import { SavedPostsScreen } from '../screens/SavedPostsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { StoryViewerScreen } from '../screens/StoryViewerScreen';

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

export function RootNavigator() {
  const { business, isLoading } = useAuth();
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
        <Stack.Screen name="FollowList" component={FollowListScreen} />
      </Stack.Navigator>
    );
  } else {
    content = (
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Tabs">
        <Stack.Screen name="Tabs" component={TabsGate} />
        <Stack.Screen name="SuggestedFollows" component={SuggestedFollowsScreen} />
        <Stack.Screen name="Compose" component={ComposeScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="StoryViewer" component={StoryViewerScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="PostDetail" component={PostDetailScreen} />
        <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
        <Stack.Screen name="FollowList" component={FollowListScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Analytics" component={AnalyticsScreen} />
        <Stack.Screen name="PromoCodes" component={PromoCodeScreen} />
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

  return <View style={{ flex: 1 }}>{content}</View>;
}
