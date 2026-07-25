import { Page, expect } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

/** Unique per run so repeated local runs don't collide on the unique email/handle indexes. */
export function uid(prefix = 'sm'): string {
  return `${prefix}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 6)}`;
}

export const TEST_CITY = 'Smoketown';
export const PASSWORD = 'password123';

/**
 * Creates an account straight through the API.
 *
 * Used for the *setup* of tests that are about something else (viewing a profile, redeeming
 * a code, loading a feed). Signup through the UI is itself covered by its own test — doing
 * it through the UI everywhere else would just make every test a signup test that also
 * fails whenever signup does.
 */
export async function apiSignup(opts: {
  handle: string;
  isRestaurant: boolean;
  city?: string;
  latitude?: number;
  longitude?: number;
}): Promise<{ token: string; id: string; handle: string; email: string }> {
  const email = `${opts.handle}@smoke.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      name: `${opts.handle} Kitchen`,
      handle: opts.handle,
      city: opts.city ?? TEST_CITY,
      isRestaurant: opts.isRestaurant,
      ...(opts.isRestaurant ? { cuisineSlug: 'italian' } : { category: 'Hungry local' }),
      ...(opts.latitude !== undefined ? { latitude: opts.latitude, longitude: opts.longitude } : {}),
    }),
  });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`apiSignup failed (${res.status}): ${JSON.stringify(body)}`);
  return { token: body.token, id: body.business.id, handle: opts.handle, email };
}

/** A published post, so feeds and profiles have something real to render. */
export async function apiCreatePost(token: string, caption: string): Promise<string> {
  const form = new FormData();
  form.append('caption', caption);
  form.append('tag', 'New Dish');
  // A real 1x1 PNG — uploads are content-verified server-side, so arbitrary bytes are rejected.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  form.append('media', new Blob([png], { type: 'image/png' }), 'smoke.png');
  const res = await fetch(`${API_URL}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`apiCreatePost failed (${res.status}): ${JSON.stringify(body)}`);
  return body.post.id;
}

export async function apiCreatePromoCode(token: string, code: string): Promise<void> {
  const res = await fetch(`${API_URL}/promo-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, discountDescription: '10% off your first order' }),
  });
  if (res.status !== 201) throw new Error(`apiCreatePromoCode failed (${res.status}): ${await res.text()}`);
}

/**
 * Seeds the auth token into localStorage before any app code runs, so a test can start
 * already-signed-in without paying for a UI login it isn't trying to test.
 *
 * The key ('verve.authToken') is what src/storage/tokenStorage.ts uses — on web,
 * expo-secure-store has no implementation so it falls through to AsyncStorage, which is
 * plain localStorage. Verified by reading the key back after a real UI login. If this ever silently stops working the tests
 * fail visibly (they land on the landing page instead of the feed) rather than passing hollow.
 */
export async function loginViaStorage(page: Page, token: string): Promise<void> {
  // addInitScript rather than goto -> setItem -> reload. The reload version worked but made
  // every test load the Expo dev bundle TWICE, and the second load intermittently never
  // finished inside the timeout — which surfaced as "the feed didn't render" on a random
  // test each run and looked like an app fault. Seeding storage before the first navigation
  // means one bundle load per test and no reload race at all.
  await page.addInitScript((t) => {
    window.localStorage.setItem('verve.authToken', t as string);
  }, token);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

/** Collects console errors and uncaught exceptions so every test can assert the page is clean. */
export function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Tunnel/proxy noise from this sandbox's blocked outbound hosts (OSM map tiles), and
    // the deliberate 500s a test itself injects, are not app defects.
    if (/ERR_TUNNEL|ERR_PROXY|tile\.openstreetmap|Failed to load resource/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

export async function expectNoPageErrors(errors: string[]): Promise<void> {
  expect(errors, `unexpected browser errors:\n${errors.join('\n')}`).toEqual([]);
}
