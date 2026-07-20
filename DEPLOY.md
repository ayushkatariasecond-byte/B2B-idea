# Verve — Deploy to Production (Railway + Vercel)

This is the exact, click-by-click path to take Verve **live on the public internet**. It uses:

- **Railway** — hosts the backend API (Node/Express + WebSockets)
- **Supabase** — Postgres database + media storage (already provisioned: project `verve-prod`)
- **Vercel** — hosts the web app (the Expo web build)

Plan for ~60–90 minutes the first time. You need: a GitHub account (repo already there), and free
Railway + Vercel + Supabase accounts. Have the provisioned values from `HANDOFF.md §3.5` handy
(Supabase `DATABASE_URL`, `SENTRY_DSN`) plus the two keys you'll generate below.

---

## Part A — One-time prep (Supabase dashboard, ~10 min)

1. **Get the database URL.** Supabase → project **verve-prod** → *Project Settings → Database →
   Connection string → URI*. Copy it. It looks like
   `postgresql://postgres:[PASSWORD]@db.iftkjajuyhiojipjokem.supabase.co:5432/postgres`.
   The password is the one from `HANDOFF.md §3.5`. **This is `DATABASE_URL`.**
   - Tip: for a serverless host, also grab the **Connection pooling** URI (port 6543) and add
     `?pgbouncer=true` — but the direct URL above is fine to start.
2. **Create the storage bucket.** Supabase → **Storage** → *New bucket* → name it `media` →
   toggle **Public bucket** on → create. Then *Settings → API*: copy the **Project URL**
   (`SUPABASE_URL`) and the **`service_role` key** (`SUPABASE_SERVICE_KEY`). Keep the service key
   secret — it bypasses row security.
3. **Flip Prisma to Postgres** (one line, in the repo). In `server/prisma/schema.prisma` change:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
   Commit + push. (The schema is already applied to `verve-prod`; the server's `predev` step runs
   `prisma db push` on boot, which reconciles as a no-op.)

## Part B — Generate the two remaining keys (~5 min)

4. **SendGrid API key.** SendGrid → *Settings → API Keys → Create API Key* → "Restricted", enable
   **Mail Send** → create → copy it once. **This is `SENDGRID_API_KEY`.**
5. **Sentry DSN** — already provisioned (`HANDOFF.md §3.5`). **This is `SENTRY_DSN`.**

---

## Part C — Deploy the backend to Railway (~20 min)

6. Go to **railway.app** → *New Project* → **Deploy from GitHub repo** → pick
   `ayushkatariasecond-byte/b2b-idea`.
7. Railway will detect a Node app. Set the service's **Root Directory** to `server`.
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   (These come from `server/package.json`.)
8. Add **Variables** (Railway → your service → *Variables*). Paste each:
   ```
   DATABASE_URL      = <the Supabase URI from step 1>
   JWT_SECRET        = <a long random string — generate one, keep it secret>
   NODE_ENV          = production
   APP_WEB_URL       = https://<your-vercel-domain>   # fill in after Part D, then redeploy
   SENTRY_DSN        = <from HANDOFF §3.5>
   SENDGRID_API_KEY  = <from step 4>
   EMAIL_FROM        = ayushkatariasecond@gmail.com
   EMAIL_FROM_NAME   = Verve
   SUPABASE_URL      = <from step 2>
   SUPABASE_SERVICE_KEY = <from step 2>
   SUPABASE_BUCKET   = media
   ```
9. Deploy. When it's up, Railway gives you a URL like `https://verve-production.up.railway.app`.
   Test it: open `<that-url>/health` → you should see `{"ok":true}`. **This URL is your API base.**
   - Railway supports WebSockets by default, so the realtime `/ws` endpoint works with no extra config.

## Part D — Deploy the web app to Vercel (~20 min)

10. The web app needs to know the API URL at **build time**. In `app/`, the API base comes from
    `EXPO_PUBLIC_API_URL` (`app/src/api/client.ts`).
11. Go to **vercel.com** → *Add New Project* → import the same GitHub repo.
    - **Root Directory:** `app`
    - **Build command:** `npx expo export --platform web`
    - **Output directory:** `dist`
    - **Install command:** `npm install`
12. Add **Environment Variables**:
    - `EXPO_PUBLIC_API_URL = https://<your-railway-url>` (from step 9)
    - `EXPO_PUBLIC_SENTRY_DSN = <the same SENTRY_DSN>` (optional — turns on client-side error
      reporting from the web/mobile app; safe to expose, it's a client DSN)
13. Deploy. Vercel gives you a URL like `https://verve.vercel.app`. Open it — you should get the
    reopen intro, then the app, talking to your live backend.

## Part E — Wire the two sides together (~10 min)

14. **Point the app at the API** — done in step 12.
15. **Point the API at the app** — go back to Railway, set `APP_WEB_URL` to your Vercel URL
    (step 13), and redeploy. This makes the links inside emails point to the real site.
16. **Lock down CORS.** Right now the API accepts requests from any origin (`server/src/index.ts`).
    Before real launch, restrict it to your web domain. (This is on the security-hardening list;
    if that's already merged, set an `ALLOWED_ORIGIN` env var to your Vercel URL.)
17. **Custom domain (optional).** In Vercel add your domain (e.g. `verve.com`); in Railway add
    `api.verve.com`. Update `EXPO_PUBLIC_API_URL` and `APP_WEB_URL` to the custom domains and
    redeploy both.

---

## After it's live — smoke test checklist

- [ ] `<api-url>/health` returns `{"ok":true}`
- [ ] Sign up a new business on the live site → you receive the welcome email
- [ ] Post a photo/video → it uploads and plays (confirms Supabase Storage)
- [ ] "Forgot password?" → you receive the reset email → the link resets your password
- [ ] Break something on purpose (or check after a day) → the error shows in Sentry → project `verve-api`
- [ ] Invite a teammate → they receive the invite email

## Still required before a *public* launch (not deploy steps)

- **Legal review** of `terms-of-service.md` / `privacy-policy.md` / `dmca-policy.md` by a lawyer,
  and register a DMCA agent (it's a user-content platform). See `HANDOFF.md §4.7`.
- **Native app-store apps** (iOS/Android) are a separate track — see `HANDOFF.md §5`.

## Cost note

Railway, Vercel, and Supabase all have free tiers that comfortably cover a launch/beta. You'll only
pay once you have meaningful traffic or need always-on backend hours. SendGrid's free tier sends
~100 emails/day, plenty to start.
