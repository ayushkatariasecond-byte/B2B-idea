import * as Sentry from '@sentry/react-native';

/**
 * Client-side error monitoring. Completely inert unless EXPO_PUBLIC_SENTRY_DSN is set at build
 * time, so local dev and the current web build behave exactly as before. `enableNative: false`
 * keeps this JS-only (works on web + native with no native config / rebuild); native crash
 * capture can be added later with the Expo Sentry plugin.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initAppSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    enableNative: false,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export function wrapApp<T>(App: T): T {
  return dsn ? (Sentry.wrap(App as never) as T) : App;
}
