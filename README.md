# Verve

A B2B marketing/social app — LinkedIn's reach with an Instagram/TikTok-style feed. Businesses post short-form content; a live "creativity score" rewards engaging posts instead of suppressing them, surfaced through a dedicated For You discovery feed.

This repo turns the design handoff (`design_handoff_verve_app/`) into a working full-stack app:

- **`server/`** — Express + TypeScript + Prisma (SQLite) API: auth, posts/feed/discover, likes, comments, follows, messaging, and analytics computed from real engagement data. See `server/README.md`.
- **`app/`** — Expo (React Native) client with real navigation, forms, and media upload wired to the API — no mocked screens. See `app/README.md`.

## Quick start

Terminal 1 (API):
```bash
cd server
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run seed
npm run dev        # http://localhost:4000
```

Terminal 2 (app, web preview):
```bash
cd app
npm install
npm run web         # http://localhost:8081
```

Sign up fresh, or log in as one of the seeded demo businesses (`novarobotics@verve.demo` / `password123`, etc. — see `server/README.md`).

For a real device/simulator, set `EXPO_PUBLIC_API_URL` in `app/.env` to your machine's LAN IP instead of `localhost`.

## Notable product decisions made while building this

- **Profile is context-aware**: your own business page shows *Edit profile* + *View Analytics*; every other business's page shows *Follow* + *Message* instead. The original prototype showed both on one screen, which doesn't make sense once you can't follow/message yourself.
- **Creativity score is computed, not decorative**: it's derived from caption quality plus real likes/comments/shares (`server/src/utils/score.ts`), so it moves as a post actually performs. For You ranks by this score; Following ranks by recency.
- **Analytics is 100% real data** — views, engagement deltas, the weekly chart, the percentile rank, and the top post are all queried/computed from the same Like/Comment/PostView rows the rest of the app writes to, not hardcoded demo numbers.
