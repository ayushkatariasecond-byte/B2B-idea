# Verve (Expo app)

React Native client for Verve, built with Expo + TypeScript + React Navigation. Every screen is wired to the real API in `../server` — no mocked data, no static placeholder screens.

## Setup

```bash
npm install
npm run web     # runs at http://localhost:8081, requires the server running (see ../server/README.md)
# npm run ios / npm run android for native (requires the server reachable from the device —
# set EXPO_PUBLIC_API_URL in .env to your LAN IP instead of localhost)
```

## Structure

- `src/theme/` — design tokens (colors converted 1:1 from the design's oklch values, fonts, radius/spacing) and font loading
- `src/api/` — typed fetch client + one module per resource (auth, posts, businesses, threads, analytics)
- `src/context/AuthContext.tsx` — signup/login/logout, session restore from stored token
- `src/storage/tokenStorage.ts` — SecureStore on native, localStorage on web
- `src/navigation/` — root stack (auth stack vs. main stack) + bottom tabs
- `src/screens/` — one file per screen from the design (Onboarding, Home Feed, Discover, Compose, Post Detail, Profile, Business Profile, Edit Profile, Analytics, Messages, Thread)
- `src/components/` — shared UI (Icon set built with `react-native-svg` matching the design's icons, BottomNav, PostMedia, Avatar, etc.)

## Screens not in the original design

The design's 8 screens assumed viewing your *own* profile only. A real app also needs to show *other* businesses' profiles (with Follow/Message instead of Edit/Analytics) and a DM thread view, so `BusinessProfileScreen`, `EditProfileScreen`, and `ThreadScreen` were added — they reuse the same visual language (colors, type, components) as the rest of the app.

## Known platform notes

- Video posts render via `expo-video`; the seeded demo content is all images (matching the design's "imagery is placeholder only" note), so the video path is exercised less than the image path.
- On web, file pickers return a `blob:` URI that's fetched into a real `Blob` before upload; on native, Expo's fetch/FormData polyfill accepts the `{ uri, name, type }` shape directly — both paths are implemented in `src/api/posts.ts` / `src/api/businesses.ts`.
