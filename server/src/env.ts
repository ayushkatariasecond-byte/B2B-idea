import dotenv from 'dotenv';

dotenv.config();

const INSECURE_DEFAULT_JWT_SECRET = 'dev-secret-change-me';

/**
 * Values that must never sign a production token, beyond this file's own fallback.
 *
 * The gap this closes: `.env.example` shipped `JWT_SECRET="change-me-in-production"`, and the
 * check below only ever rejected `dev-secret-change-me`. Copying the example to `.env` and
 * deploying — the single most likely way this app reaches production — therefore passed the
 * safety check while signing every auth token with a string published in the repository.
 * Anyone who read the repo could mint a valid token for any account.
 *
 * Compared case-insensitively after trimming, since a placeholder that differs only in case
 * or whitespace is the same mistake.
 */
const PLACEHOLDER_JWT_SECRETS = [
  INSECURE_DEFAULT_JWT_SECRET,
  'change-me-in-production',
  'change-me',
  'changeme',
  'secret',
  'jwt-secret',
  'your-secret-here',
  'todo',
  // The placeholder currently in .env.example. Long enough to clear the length bar below,
  // so it has to be named explicitly.
  'replace_me_run_openssl_rand_hex_32',
];

/**
 * A signing key shorter than this isn't meaningfully random no matter what it says. 32 is
 * the low end of what's defensible for HMAC-SHA256 (what jsonwebtoken uses by default) and
 * matches what `openssl rand -hex 32` / `crypto.randomBytes(32).toString('hex')` produce.
 */
const MIN_JWT_SECRET_LENGTH = 32;

export const env = {
  jwtSecret: process.env.JWT_SECRET || INSECURE_DEFAULT_JWT_SECRET,
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Public URL of the web app, used to build links inside emails.
  appWebUrl: process.env.APP_WEB_URL || 'http://localhost:8081',

  // Comma-separated list of origins allowed to call the API. Empty = allow any (local dev).
  allowedOrigins: (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Error monitoring (Sentry). Off unless a DSN is provided.
  sentryDsn: process.env.SENTRY_DSN || '',

  // Transactional email (SendGrid). Off unless an API key is provided; otherwise emails are
  // logged instead of sent, so local dev never depends on it.
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'ayushkatariasecond@gmail.com',
  emailFromName: process.env.EMAIL_FROM_NAME || 'Verve',

  // The one account allowed to use the moderation endpoints (view/act on reports).
  adminEmail: process.env.ADMIN_EMAIL || 'ayushkatariasecond@gmail.com',

  // File storage (Supabase Storage). Off unless url + service key are provided; otherwise
  // uploads stay on local disk exactly as before.
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  supabaseBucket: process.env.SUPABASE_BUCKET || 'media',
};

/**
 * Called once at real server startup (never on import, so the test suite and any script
 * that just imports `app` are unaffected) to fail loudly instead of quietly running unsafe.
 * Without this, a production deploy that forgot to set JWT_SECRET wouldn't error at all —
 * it would just sign and verify every token with a fallback string sitting in this file in
 * plaintext, letting anyone forge a valid auth token for any account.
 */
export function assertProductionSafety(): void {
  if (env.nodeEnv !== 'production') return;

  const problems: string[] = [];
  const jwtSecret = (process.env.JWT_SECRET ?? '').trim();
  if (!jwtSecret) {
    problems.push('JWT_SECRET is not set — generate one with: openssl rand -hex 32');
  } else if (PLACEHOLDER_JWT_SECRETS.includes(jwtSecret.toLowerCase())) {
    problems.push(
      'JWT_SECRET is still a placeholder value from the docs/example config. Anyone who has read this repository knows it. Generate a real one with: openssl rand -hex 32'
    );
  } else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(
      `JWT_SECRET is only ${jwtSecret.length} characters — too short to be a real signing key. Use at least ${MIN_JWT_SECRET_LENGTH}: openssl rand -hex 32`
    );
  }
  if (!process.env.DATABASE_URL) {
    problems.push('DATABASE_URL is not set.');
  }
  if (!process.env.ADMIN_EMAIL) {
    problems.push('ADMIN_EMAIL is not set — moderation endpoints would gate on a placeholder address.');
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to start in production with unsafe configuration:\n- ${problems.join('\n- ')}`);
  }
}
