import dotenv from 'dotenv';

dotenv.config();

export const env = {
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
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
