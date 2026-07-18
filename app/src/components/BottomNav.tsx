import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from './Icon';
import { colors } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';

type Tab = 'home' | 'discover' | 'messages' | 'profile';

interface BottomNavProps {
  active: Tab;
  dark?: boolean;
}

export function BottomNav({ active, dark }: BottomNavProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const inactiveColor = dark ? 'rgba(255,255,255,0.6)' : colors.inkFaint2;
  const activeColor = colors.gold;

  const Container = dark ? BlurView : View;
  const containerProps = dark ? { intensity: 40, tint: 'dark' as const } : {};

  return (
    <Container {...containerProps} style={[styles.bar, dark ? styles.barDark : styles.barLight]}>
      <Pressable
        onPress={() => navigation.navigate('Tabs', { screen: 'HomeFeed' } as never)}
        style={styles.item}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Home"
        accessibilityState={{ selected: active === 'home' }}
      >
        <Icon name={active === 'home' ? 'homeFilled' : 'home'} color={active === 'home' ? activeColor : inactiveColor} size={24} />
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('Tabs', { screen: 'Discover' } as never)}
        style={styles.item}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Discover"
        accessibilityState={{ selected: active === 'discover' }}
      >
        <Icon name="search" color={active === 'discover' ? activeColor : inactiveColor} size={22} strokeWidth={active === 'discover' ? 2 : 1.8} />
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('Compose')}
        style={styles.composeButton}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Create a new post"
      >
        <Icon name="plus" color={colors.white} size={18} />
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('Tabs', { screen: 'Messages' } as never)}
        style={styles.item}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Messages"
        accessibilityState={{ selected: active === 'messages' }}
      >
        <Icon name="comment" color={active === 'messages' ? activeColor : inactiveColor} size={22} strokeWidth={active === 'messages' ? 2 : 1.8} />
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('Tabs', { screen: 'ProfileTab' } as never)}
        style={styles.item}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Profile"
        accessibilityState={{ selected: active === 'profile' }}
      >
        <Icon name="profile" color={active === 'profile' ? activeColor : inactiveColor} size={22} strokeWidth={active === 'profile' ? 2 : 1.8} />
      </Pressable>
    </Container>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 14,
    overflow: 'hidden',
  },
  barDark: { backgroundColor: 'rgba(10,10,10,0.35)' },
  barLight: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line },
  item: { alignItems: 'center', justifyContent: 'center' },
  composeButton: {
    backgroundColor: colors.gold,
    width: 44,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
