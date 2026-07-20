import express from 'express';
import cors from 'cors';
import { env } from './env';
import { authRouter } from './routes/auth';
import { businessesRouter } from './routes/businesses';
import { postsRouter } from './routes/posts';
import { analyticsRouter } from './routes/analytics';
import { threadsRouter } from './routes/threads';
import { membersRouter } from './routes/members';
import { notificationsRouter } from './routes/notifications';
import { reportsRouter } from './routes/reports';
import { UPLOAD_DIR } from './upload';
import { prisma } from './db';
import { setupRealtime } from './realtime';
import { initSentry, sentryEnabled, Sentry } from './observability';

// Initialize error monitoring before anything else (no-op unless SENTRY_DSN is set).
initSentry();

export const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/businesses', businessesRouter);
app.use('/posts', postsRouter);
app.use('/analytics', analyticsRouter);
app.use('/threads', threadsRouter);
app.use('/team', membersRouter);
app.use('/notifications', notificationsRouter);
app.use('/reports', reportsRouter);

// Sentry's error handler captures exceptions before our own responds (no-op if disabled).
if (sentryEnabled()) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
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
  const server = app.listen(env.port, () => {
    console.log(`Verve API listening on http://localhost:${env.port}`);
  });
  setupRealtime(server);
  publishDueScheduledPosts();
  setInterval(publishDueScheduledPosts, 60_000);
}
