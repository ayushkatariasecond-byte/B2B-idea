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

  it('throws in production when DATABASE_URL or ADMIN_EMAIL is unset', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-real-random-secret-value';
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
    process.env.JWT_SECRET = 'a-real-random-secret-value';
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(() => load().assertProductionSafety()).not.toThrow();
  });
});
