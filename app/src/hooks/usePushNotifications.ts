import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as businessesApi from '../api/businesses';

/**
 * Best-effort push registration: registers an Expo push token for the signed-in business.
 * Silently no-ops on web (not supported by expo-notifications) or if permission is denied —
 * this must never block or break the app if push isn't available in this environment.
 */
export function usePushNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    let cancelled = false;

    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted' || cancelled) return;

        const tokenResponse = await Notifications.getExpoPushTokenAsync();
        if (!cancelled) {
          await businessesApi.registerPushToken(tokenResponse.data);
        }
      } catch {
        // best-effort only — no push provider configured, no device support, or permission denied
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
