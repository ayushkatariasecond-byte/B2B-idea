import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

export type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

export interface Coords {
  latitude: number;
  longitude: number;
}

/**
 * Wraps the one-shot "ask for location, get a fix" flow used at signup and profile setup.
 *
 * Declining is a fully supported outcome, not an error: the account simply keeps using its
 * typed city for feed matching (see server/src/utils/geo.ts). So every failure path here —
 * permission denied, device location services off, a hardware/browser error, or the request
 * hanging — resolves to `null` rather than throwing. Nothing in the signup flow should ever
 * be blocked by this.
 */
export function useLocationPermission() {
  const [status, setStatus] = useState<LocationStatus>('idle');

  const request = useCallback(async (): Promise<Coords | null> => {
    setStatus('requesting');
    try {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission !== 'granted') {
        setStatus('denied');
        return null;
      }

      // A device that never gets a fix would otherwise leave the user staring at a spinner
      // with no way forward, so the wait is bounded and a timeout is treated as "no
      // location" — the same graceful fallback as an outright denial.
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
      ]);

      if (!position) {
        setStatus('unavailable');
        return null;
      }

      setStatus('granted');
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch {
      // Location services disabled, browser geolocation blocked, or no provider available.
      setStatus('unavailable');
      return null;
    }
  }, []);

  return { status, request };
}
