# Verve — Handoff & Go-Live Guide

Hi 👋 — this doc is for the developer taking Verve from "runs on my laptop" to "live and public."
It assumes you're comfortable with Node.js, a bit of DevOps, and deploying web apps. Everything
below is accurate to the current codebase (not generic advice) — file references are included so
you can jump straight to the code.

---

## 1. What this is

**Verve** is a B2B social app — an Instagram/TikTok-style short-video feed for businesses, with a
computed "creativity score" that ranks posts by real engagement.

**Stack**
- **`server/`** — Express + TypeScript + Prisma. Auth (JWT), posts/feed/discover, likes, comments,
  follows, DMs, analytics, teams, notifications, scheduling, moderation, hashtags, saved posts.
  Real-time via a `ws` WebSocket server (`server/src/realtime.ts`). Tests in `server/src/__tests__`.
- **`app/`** — Expo (React Native) client. Runs on web (`npm run web`) and native (iOS/Android).
  Talks to the API via `app/src/api/`.
- **Database** — currently **SQLite** (a local file). ⚠️ This must change for production — see §4.1.

**Repo layout**
```
server/   API + database (Prisma schema in server/prisma/schema.prisma)
app/      Expo client
legal drafts: terms-of-service.md, privacy-policy.md, dmca-policy.md   ← need a lawyer, see §4.7
.github/workflows/ci.yml   ← CI runs typecheck + tests on every push
```

---

## 2. Run it locally first (to get oriented)

Two terminals.

**Terminal 1 — backend**
```bash
cd server
npm install
cp .env.example .env   # if .env.example is missing, create .env with the vars in §4.3
npm run dev            # auto-applies DB migrations, then starts on http://localhost:4000
```
Wait for `Verve API listening on http://localhost:4000`. Sanity check: open http://localhost:4000/health → `{"ok":true}`.

**Terminal 2 — app (web preview)**
```bash
cd app
npm install
npm run web            # http://localhost:8081
```

Seed demo data if you want content: `cd server && npm run seed`.

---

## 3. What's already done (don't rebuild these)

- Full auth, feed/discover, posts w/ image+video upload (server transcodes video via ffmpeg), likes,
  comments, follows, DMs, analytics (computed from real engagement), teams, notifications, post
  scheduling/drafts, saved posts, hashtags/search, comment moderation, block/report, a cold-start
  onboarding flow, deep-linkable public post/profile pages, and a settings screen (data export/delete,
  verification request).
- A scroll-driven reopen/cold-start intro animation (`app/src/screens/ReopenIntro.tsx`).
- Backend test suite (`npm test` in `server/`, ~39 tests) and CI (`.github/workflows/ci.yml`).

---

## 3.5 Already provisioned & wired (production services)

The backend is now integrated with Postgres, error monitoring, and email. Each integration is
**env-guarded** — it stays off (and local dev keeps using SQLite + local disk) until you set the
variables on your host. Code: `server/src/observability.ts` (Sentry), `server/src/email.ts`
(SendGrid), `server/src/storage.ts` (Supabase Storage). All values go in the host's env vars — see
`server/.env.example`.

- **Postgres (Supabase `verve-prod`)** — project created and the full schema (all 15 tables) is
  applied and verified. To use it: set `provider = "postgresql"` in `prisma/schema.prisma`, set
  `DATABASE_URL` to the Supabase connection string, and deploy. The schema already matches, so
  `prisma db push` (the server's `predev` fallback) reconciles as a no-op.
- **Sentry** — org `verve` / project `verve-api` created, DSN issued and tested (a live event was
  received). Set `SENTRY_DSN` to turn it on.
- **SendGrid** — sender `ayushkatariasecond@gmail.com` verified; a live test email was delivered.
  Wired to send a welcome email on signup and an invite email to new team members. Generate a
  SendGrid **API key** and set `SENDGRID_API_KEY` to turn on real sending in production.

**Remaining manual steps (need dashboard access I can't script):**
1. Generate a **SendGrid API key** (dashboard → Settings → API Keys) → `SENDGRID_API_KEY`.
2. Create a **public Storage bucket** in the `verve-prod` Supabase project (default name `media`),
   grab the project's `SUPABASE_URL` + **service-role key** → `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
3. At deploy, flip the Prisma provider to `postgresql` and set the Supabase `DATABASE_URL`.

## 4. MUST DO before going public

These are the blockers. Roughly ordered. (Several are now largely handled — see §3.5.)

### 4.1 Move the database off SQLite → Postgres
SQLite is a single local file — it can't handle concurrent users and is wiped on most cloud hosts.
- In `server/prisma/schema.prisma`, change `datasource db { provider = "sqlite" }` → `"postgresql"`.
- Provision a managed Postgres (Neon, Supabase, Railway, or RDS). Put its connection string in
  `DATABASE_URL`.
- The existing migrations in `server/prisma/migrations/` were generated for SQLite. Cleanest path:
  delete that folder, then run `npx prisma migrate dev --name init` against Postgres to regenerate them.
- Deploy migrations in prod with `npx prisma migrate deploy` (the server already runs this on start;
  see `server/package.json` `predev`).

### 4.2 Move file uploads off local disk → object storage
Right now uploads are written to `server/uploads/` on local disk (`server/src/upload.ts`, multer
`diskStorage`) and served via `express.static('/uploads')` (`server/src/index.ts:20`). **On cloud
hosts local disk is ephemeral — every uploaded photo/video disappears on the next deploy or restart.**
- Swap multer `diskStorage` for an S3-compatible store (AWS S3, Cloudflare R2, or Supabase Storage).
- Store the returned object URL on the post instead of a `/uploads/...` path.
- Update `resolveMediaUrl()` in `app/src/api/client.ts` (it currently prefixes the API base URL for
  relative paths — with real object URLs it'll pass them through, which already works).
- Video transcoding (`server/src/utils/videoTranscode.ts`) currently runs inline on the web server.
  For scale, move it to a background job/queue, but inline is fine to launch.

### 4.3 Secrets & config
Set these as real environment variables on the host (never commit them):
- `DATABASE_URL` — the Postgres URL (§4.1).
- `JWT_SECRET` — a long random string. It currently **defaults to a dev value**
  (`server/src/env.ts`). If you don't set it, everyone's tokens are forgeable. **Blocker.**
- `PORT` — the host usually provides this.
- **App side:** set `EXPO_PUBLIC_API_URL` (`app/.env`) to your deployed **https** API URL. It's
  currently `http://localhost:4000`.

### 4.4 Lock down CORS
`server/src/index.ts:18` is `app.use(cors())` — open to every origin. Restrict it to your web app's
domain before launch.

### 4.5 Deploy the backend
Any Node host works (Render, Railway, Fly.io, a VM). Build with `npm run build`, run `npm start`
(`server/package.json`). Make sure it can reach Postgres and object storage, has the env vars from
§4.3, and serves over HTTPS. Note the WebSocket server (`/ws`) shares the same HTTP server — the host
must allow WebSocket upgrades.

### 4.6 Deploy the web app
`cd app && npx expo export --platform web` produces a static web build → host on Vercel, Netlify, or
Cloudflare Pages. Set `EXPO_PUBLIC_API_URL` at build time to the prod API. Point a domain at it.

### 4.7 Legal — get a real review ⚠️
`terms-of-service.md`, `privacy-policy.md`, and `dmca-policy.md` exist but are **unreviewed drafts**.
This is a user-generated-content platform, so before public launch you need a lawyer to cover, at
minimum: a registered DMCA agent, a privacy policy that matches what you actually collect (GDPR/CCPA),
content/community guidelines, and age gating. **Do not launch to the public on the drafts alone.**

### 4.8 Basic security hardening
- Rate-limit auth + write endpoints (e.g. `express-rate-limit`).
- Confirm inputs are validated (the app uses `zod` in places — extend to all write routes).
- HTTPS everywhere (hosts above give you this).
- Rotate `JWT_SECRET` and any keys that were ever in a shared `.env`.

---

## 5. Optional / later (deferred on purpose)

- **Mobile app stores.** `app/app.json` still has placeholder `name`/`slug` and no bundle IDs. To ship
  native apps: set real app name/icons/bundle identifiers, build with **EAS** (`eas build`), and submit.
  Needs an Apple Developer account ($99/yr) and Google Play account ($25 once). Push notifications work
  via Expo but need FCM (Android) / APNs (iOS) credentials for standalone builds.
- **Monetization (Stripe).** Not built. Add when you have a paid plan/ads model.
- **Scale infra.** Redis (caching/sessions), a real search index (the search is DB `LIKE` queries
  today), and multi-instance WebSocket fan-out — only needed once traffic grows.
- **Monitoring & backups.** Add error tracking (Sentry), uptime monitoring, and automated Postgres
  backups before you have real users depending on it.

---

## 6. Recommended fastest path to "public" (an opinionated stack)

If you just want it live quickly with the least moving parts:
1. **Postgres:** Neon (free tier) → set `DATABASE_URL`.
2. **Uploads:** Cloudflare R2 (S3-compatible, cheap egress) → rewire `server/src/upload.ts`.
3. **Backend:** Railway or Render (auto-deploys from this GitHub repo, gives HTTPS + a URL).
4. **Web app:** Vercel (point it at `app/`, `expo export --platform web`, set `EXPO_PUBLIC_API_URL`).
5. **Domain:** Cloudflare DNS → web app; `api.yourdomain.com` → backend.
6. **Legal:** lawyer review of the three drafts + register a DMCA agent.

That gets a public **website** live. Native app-store apps are a separate track (§5).

---

## 7. Codebase gotchas cheat-sheet

| Thing | Where | Note |
|---|---|---|
| DB provider | `server/prisma/schema.prisma` | `sqlite` → `postgresql` for prod |
| Migrations | `server/prisma/migrations/` | regenerate for Postgres |
| Uploads (ephemeral!) | `server/src/upload.ts`, `index.ts:20` | move to object storage |
| JWT secret default | `server/src/env.ts` | **must** override in prod |
| Open CORS | `server/src/index.ts:18` | restrict to web domain |
| API URL | `app/.env` (`EXPO_PUBLIC_API_URL`) | set to prod https URL |
| WebSockets | `server/src/realtime.ts` (`/ws`) | host must allow WS upgrades |
| Video transcode | `server/src/utils/videoTranscode.ts` | inline; move to a queue at scale |
| CI | `.github/workflows/ci.yml` | typecheck + tests on every push |

Questions on any of this — the code is organized and typechecks clean; start with `server/src/index.ts`
(routes) and `app/src/navigation/RootNavigator.tsx` (screens).
