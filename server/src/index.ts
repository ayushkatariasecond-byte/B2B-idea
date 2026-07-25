// Must be imported before any router/route is defined — it patches Express's router
// methods so a rejected promise from an async handler reaches the error middleware below
// instead of becoming a silently-hanging request. Express 4 has no native support for
// this (Express 5 does), and this codebase's route handlers are almost entirely
// try/catch-free async functions relying on exactly this behavior to exist.
import 'express-async-errors';
import express from 'express';
import multer from 'multer';
import { env, assertProductionSafety } from './env';
import { authRouter } from './routes/auth';
import { businessesRouter } from './routes/businesses';
import { postsRouter } from './routes/posts';
import { analyticsRouter } from './routes/analytics';
import { threadsRouter } from './routes/threads';
import { membersRouter } from './routes/members';
import { notificationsRouter } from './routes/notifications';
import { reportsRouter } from './routes/reports';
import { moderationRouter } from './routes/moderation';
import { storiesRouter } from './routes/stories';
import { cuisinesRouter } from './routes/cuisines';
import { promoCodesRouter } from './routes/promoCodes';
import { UPLOAD_DIR } from './upload';
import { prisma, isDatabaseUnavailableError } from './db';
import { setupRealtime } from './realtime';
import { initSentry, sentryEnabled, Sentry } from './observability';
import { helmetMiddleware, corsMiddleware, authLimiter, apiLimiter } from './security';
import { rejectNulBodies } from './utils/text';

// Initialize error monitoring before anything else (no-op unless SENTRY_DSN is set).
initSentry();

export const app = express();

// Behind a single hosting proxy (e.g. Railway) so rate limiting sees the real client IP.
if (env.nodeEnv === 'production') app.set('trust proxy', 1);

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json());
// Must sit directly after the JSON parser: a NUL byte anywhere in a body is unstorable in
// Postgres and otherwise surfaces as a 500 from the driver. See utils/text.ts.
app.use(rejectNulBodies);

// Static media is served before the rate limiter so image/video requests aren't throttled.
app.use('/uploads', express.static(UPLOAD_DIR));

// Checks real DB connectivity (not just "the process is up") so an orchestrator (Railway,
// a load balancer) can tell a genuinely broken instance apart from a healthy one. `SELECT 1`
// is the standard cheap liveness probe — no table dependency, no schema assumptions.
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'connected' });
  } catch (err) {
    console.error('Health check failed: database unreachable', err);
    res.status(503).json({ ok: false, db: 'unreachable' });
  }
});

app.use(apiLimiter);

app.use('/auth', authLimiter, authRouter);
app.use('/businesses', businessesRouter);
app.use('/posts', postsRouter);
app.use('/analytics', analyticsRouter);
app.use('/threads', threadsRouter);
app.use('/team', membersRouter);
app.use('/notifications', notificationsRouter);
app.use('/reports', reportsRouter);
app.use('/moderation', moderationRouter);
app.use('/stories', storiesRouter);
app.use('/cuisines', cuisinesRouter);
app.use('/promo-codes', promoCodesRouter);

// Multer's own validation (upload.ts: 50MB size limit, image/video-only mimetype filter)
// rejects a bad upload by calling next(err) — that's a client mistake (file too large,
// wrong type), not a server failure, so it's mapped to 400 here with Multer's own message
// (safe to relay: these are specifically about what's wrong with the upload, nothing
// internal) before Sentry/the generic handler below ever see it as if it were a bug.
app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError || err.message === 'Only image or video uploads are allowed') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// Sentry's error handler captures exceptions before our own responds (no-op if disabled).
if (sentryEnabled()) {
  Sentry.setupExpressErrorHandler(app);
}

// Catch-all for anything that reaches here: an unhandled rejection from an async route
// (now forwarded by express-async-errors above), a thrown error, or Express's own
// body-parser/routing errors. Always a structured JSON body, never a stack trace or the
// raw error message — no route in this app currently throws an Error intentionally
// meant for the client (every deliberate client-facing error already returns its own
// res.status(...).json(...) inline), so anything landing here is by definition
// unexpected, and the safe assumption is that its message could contain internal detail
// (a raw Prisma/SQL error, a file path) that shouldn't be exposed. Full detail is still
// logged server-side (and to Sentry, via the handler registered just above) for debugging.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  // A database that can't be reached (or won't accept our credentials) is an outage, not a
  // bug in the request — and it takes down every route at once. Saying so with a 503 keeps
  // the generic 500 above meaning what it should ("this is unexpected, look at the code"),
  // and gives the client something true to show instead of "Internal server error". See
  // isDatabaseUnavailableError in db.ts for the incident that motivated this.
  if (isDatabaseUnavailableError(err)) {
    return res
      .status(503)
      .json({ error: 'The service is temporarily unavailable (database). Please try again in a moment.' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

async function publishDueScheduledPosts() {
  try {
    await prisma.post.updateMany({
      where: { status: 'scheduled', scheduledFor: { lte: new Date() } },
      data: { status: 'published' },
    });
  } catch (err) {
    console.error('Failed to publish scheduled posts', err);
  }
}

if (require.main === module) {
  assertProductionSafety();
  const server = app.listen(env.port, () => {
    console.log(`Verve API listening on http://localhost:${env.port}`);
  });
  setupRealtime(server);
  publishDueScheduledPosts();
  setInterval(publishDueScheduledPosts, 60_000);
}
