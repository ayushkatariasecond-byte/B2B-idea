# Verve API

Express + TypeScript + Prisma (SQLite) backend for the Verve B2B app.

## Setup

```bash
npm install
cp .env.example .env
npx prisma migrate dev --name init   # first time only; creates prisma/dev.db
npm run seed                         # seeds 6 demo businesses with posts, follows, views, messages
npm run dev                          # starts on http://localhost:4000
```

Demo login after seeding: `<handle>@verve.demo` / `password123` (e.g. `novarobotics@verve.demo`).

## Scripts

- `npm run dev` — start with auto-reload
- `npm run build` / `npm start` — compile and run production build
- `npm test` — Jest + Supertest API tests against an isolated SQLite test database
- `npm run seed` — (re)seed demo data (safe to re-run, upserts by handle)

## API surface

- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`
- `GET /businesses/:id`, `GET /businesses/handle/:handle`, `PATCH /businesses/me`, `POST /businesses/me/avatar`, `POST /businesses/me/cover`, `POST /businesses/:id/follow`, `GET /businesses/:id/posts`
- `GET /posts/feed?tab=forYou|following&page=`, `GET /posts/discover?tag=&q=`, `GET /posts/:id`, `POST /posts` (multipart, field `media`), `POST /posts/:id/like`, `POST /posts/:id/view`, `POST /posts/:id/share`
- `GET /posts/:id/comments`, `POST /posts/:id/comments`
- `GET /threads`, `POST /threads`, `GET /threads/:id/messages`, `POST /threads/:id/messages`
- `GET /analytics/me`

## Design notes

- **Creativity score** is computed live from caption quality + real engagement (`src/utils/score.ts`), not stored — it moves as a post actually performs. Trending = score ≥ 85.
- **For You** feed ranks by that live score (rewarding creative/engaging posts); **Following** ranks by recency among followed businesses — matching the product's "creative posts get seen, not suppressed" pitch.
- **Analytics** (views, engagement %, weekly chart, percentile, top post) are all computed from real `PostView`/`Like`/`Comment` rows, not hardcoded.
- Media uploads are stored on local disk under `uploads/` and served statically at `/uploads/...`. Swap for S3/Cloud Storage before production use.
