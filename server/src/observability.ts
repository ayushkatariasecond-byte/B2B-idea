import * as Sentry from '@sentry/node';
import { env } from './env';

/**
 * Error monitoring. Completely inert unless SENTRY_DSN is set, so local dev is unaffected.
 * Call initSentry() once at process start (before the Express error handler is attached).
 */
let initialized = false;

export function initSentry(): boolean {
  if (initialized || !env.sentryDsn) return false;
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
  initialized = true;
  console.log('Sentry error monitoring enabled');
  return true;
}

export function sentryEnabled(): boolean {
  return initialized;
}

export { Sentry };
