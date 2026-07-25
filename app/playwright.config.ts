import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests for the paths a real tester hits first. Deliberately not comprehensive —
 * this is the "did we ship something obviously broken" net, not a coverage effort.
 *
 * Requires the API (:4000) and the Expo web dev server (:8081) to be running. Both are
 * started automatically below when they aren't already up, so `npm run e2e` works from a
 * cold checkout as well as alongside a dev session you already have open.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:8081';

export default defineConfig({
  testDir: './e2e',
  // One worker on purpose: every test shares one database and one API rate-limit bucket
  // (the auth limiter keys by IP, and in dev it is NOT skipped the way it is under jest).
  // Parallel workers would make these tests fail for reasons that have nothing to do with
  // the app.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    // A phone-shaped viewport: this is a mobile-first app and the web build is the launch
    // target, so the bottom nav and single-column layout are what a tester will actually see.
    // Pixel 5 rather than an iPhone profile on purpose — the iPhone descriptors carry
    // `defaultBrowserType: 'webkit'`, which would try to launch a browser this environment
    // doesn't have while still being handed the Chromium executable path below.
    ...devices['Pixel 5'],
    // expo-location on web goes through the browser geolocation API. Granting it with a
    // fixed position keeps the GPS-dependent screens (feed, map) deterministic instead of
    // depending on whatever the runner's IP geolocates to.
    permissions: ['geolocation'],
    geolocation: { latitude: 30.2672, longitude: -97.7431 },
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Provided by the environment; never downloaded. See PLAYWRIGHT_BROWSERS_PATH.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium',
      // CI images and dev containers commonly run as root, where Chromium refuses to start
      // without this. Harmless on a normal user account, and this browser only ever loads
      // our own localhost dev server.
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../server',
      url: `${API_URL}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      // NODE_ENV=test switches OFF rate limiting (and nothing else — see server/src/security.ts,
      // where `skip` keys on exactly this, and env.ts, whose production checks are already
      // inert outside production).
      //
      // Why it's needed: the /auth limiter allows 100 requests per 15 minutes per IP, and
      // /auth/me counts toward it on every single page load. A full pass of this suite plus a
      // re-run inside the same window blows through that and the tests start failing with 429s
      // that have nothing to do with the app. Rate limiting itself is covered by the server
      // suite and by a live brute-force script, so nothing is lost by disabling it here.
      //
      // CAVEAT: with reuseExistingServer, an API you already started yourself keeps whatever
      // env you started it with. If you run these against your own `npm run dev`, expect 429s
      // on repeated runs.
      env: { NODE_ENV: 'test' },
    },
    {
      command: 'npm run web -- --port 8081',
      cwd: '.',
      url: WEB_URL,
      reuseExistingServer: true,
      // Expo's first web bundle is slow; this is the cold-start budget, not a per-test one.
      timeout: 240_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
