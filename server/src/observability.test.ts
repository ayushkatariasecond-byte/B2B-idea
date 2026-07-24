// Isolated in its own test file so jest.resetModules() here — needed because
// initSentry()'s "already initialized" flag is module-level state — can't disturb the
// main suite, which imports index.ts (and therefore observability.ts) once at the top
// with no SENTRY_DSN set, and relies on Sentry staying off for the whole run.
//
// What this proves: the activation gating itself is correct (no DSN → inert; a DSN →
// initialized). What it CANNOT prove: that a real error actually lands in a Sentry
// dashboard — there is no SENTRY_DSN configured for Nibbler anywhere (not locally, not in
// any deployment, since Nibbler has never been deployed), and deliberately did not test
// against the original Verve/pivot project's existing "verve-api" DSN, since reusing it
// would violate the env/secret separation this same hardening pass was asked to confirm.
describe('Sentry activation gating', () => {
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    jest.resetModules();
  });

  it('stays inert with no SENTRY_DSN set (Nibbler\'s actual current state)', () => {
    delete process.env.SENTRY_DSN;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const observability = require('./observability');
    const result = observability.initSentry();
    expect(result).toBe(false);
    expect(observability.sentryEnabled()).toBe(false);
  });

  it('activates when a DSN is present', () => {
    process.env.SENTRY_DSN = 'https://fake-key@o0.ingest.sentry.io/0';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const observability = require('./observability');
    const result = observability.initSentry();
    expect(result).toBe(true);
    expect(observability.sentryEnabled()).toBe(true);
  });
});
