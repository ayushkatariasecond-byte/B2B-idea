# Nibbler — Deploy to Production (Railway + Vercel)

This is the exact, click-by-click path to take **Nibbler** (the city-locked restaurant video app,
forked from the pre-pivot Verve codebase) live on the public internet. It uses:

- **Railway** — hosts the backend API (Node/Express + WebSockets)
- **Supabase** — Postgres database + media storage
- **Vercel** — hosts the web app (the Expo web build)

Plan for ~30–45 minutes — most of the provisioning below is already done (see "What's already
provisioned" first). You need: a GitHub account (repo already there), and free Railway + Vercel
accounts.

---

## Which Supabase project — read this first

This repo also has an older Supabase project, **`verve-prod`**, referenced in `HANDOFF.md` — that
one was provisioned for the pre-pivot Verve app (or possibly the separate agency-directory pivot
branch) and its schema was last verified against an earlier, different data model. **Do not point
Nibbler at `verve-prod`.**

Nibbler has its own dedicated project, **`nibbler-prototype`** (ref `lfktfjeyuzdloohvzqbx`), created
during this fork's own hardening pass, with the current Nibbler schema (restaurants, cuisines, city
lock, promo codes) already migrated and verified against it. Use this one. If you'd rather not run a
public launch on a project literally named "-prototype," rename it from the Supabase dashboard
(Project Settings → General) — same ref, same data, just a cosmetic name change.

---

## What's already provisioned (done — don't redo)

- **Postgres** — `nibbler-prototype`'s schema is applied and this branch's Prisma `datasource` is
  already set to `postgresql` (not sqlite). Local dev already runs against it.
- **Media storage** — a public `media` bucket exists on `nibbler-prototype` (50MB limit, restricted
  to the same image/video mimetype allowlist as `server/src/upload.ts` — nothing else can land in it).
- **Sentry** — org `verve` / project `verve-api` exists with a live, tested DSN.
- **SendGrid** — sender `ayushkatariasecond@gmail.com` is verified and already sending real mail
  (domain authentication isn't set up, which affects deliverability polish, not whether it works).
- **Production secret** — a fresh, random `JWT_SECRET` has been generated (see the values handed to
  you separately in chat — never commit real secrets into this file).
- **`server/src/env.ts`** now refuses to boot in production at all unless `JWT_SECRET`,
  `DATABASE_URL`, and `ADMIN_EMAIL` are properly set — a misconfigured deploy fails loudly on
  startup instead of silently running insecure.

## Still needed from you (can't be scripted)

1. **A SendGrid API key.** SendGrid → *Settings → API Keys → Create API Key* → "Restricted", enable
   **Mail Send** → create → copy it once (shown only at creation time). This is `SENDGRID_API_KEY`.
2. **Railway access.** The Composio connection to your Railway account is currently returning an
   authorization error on basic queries — reconnect it, or just do the steps in Part A below by hand
   in Railway's own dashboard (genuinely ~10 minutes).
3. **Real launch-city content.** The For You feed is hard city-locked — a city with zero posts shows
   an empty feed to its first visitor. `npm run seed:city -- "Your City"` (in `server/`) drops in six
   placeholder-image example restaurants to prove the pipeline end to end, but — **read the warning
   at the top of `server/prisma/seedCity.ts` before running this against a real public database** —
   it's flat-color placeholder images and fictional business names, not a substitute for real content
   from real restaurants.

---

## Part A — Deploy the backend to Railway (~15 min)

1. Go to **railway.app** → *New Project* → **Deploy from GitHub repo** → pick this repo, branch
   `claude/nibbler-prototype`.
2. Set the service's **Root Directory** to `server`.
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
3. Add these **Variables** (Railway → your service → *Variables*). The real values for the ones
   marked *(provisioned)* were given to you separately in chat, not in this file:
   ```
   DATABASE_URL          = <nibbler-prototype's connection string>       (provisioned)
   JWT_SECRET            = <the generated secret>                       (provisioned)
   NODE_ENV              = production
   ADMIN_EMAIL           = ayushkatariasecond@gmail.com
   APP_WEB_URL           = https://<your-vercel-domain>   # fill in after Part B, then redeploy
   ALLOWED_ORIGIN        = https://<your-vercel-domain>   # same — locks CORS to just your web app
   SENTRY_DSN            = <the verve-api DSN>                          (provisioned)
   SENDGRID_API_KEY      = <the key you generate in step 1 above>
   EMAIL_FROM            = ayushkatariasecond@gmail.com
   EMAIL_FROM_NAME       = Nibbler
   SUPABASE_URL          = https://lfktfjeyuzdloohvzqbx.supabase.co
   SUPABASE_SERVICE_KEY  = <nibbler-prototype's service-role key>       (provisioned)
   SUPABASE_BUCKET       = media
   ```
4. Deploy. Railway gives you a URL like `https://nibbler-production.up.railway.app`. Test
   `<that-url>/health` → `{"ok":true,"db":"connected"}`. **This URL is your API base.**
   WebSockets (`/ws`) work with no extra Railway config.

## Part B — Deploy the web app to Vercel (~15 min)

5. **vercel.com** → *Add New Project* → import this repo, branch `claude/nibbler-prototype`.
   - **Root Directory:** `app`
   - **Build command:** `npx expo export --platform web`
   - **Output directory:** `dist`
   - **Install command:** `npm install`
6. Add **Environment Variables**:
   - `EXPO_PUBLIC_API_URL = https://<your-railway-url>` (from Part A step 4)
7. Deploy. Vercel gives you a URL (`https://nibbler.vercel.app` or similar). Open it — you should
   land on the new landing screen, then be able to sign up and reach a live, working app.

## Part C — Wire the two sides together (~5 min)

8. Go back to Railway, set `APP_WEB_URL` and `ALLOWED_ORIGIN` to the real Vercel URL from Part B,
   redeploy. This makes email links point to the real site and locks CORS to just that origin.
9. **Custom domain (optional).** Point it at Vercel for the web app; add a subdomain (e.g.
   `api.yourdomain.com`) pointed at Railway for the backend. Update `EXPO_PUBLIC_API_URL`,
   `APP_WEB_URL`, and `ALLOWED_ORIGIN` to match, redeploy both sides.

---

## After it's live — smoke test checklist

- [ ] `<api-url>/health` returns `{"ok":true,"db":"connected"}`
- [ ] Sign up a new restaurant account on the live site → welcome email arrives
- [ ] Post a photo/video → it uploads and plays back (confirms Supabase Storage is actually wired,
  not silently falling back to local disk)
- [ ] Upload a profile avatar → same check
- [ ] "Forgot password?" → reset email arrives → the link resets your password
- [ ] Trigger an error on purpose (or check after a day) → it shows up in Sentry, project `verve-api`
- [ ] Invite a teammate → they receive the invite email
- [ ] The city you launched in actually shows content in the For You feed (see seed-content note above)

## Troubleshooting: every login path fails at once

If guest, viewer, and restaurant sign-in all break *simultaneously*, the cause is almost never
any one flow — it's something all three share. Check in this order:

1. **`<api-url>/health`.** `{"ok":false,"db":"unreachable"}` means the database, not the app.
   Auth routes now answer **503** ("temporarily unavailable (database)") rather than a bare 500
   when this happens, so a 503 on `/auth/guest` is the same signal.
2. **Railway runtime logs.** `Authentication failed against database server ... credentials for
   'postgres' are not valid` is the fingerprint of the failure described below.
3. **CORS.** A misconfigured `ALLOWED_ORIGIN` blocks the browser *silently* — no server-side log
   at all, because the request is rejected before it matters. Confirm the API returns an
   `Access-Control-Allow-Origin` header for your web origin:
   `curl -sI -H "Origin: https://<your-vercel-domain>" <api-url>/health | grep -i access-control`
   The value must match the origin **byte for byte** — a trailing slash, `http` instead of
   `https`, or stray quotes each produce a total, silent block. (Unset is *not* the failure mode:
   with no `ALLOWED_ORIGIN` the API reflects any origin, which is why local dev works.)

### ⚠️ Changing `POSTGRES_PASSWORD` on a Railway Postgres does NOT change the password

This has already caused one outage. Postgres reads `POSTGRES_PASSWORD` **only when it initialises
an empty data directory**. The Railway Postgres service has a persistent volume, so on every
later deploy the variable is ignored and the role keeps whatever password it was created with.

Editing that variable therefore does something worse than nothing: `${{Postgres.DATABASE_URL}}`
— which the API consumes — immediately starts advertising the *new* password, while the database
still expects the *old* one. Every query then fails at the connection stage, so **every** auth
path breaks at once while the service still reports a healthy deploy.

There is no supported way to read the old password back out of Railway (the UI and API both mask
it), so if it wasn't saved, it's gone. Recovery is to point `DATABASE_URL` at a freshly
provisioned Postgres (migrations re-run automatically via `prestart`; then run `npm run
seed:cuisines`, or restaurant signup will reject every account with "Unknown cuisine type").

**Never edit `POSTGRES_PASSWORD` on a database that holds data you want.**

## Still required before a genuinely *public* launch (not deploy steps)

- **Legal review.** `legal/terms-of-service.md`, `legal/privacy-policy.md`, `legal/dmca-policy.md`
  are rebranded for Nibbler but are still **unreviewed drafts** — a lawyer needs to look at these
  (DMCA agent registration, GDPR/CCPA fit, age gating) before opening to strangers. Don't skip this
  because the rest of the checklist is green.
- **Native app-store apps** (iOS/Android) are a separate track, not covered here — ask if you want
  that scoped out.

## Cost note

Railway, Vercel, and Supabase all have free tiers that comfortably cover a launch/beta. One thing to
watch specifically: **Supabase's free tier pauses a project after about a week of inactivity** —
worth knowing if there's a gap between test sessions, since the whole app goes down with it until
someone manually unpauses it from the dashboard.
