import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeFeedScreen } from '../screens/HomeFeedScreen';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { MessagesScreen } from '../screens/MessagesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

// Each screen renders its own themed bottom nav (dark-on-video for Home, light elsewhere),
// so the library's default tab bar is hidden and used purely for tab state/history.
export function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tab.Screen name="HomeFeed" component={HomeFeedScreen} />
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
