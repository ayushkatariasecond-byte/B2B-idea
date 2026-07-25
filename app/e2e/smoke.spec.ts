import { test, expect, Page } from '@playwright/test';
import {
  API_URL,
  PASSWORD,
  TEST_CITY,
  apiCreatePost,
  apiSignup,
  expectNoPageErrors,
  loginViaStorage,
  uid,
  watchForErrors,
} from './helpers';

/**
 * Smoke suite: the flows a real tester hits in their first five minutes.
 *
 * Deliberately shallow. Each test proves one path is reachable and doesn't explode; none of
 * them try to be exhaustive about the behaviour underneath, which is what the 237 server
 * tests are for. If one of these fails, the build isn't worth handing to a tester.
 *
 * TWO THINGS THAT WILL BITE ANYONE EDITING THIS FILE:
 *
 * 1. React Navigation keeps previously-visited screens MOUNTED in the DOM on web. So
 *    `document.body.innerText` (and a bare `getByText`) will happily match content from a
 *    screen you navigated away from. Assert on the URL, or on `toBeVisible()`, never on raw
 *    body text. A first pass at this file "proved" the Profile tab was broken purely because
 *    of this; the tab was fine.
 * 2. For the same reason, the bottom nav exists more than once in the DOM. Nav locators use
 *    `.last()` to hit the one belonging to the current screen.
 */

/**
 * A city string unique to one test.
 *
 * The For You feed is city/radius-locked and paginated at 20. The dev database persists
 * between runs, so tests that shared one city ended up competing with hundreds of leftover
 * posts and their own fixture would not be on page 1 — which failed as "the feed didn't
 * render my post" while the app was working perfectly. One city per test makes each feed
 * contain exactly that test's own data.
 */
function freshCity(): string {
  return `Smoketown${uid('')}`;
}

/**
 * A map location unique to one test run, far from every other test's.
 *
 * `freshCity()` is not enough for the geolocated tests: once a viewer HAS coordinates the
 * feed matches by 20-mile radius and ignores the city string entirely, so every restaurant
 * any previous run left at the same Austin coordinates still lands in this test's feed and
 * pushes its own fixture off page 1. Points are placed on a 2-degree grid (~138 miles
 * apart), comfortably outside the radius, so each run gets a neighbourhood to itself.
 */
function freshLocation(): { latitude: number; longitude: number } {
  const lat = 20 + Math.floor(Math.random() * 15) * 2 + Math.random() * 0.2;
  const lon = -170 + Math.floor(Math.random() * 60) * 2 + Math.random() * 0.2;
  return { latitude: Number(lat.toFixed(4)), longitude: Number(lon.toFixed(4)) };
}

/** The route the app is actually showing, independent of what's still mounted underneath. */
function routeOf(page: Page): Promise<string> {
  return page.evaluate(() => window.location.pathname);
}

async function tapNav(page: Page, label: 'Home' | 'Discover' | 'Messages' | 'Profile'): Promise<void> {
  await page.getByLabel(label, { exact: true }).last().click();
}

/** The feed is up when its own controls are visible — not merely present in the DOM. */
async function expectOnFeed(page: Page): Promise<void> {
  await expect(page.getByText('For You', { exact: true }).last()).toBeVisible({ timeout: 40_000 });
}

test.describe('1. Signup', () => {
  test('a restaurant can sign up and lands in the app, signed in', async ({ page }) => {
    const errors = watchForErrors(page);
    const handle = uid('rest');

    await page.goto('/');
    await page.getByText('Get Started', { exact: true }).first().click();

    await page.getByText('I run a restaurant', { exact: true }).click();
    await page.getByPlaceholder("Franklin's Firehouse BBQ").fill(`${handle} Kitchen`);
    await page.getByPlaceholder('franklinsfirehouse').fill(handle);
    await page.getByPlaceholder('Austin').fill(TEST_CITY);
    await page.getByText('Italian', { exact: true }).click();
    await page.getByPlaceholder('you@example.com').fill(`${handle}@smoke.test`);
    await page.getByPlaceholder('At least 8 characters').fill(PASSWORD);

    const signupCall = page.waitForResponse(
      (r) => r.url().includes('/auth/signup') && r.request().method() === 'POST'
    );
    await page.getByText('Create restaurant page', { exact: true }).click();
    expect((await signupCall).status()).toBe(201);

    // Signup does not drop you straight on the feed — it routes through the
    // "follow a few businesses" onboarding step first. That IS the correct screen.
    await expect(page.getByText('Follow a few businesses')).toBeVisible({ timeout: 40_000 });
    expect(await page.evaluate(() => localStorage.getItem('verve.authToken'))).toBeTruthy();

    await page.getByText('Continue', { exact: true }).click();
    await expectOnFeed(page);
    await expectNoPageErrors(errors);
  });

  test('a viewer can sign up and reaches the feed', async ({ page }) => {
    const errors = watchForErrors(page);
    const handle = uid('view');

    await page.goto('/');
    await page.getByText('Get Started', { exact: true }).first().click();

    await page.getByText("I'm just browsing", { exact: true }).click();
    await page.getByPlaceholder('Jamie').fill(`${handle} Diner`);
    await page.getByPlaceholder('franklinsfirehouse').fill(handle);
    await page.getByPlaceholder('Austin').fill(TEST_CITY);
    await page.getByPlaceholder('Just here to eat').fill('Hungry local');
    await page.getByPlaceholder('you@example.com').fill(`${handle}@smoke.test`);
    await page.getByPlaceholder('At least 8 characters').fill(PASSWORD);

    const signupCall = page.waitForResponse(
      (r) => r.url().includes('/auth/signup') && r.request().method() === 'POST'
    );
    await page.getByText('Create account', { exact: true }).click();
    expect((await signupCall).status()).toBe(201);

    await expect(page.getByText('Follow a few businesses')).toBeVisible({ timeout: 40_000 });
    expect(await page.evaluate(() => localStorage.getItem('verve.authToken'))).toBeTruthy();

    await page.getByText('Continue', { exact: true }).click();
    await expectOnFeed(page);
    await expectNoPageErrors(errors);
  });
});

test.describe('2. Login', () => {
  test('an existing account can log in and the feed renders its posts', async ({ page }) => {
    const errors = watchForErrors(page);
    const city = freshCity();
    const chef = await apiSignup({ handle: uid('chef'), isRestaurant: true, city });
    const caption = `Smoke login post ${uid()}`;
    await apiCreatePost(chef.token, caption);
    const diner = await apiSignup({ handle: uid('diner'), isRestaurant: false, city });

    await page.goto('/');
    await page.getByText('Sign in', { exact: true }).click();
    await page.getByPlaceholder('you@company.com').fill(diner.email);
    await page.getByPlaceholder('Your password').fill(PASSWORD);
    await page.getByText('Log in', { exact: true }).click();

    await expectOnFeed(page);
    // The feed contains real content, not just chrome.
    await expect(page.getByText(caption)).toBeVisible({ timeout: 40_000 });
    await expectNoPageErrors(errors);
  });
});

test.describe('3. Posting', () => {
  test('the compose flow accepts media, a caption, and submits successfully', async ({ page }) => {
    const errors = watchForErrors(page);
    const chef = await apiSignup({ handle: uid('poster'), isRestaurant: true });
    await loginViaStorage(page, chef.token);
    await expectOnFeed(page);

    await page.getByLabel('Create a new post').last().click();
    await expect(page.getByText('New Post', { exact: true })).toBeVisible({ timeout: 20_000 });

    // expo-image-picker on web opens a native file chooser rather than rendering an
    // <input type=file> that could be set directly, so the picker is driven through the
    // filechooser event. The drop zone is the trigger.
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Drop your video or image — 9:16 works best').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'smoke.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      ),
    });

    const caption = `Smoke composed post ${Date.now()}`;
    await page.getByPlaceholder('Fresh off the grill tonight...').fill(caption);

    const postCall = page.waitForResponse(
      (r) => r.url().endsWith('/posts') && r.request().method() === 'POST',
      { timeout: 40_000 }
    );
    await page.getByText('Post', { exact: true }).click();
    expect((await postCall).status()).toBe(201);
    await expectNoPageErrors(errors);
  });
});

test.describe('4. Restaurant profile', () => {
  test('a diner can open a restaurant profile from the feed and see its tabs', async ({ page }) => {
    const errors = watchForErrors(page);
    const city = freshCity();
    const chef = await apiSignup({ handle: uid('profile'), isRestaurant: true, city });
    await apiCreatePost(chef.token, `Profile smoke post ${uid()}`);
    const diner = await apiSignup({ handle: uid('profview'), isRestaurant: false, city });

    await loginViaStorage(page, diner.token);
    await expectOnFeed(page);

    // The whole header row is the tap target and carries an explicit label — far more
    // stable than clicking the name text, which also appears inside the caption line.
    await page.getByLabel(`View ${chef.handle} Kitchen's profile`).first().click();

    // The app's deep-linking config maps the BusinessProfile route to /biz/:id, so the URL
    // carries the path, not the route name.
    await expect.poll(() => routeOf(page), { timeout: 30_000 }).toContain('/biz/');
    await expect(page.getByText('About', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Posts', { exact: true })).toBeVisible();
    await expectNoPageErrors(errors);
  });
});

test.describe('5. Promo codes', () => {
  /**
   * SCOPE NOTE: there is no diner-facing "enter a code" screen. `POST /promo-codes/redeem`
   * is public by design (a redemption happens at a register, not in the app) and has no UI
   * and no API-client function anywhere in app/src. So the UI half here is the restaurant
   * side, and the redemption is driven the way it actually happens in production: an
   * unauthenticated call. What's asserted is the loop a restaurant actually depends on —
   * create a code, have it redeemed, see the count.
   */
  test('a restaurant creates a code, a redemption lands, and the count shows in stats', async ({ page }) => {
    const errors = watchForErrors(page);
    const chef = await apiSignup({ handle: uid('promo'), isRestaurant: true });
    const code = `SMOKE${Date.now().toString(36).slice(-5)}`.toUpperCase();

    await loginViaStorage(page, chef.token);
    await expectOnFeed(page);

    await tapNav(page, 'Profile');
    await expect.poll(() => routeOf(page), { timeout: 30_000 }).toContain('ProfileTab');

    await page.getByText('Promo Codes', { exact: true }).click();
    await expect.poll(() => routeOf(page), { timeout: 30_000 }).toContain('PromoCodes');

    // Two "Code" fields on this screen (create, and check-stats) — index them explicitly.
    const codeFields = page.getByPlaceholder('SAVE10');
    await codeFields.first().fill(code);
    await page.getByPlaceholder('10% off').fill('10% off your first order');

    const createCall = page.waitForResponse(
      (r) => r.url().endsWith('/promo-codes') && r.request().method() === 'POST'
    );
    await page.getByText('Create code', { exact: true }).click();
    expect((await createCall).status()).toBe(201);

    // Redeemed the way a real customer's code is: no login, at the register.
    const redeem = await fetch(`${API_URL}/promo-codes/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    expect(redeem.status).toBe(201);

    await codeFields.last().fill(code);
    const statsCall = page.waitForResponse((r) => r.url().includes('/stats'));
    await page.getByText('Check stats', { exact: true }).click();
    expect((await statsCall).status()).toBe(200);

    await expect(page.getByText('redemptions', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('10% off your first order').last()).toBeVisible();
    await expectNoPageErrors(errors);
  });
});

test.describe('6. API failure states (regression for the DiscoverScreen silent-failure bug)', () => {
  test('Discover shows an error message when its request fails, instead of stale or blank content', async ({ page }) => {
    const diner = await apiSignup({ handle: uid('discerr'), isRestaurant: false });
    await loginViaStorage(page, diner.token);
    await expectOnFeed(page);

    await page.route('**/posts/discover*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal server error"}' })
    );

    await tapNav(page, 'Discover');

    // The specific regression: this screen used try/finally with no catch, so a failed
    // request left the previous results on screen and said nothing at all.
    await expect(page.getByText(/Couldn't load results/i)).toBeVisible({ timeout: 30_000 });
  });

  test('Discover recovers once the API comes back', async ({ page }) => {
    const city = freshCity();
    const chef = await apiSignup({ handle: uid('discok'), isRestaurant: true, city });
    await apiCreatePost(chef.token, `Discover recovery post ${uid()}`);
    const diner = await apiSignup({ handle: uid('discrec'), isRestaurant: false, city });
    await loginViaStorage(page, diner.token);
    await expectOnFeed(page);

    let failNext = true;
    await page.route('**/posts/discover*', (route) => {
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
      }
      return route.continue();
    });

    await tapNav(page, 'Discover');
    await expect(page.getByText(/Couldn't load results/i)).toBeVisible({ timeout: 30_000 });

    // Typing re-triggers the debounced load; the retry is allowed through.
    await page.getByPlaceholder(/Search/i).first().fill('Discover');
    await expect(page.getByText(/Couldn't load results/i)).toHaveCount(0, { timeout: 30_000 });
  });

  test('the home feed shows an error message when its request fails', async ({ page }) => {
    const diner = await apiSignup({ handle: uid('feederr'), isRestaurant: false });
    await page.route('**/posts/feed*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal server error"}' })
    );
    await loginViaStorage(page, diner.token);

    await expect(page.getByText(/Couldn't load your feed/i)).toBeVisible({ timeout: 40_000 });
  });

  test('the home feed reports a network failure rather than hanging on a spinner', async ({ page }) => {
    const diner = await apiSignup({ handle: uid('feedoff'), isRestaurant: false });
    await page.route('**/posts/feed*', (route) => route.abort('failed'));
    await loginViaStorage(page, diner.token);

    // Any surfaced message is acceptable; what must not happen is a permanently blank
    // screen or an endless spinner.
    await expect(
      page.getByText(/Couldn't load your feed|check your connection|offline|try again/i).first()
    ).toBeVisible({ timeout: 40_000 });
  });
});

test.describe('7. Map view', () => {
  test('toggling to the map renders it with pins, and back to the list, without crashing', async ({ page }) => {
    const errors = watchForErrors(page);
    // Geolocated restaurants near the pinned viewer position, so there is something to pin.
    const city = freshCity();
    const home = freshLocation();
    const a = await apiSignup({ handle: uid('mapa'), isRestaurant: true, city, ...home });
    const b = await apiSignup({
      handle: uid('mapb'), isRestaurant: true, city,
      latitude: home.latitude + 0.02, longitude: home.longitude + 0.02,
    });
    const mapCaption = `Map smoke post ${uid()}`;
    await apiCreatePost(a.token, mapCaption);
    await apiCreatePost(b.token, `Map smoke post B ${uid()}`);
    const diner = await apiSignup({ handle: uid('mapview'), isRestaurant: false, city, ...home });

    await page.context().setGeolocation(home);
    await loginViaStorage(page, diner.token);
    await expectOnFeed(page);

    await page.getByText('Map', { exact: true }).last().click();

    // Leaflet mounted and placed markers. Tile imagery is deliberately NOT asserted: this
    // sandbox blocks tile.openstreetmap.org, and a basemap that fails to load is an
    // environment problem, not an app crash.
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 40_000 });
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 40_000 });

    await page.getByText('List', { exact: true }).last().click();
    await expect(page.getByText(mapCaption)).toBeVisible({ timeout: 30_000 });
    await expectNoPageErrors(errors);
  });

  test('toggling Map -> List immediately does not throw (Leaflet teardown regression)', async ({ page }) => {
    const errors = watchForErrors(page);
    const city = freshCity();
    // More than one pin, so the map runs fitBounds — that is the movement that used to still
    // be animating when the container unmounted.
    const home = freshLocation();
    const a = await apiSignup({ handle: uid('tdna'), isRestaurant: true, city, ...home });
    const b = await apiSignup({
      handle: uid('tdnb'), isRestaurant: true, city,
      latitude: home.latitude + 0.02, longitude: home.longitude + 0.02,
    });
    await apiCreatePost(a.token, `Teardown post ${uid()}`);
    await apiCreatePost(b.token, `Teardown post ${uid()}`);
    const diner = await apiSignup({ handle: uid('tdnv'), isRestaurant: false, city, ...home });

    await page.context().setGeolocation(home);
    await loginViaStorage(page, diner.token);
    await expectOnFeed(page);

    // Toggle back and forth without waiting, which is what a real impatient tap does.
    for (let i = 0; i < 3; i++) {
      await page.getByText('Map', { exact: true }).last().click();
      await page.waitForTimeout(400);
      await page.getByText('List', { exact: true }).last().click();
      await page.waitForTimeout(400);
    }

    // Before the fix this produced:
    //   "Cannot read properties of undefined (reading '_leaflet_pos')"
    await expectNoPageErrors(errors);
  });

  test('the map still resolves when location permission is denied', async ({ browser }) => {
    // A separate context: permissions are fixed at context creation, so this is the only way
    // to exercise the denied path rather than the granted one.
    const context = await browser.newContext({ permissions: [], locale: 'en-US' });
    const page = await context.newPage();
    const errors = watchForErrors(page);

    const city = freshCity();
    const chef = await apiSignup({ handle: uid('mapdeny'), isRestaurant: true, city });
    await apiCreatePost(chef.token, `Denied-location post ${uid()}`);
    const diner = await apiSignup({ handle: uid('mapdenyv'), isRestaurant: false, city });

    await loginViaStorage(page, diner.token);
    await expectOnFeed(page);

    await page.getByText('Map', { exact: true }).last().click();
    // Without coordinates there may be no pins at all — the requirement is that the screen
    // resolves to something (a map, or an explanatory message) rather than crashing or
    // spinning forever.
    await expect(page.getByText('List', { exact: true }).last()).toBeVisible({ timeout: 40_000 });
    await expectNoPageErrors(errors);

    await context.close();
  });
});
