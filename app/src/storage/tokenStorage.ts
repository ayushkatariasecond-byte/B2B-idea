import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'verve.authToken';

/** expo-secure-store has no web implementation, so web falls back to AsyncStorage (localStorage). */
export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(KEY);
    return SecureStore.getItemAsync(KEY);
  },
  async set(token: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(KEY, token);
      return;
    }
    await SecureStore.setItemAsync(KEY, token);
  },
  async clear(): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    await SecureStore.deleteItemAsync(KEY);
  },
};
