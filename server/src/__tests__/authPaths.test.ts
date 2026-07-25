import request from 'supertest';
import { app } from '../index';
import { prisma, isDatabaseUnavailableError } from '../db';

/**
 * Regression suite for the three ways into Nibbler: guest, viewer, restaurant.
 *
 * Written after a production incident in which ALL THREE failed at once. The cause was not
 * in any one flow's logic — the deployed DATABASE_URL carried a password the database no
 * longer accepted, so every query failed at the connection stage. What made it expensive to
 * diagnose was the reporting, not the breakage:
 *
 *   - every auth route answered a bare 500 "Internal server error", which is what this app
 *     says when it has a BUG, so the logs pointed at the code rather than at the database;
 *   - the guest screen threw the server's message away and always said "Something went
 *     wrong starting a guest session", which is equally true of a network drop, a 429, or a
 *     500 — three completely different problems, one sentence.
 *
 * So these tests assert two separate things: that all three paths work, and that when the
 * database is unreachable they all say so *specifically*. The second half is what would have
 * turned that outage into a one-line diagnosis.
 */

/** Exactly the shape Prisma raises when it cannot open a connection (bad credentials, host down). */
function databaseDownError(): Error {
  return Object.assign(new Error('Authentication failed against database server'), {
    name: 'PrismaClientInitializationError',
  });
}

const uniq = () => Math.random().toString(36).slice(2, 10);

describe('Auth entry paths: guest, viewer, restaurant', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('healthy database', () => {
    it('lets a visitor in as a guest', async () => {
      const res = await request(app).post('/auth/guest').send({});
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.business.handle).toBe('guest');
    });

    it('signs up and logs in a viewer (non-restaurant) account', async () => {
      const handle = `viewer${uniq()}`;
      const email = `${handle}@test.com`;

      const signup = await request(app).post('/auth/signup').send({
        email,
        password: 'password123',
        name: 'A Viewer',
        handle,
        city: 'Testville',
        category: 'Food lover',
      });
      expect(signup.status).toBe(201);
      expect(signup.body.business.isRestaurant).toBe(false);

      const login = await request(app).post('/auth/login').send({ email, password: 'password123' });
      expect(login.status).toBe(200);
      expect(typeof login.body.token).toBe('string');
    });

    it('signs up and logs in a restaurant account', async () => {
      const handle = `resto${uniq()}`;
      const email = `${handle}@test.com`;

      const signup = await request(app).post('/auth/signup').send({
        email,
        password: 'password123',
        name: 'A Restaurant',
        handle,
        city: 'Testville',
        isRestaurant: true,
        cuisineSlug: 'italian',
      });
      expect(signup.status).toBe(201);
      expect(signup.body.business.isRestaurant).toBe(true);
      expect(signup.body.business.cuisine?.slug).toBe('italian');

      const login = await request(app).post('/auth/login').send({ email, password: 'password123' });
      expect(login.status).toBe(200);
    });

    /**
     * Restaurant signup depends on reference data existing, which is a real deployment
     * failure mode rather than a hypothetical: on the live database this table was empty, so
     * `/cuisines` returned [] and every restaurant signup was rejected with "Unknown cuisine
     * type" while guest and viewer signup worked perfectly. That asymmetry is exactly the
     * kind of thing that reads as "restaurant login is broken".
     */
    it('serves the cuisine taxonomy that restaurant signup depends on', async () => {
      const res = await request(app).get('/cuisines');
      expect(res.status).toBe(200);
      expect(res.body.cuisines.length).toBeGreaterThan(0);
      expect(res.body.cuisines.map((c: { slug: string }) => c.slug)).toContain('italian');
    });
  });

  /**
   * The incident itself. Each path is broken at the connection layer and must report an
   * outage (503), not a bug (500) — for all three, identically.
   */
  describe('database unreachable', () => {
    it('answers 503, not 500, when the guest upsert cannot reach the database', async () => {
      jest.spyOn(prisma.business, 'upsert').mockRejectedValue(databaseDownError());

      const res = await request(app).post('/auth/guest').send({});

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/temporarily unavailable/i);
      expect(res.body.error).toMatch(/database/i);
    });

    it('answers 503, not 500, when login cannot reach the database', async () => {
      jest.spyOn(prisma.business, 'findUnique').mockRejectedValue(databaseDownError());

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'someone@test.com', password: 'password123' });

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/temporarily unavailable/i);
    });

    it('answers 503, not 500, when signup cannot reach the database', async () => {
      jest.spyOn(prisma.business, 'create').mockRejectedValue(databaseDownError());

      const res = await request(app).post('/auth/signup').send({
        email: `down${uniq()}@test.com`,
        password: 'password123',
        name: 'Cannot Save',
        handle: `down${uniq()}`,
        city: 'Testville',
        category: 'Food lover',
      });

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/temporarily unavailable/i);
    });

    it('never leaks the underlying database error to the client', async () => {
      jest.spyOn(prisma.business, 'upsert').mockRejectedValue(databaseDownError());

      const res = await request(app).post('/auth/guest').send({});

      // The operator gets the detail in the logs; the client must not see credentials,
      // hostnames, or driver internals.
      expect(JSON.stringify(res.body)).not.toMatch(/Authentication failed|password|postgres/i);
    });
  });
});

describe('isDatabaseUnavailableError', () => {
  it('recognises Prisma connection-stage failures', () => {
    expect(isDatabaseUnavailableError(databaseDownError())).toBe(true);
    for (const code of ['P1000', 'P1001', 'P1002', 'P1008', 'P1017']) {
      expect(isDatabaseUnavailableError(Object.assign(new Error('x'), { code }))).toBe(true);
    }
  });

  it('does not mistake this app\'s own bugs for an outage', () => {
    // P2002 is a unique-constraint violation — a real bug (or a double-submit), and it must
    // keep surfacing as a 500 rather than being excused as "the database is down".
    expect(isDatabaseUnavailableError(Object.assign(new Error('x'), { code: 'P2002' }))).toBe(false);
    expect(isDatabaseUnavailableError(new Error('something else'))).toBe(false);
    expect(isDatabaseUnavailableError(null)).toBe(false);
    expect(isDatabaseUnavailableError(undefined)).toBe(false);
  });
});
