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
// Both limiters key by IP (express-rate-limit's default) — there's no authenticated
// identity yet at signup/login time to key by instead. That matters for this app
// specifically: a real-world test recruits ~20-50 people who are plausibly all testing
// from the same location (e.g. the restaurant itself), which usually means one shared
// public IP behind NAT. The original 40/15min ceiling was sized for "one person retrying
// a login," not "50 legitimate people signing up within the same few minutes from behind
// one router" — at 40, roughly the second half of a 50-person group signing up together
// would get incorrectly throttled. Raised to comfortably cover that scale while still
// being far below what a scripted brute-force attempt would actually want.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// Same shared-IP reasoning as authLimiter above, applied to general traffic: 600/min
// works out to 12/min per person if split evenly across 50 concurrent users on one IP,
// which real usage (feed scrolling triggers a view-tracking call per post, plus likes/
// profile loads) can burst past. Raised to keep normal browsing from tripping this.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1200,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down a moment.' },
});

// Promo code redemption is deliberately public and unauthenticated (see routes/promoCodes.ts)
// — a real redemption often happens at a register with no login involved. That also makes it
// the one place an anonymous caller can cheaply script through many guesses at a valid code.
// 20/min/IP is generous for a real customer typing one code at checkout, and slow enough to
// make brute-forcing short codes impractical, on top of the general apiLimiter above.
export const promoRedeemLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a moment and try again.' },
});
