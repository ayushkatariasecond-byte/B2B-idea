import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './env';

/**
 * Security middleware. Defaults are dev-friendly (any origin, no rate limiting during the
 * test suite) and tighten automatically in production via env vars.
 */

// Sensible security headers for a JSON API. CSP is left to the web app's host (it doesn't
// apply to JSON), and cross-origin resource policy is relaxed so the app can load /uploads media.
export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// Restrict to ALLOWED_ORIGIN(s) when set; otherwise reflect any origin (local dev).
export const corsMiddleware = cors(
  env.allowedOrigins.length > 0 ? { origin: env.allowedOrigins, credentials: true } : {}
);

// The jest suite fires many requests from one IP; never rate-limit it.
const skip = () => env.nodeEnv === 'test';

// Brute-force protection for credentials + account recovery (login, signup, forgot/reset).
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// A generous ceiling on the rest of the API to blunt floods without affecting normal use.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down a moment.' },
});
