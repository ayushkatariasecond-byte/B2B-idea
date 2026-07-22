// Shared between globalSetup.ts (resets the schema before the run) and setupEnv.ts
// (points the actual test processes at the same database). Override with
// TEST_DATABASE_URL if the default local Postgres isn't where your test DB lives.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/verve_test';
