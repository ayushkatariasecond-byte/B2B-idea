// env.ts calls dotenv.config() at module load, which fills in any process.env key that
// ISN'T already set from the real .env file on disk — so a test that does
// `delete process.env.JWT_SECRET` to simulate "missing" would otherwise get it silently
// refilled from that file the moment `require('./env')` re-runs. Mocking dotenv makes this
// suite the sole authority over process.env, regardless of what's actually in .env.
jest.mock('dotenv', () => ({ config: jest.fn() }));

/**
 * assertProductionSafety() is what stands between a misconfigured production deploy and
 * silently signing every auth token with a hardcoded, publicly-known secret. Tested in
 * isolation (not via supertest) since it's a pure startup check with no DB/HTTP involved —
 * each case re-imports the module fresh so env.ts's one-time `dotenv.config()` / object
 * construction picks up the process.env values this test just set.
 */
describe('assertProductionSafety', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function load() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./env') as typeof import('./env');
  }

  it('does nothing outside production, even with no config at all', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.ADMIN_EMAIL;
    expect(() => load().assertProductionSafety()).not.toThrow();
  });

  it('throws in production when JWT_SECRET is unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(() => load().assertProductionSafety()).toThrow(/JWT_SECRET/);
  });

  it('throws in production when JWT_SECRET is still the insecure default', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-secret-change-me';
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(() => load().assertProductionSafety()).toThrow(/JWT_SECRET/);
  });

  // The example config shipped `change-me-in-production`, which is NOT the same string as
  // this file's `dev-secret-change-me` fallback — so before this, the single most likely
  // route to production (copy .env.example, fill in the database URL, deploy) passed the
  // safety check while signing tokens with a value published in the repo.
  it.each([
    'change-me-in-production',
    'CHANGE-ME-IN-PRODUCTION',
    '  change-me-in-production  ',
    'changeme',
    'secret',
  ])('throws in production when JWT_SECRET is the placeholder %p', (secret) => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = secret;
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(() => load().assertProductionSafety()).toThrow(/JWT_SECRET/);
  });

  it('throws in production when JWT_SECRET is too short to be a real key', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'hunter2';
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(() => load().assertProductionSafety()).toThrow(/JWT_SECRET is only 7 characters/);
  });

  it('rejects the placeholder that ships in .env.example', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'REPLACE_ME_RUN_openssl_rand_hex_32';
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    // Long enough to clear the length bar, so this only passes if the placeholder list
    // itself catches it — which is the point.
    expect(() => load().assertProductionSafety()).toThrow(/JWT_SECRET/);
  });

  it('throws in production when DATABASE_URL or ADMIN_EMAIL is unset', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '3f9a1c7d2e8b45061f2a9c3d7e5b8a04c6d1e9f2a3b4c5d6e7f8091a2b3c4d5e';
    delete process.env.DATABASE_URL;
    delete process.env.ADMIN_EMAIL;
    let message = '';
    try {
      load().assertProductionSafety();
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/ADMIN_EMAIL/);
  });

  it('does not throw in production once every required value is set properly', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '3f9a1c7d2e8b45061f2a9c3d7e5b8a04c6d1e9f2a3b4c5d6e7f8091a2b3c4d5e';
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(() => load().assertProductionSafety()).not.toThrow();
  });
});
