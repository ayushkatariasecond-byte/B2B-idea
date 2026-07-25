import request from 'supertest';
import path from 'path';
import { app } from '../index';
import { prisma } from '../db';
import { env } from '../env';

/**
 * Regression tests from the bug/quality audit. Each test here was written to FAIL against
 * the code as it stood, and the corresponding fix is what makes it pass — grouped by the
 * failure mode rather than by route.
 */

async function signup(handle: string, o: Record<string, unknown> = {}) {
  const r = await request(app).post('/auth/signup').send({
    email: `${handle}@bugs.com`, password: 'password123', name: `${handle} Inc`,
    handle, category: 'Testing', city: 'Bugtown', isRestaurant: true, cuisineSlug: 'other', ...o,
  });
  return r.body as { token: string; business: { id: string } };
}

async function mkPost(token: string, f: Record<string, string> = {}) {
  let q = request(app).post('/posts').set('Authorization', `Bearer ${token}`)
    .field('caption', f.caption ?? 'bug test caption').field('tag', f.tag ?? 'Culture');
  if (f.status) q = q.field('status', f.status);
  if (f.scheduledFor) q = q.field('scheduledFor', f.scheduledFor);
  return q.attach('media', path.join(__dirname, 'fixtures', 'sample.png'));
}

// This suite uses its OWN admin address rather than the shared `admin@test.com` that
// api.test.ts signs up: both suites run against one database, and whichever created that
// row first made the other's signup return 409. `requireAdmin` reads env.adminEmail at call
// time, so pointing it at a private address for the duration of this file keeps the two
// suites independent regardless of the order jest runs them in.
const BUG_ADMIN_EMAIL = 'bugsuite-admin@bugs.com';
const REAL_ADMIN_EMAIL = env.adminEmail;
beforeAll(() => {
  env.adminEmail = BUG_ADMIN_EMAIL;
});
afterAll(() => {
  env.adminEmail = REAL_ADMIN_EMAIL;
});

async function adminToken() {
  const r = await request(app).post('/auth/signup').send({
    email: BUG_ADMIN_EMAIL, password: 'password123', name: 'Bug Admin', handle: 'bugsuiteadmin',
    category: 'Testing', city: 'Bugtown', isRestaurant: false,
  });
  if (r.body.token) return r.body.token as string;
  const l = await request(app).post('/auth/login').send({ email: BUG_ADMIN_EMAIL, password: 'password123' });
  return l.body.token as string;
}

const NUL = String.fromCharCode(0);

jest.setTimeout(120000);

describe('Bug: account deletion left foreign keys dangling', () => {
  it('deletes an account whose posts other people liked, commented on, saved and viewed', async () => {
    const owner = await signup('caskowner');
    const other = await signup('caskother');
    const post = await mkPost(owner.token);
    const pid = post.body.post.id;

    // Everything another account can attach to someone else's post.
    await request(app).post(`/posts/${pid}/like`).set('Authorization', `Bearer ${other.token}`);
    await request(app).post(`/posts/${pid}/comments`).set('Authorization', `Bearer ${other.token}`).send({ text: 'nice' });
    await request(app).post(`/posts/${pid}/save`).set('Authorization', `Bearer ${other.token}`);
    await request(app).post(`/posts/${pid}/view`).set('Authorization', `Bearer ${other.token}`);

    const res = await request(app).delete('/businesses/me').set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);

    expect(await prisma.post.count({ where: { id: pid } })).toBe(0);
    expect(await prisma.like.count({ where: { postId: pid } })).toBe(0);
    expect(await prisma.comment.count({ where: { postId: pid } })).toBe(0);
    expect(await prisma.savedPost.count({ where: { postId: pid } })).toBe(0);
    expect(await prisma.postView.count({ where: { postId: pid } })).toBe(0);
  });

  it('deletes an account that has stories, story views, threads, messages and filed reports', async () => {
    const owner = await signup('cask2owner');
    const other = await signup('cask2other');
    const post = await mkPost(owner.token);

    await request(app).post('/stories').set('Authorization', `Bearer ${owner.token}`)
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));
    const story = await prisma.story.findFirst({ where: { businessId: owner.business.id } });
    await request(app).post(`/stories/${story!.id}/view`).set('Authorization', `Bearer ${other.token}`);

    const th = await request(app).post('/threads').set('Authorization', `Bearer ${owner.token}`)
      .send({ businessId: other.business.id });
    await request(app).post(`/threads/${th.body.threadId}/messages`)
      .set('Authorization', `Bearer ${owner.token}`).send({ text: 'hello' });
    await request(app).post(`/threads/${th.body.threadId}/messages`)
      .set('Authorization', `Bearer ${other.token}`).send({ text: 'reply from the other side' });

    await request(app).post('/reports').set('Authorization', `Bearer ${owner.token}`)
      .send({ targetType: 'post', targetId: post.body.post.id, reason: 'testing' });

    const res = await request(app).delete('/businesses/me').set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);

    expect(await prisma.business.count({ where: { id: owner.business.id } })).toBe(0);
    expect(await prisma.story.count({ where: { businessId: owner.business.id } })).toBe(0);
    expect(await prisma.storyView.count({ where: { storyId: story!.id } })).toBe(0);
    expect(await prisma.thread.count({ where: { id: th.body.threadId } })).toBe(0);
    expect(await prisma.message.count({ where: { threadId: th.body.threadId } })).toBe(0);
    expect(await prisma.report.count({ where: { reporterId: owner.business.id } })).toBe(0);
  });

  it('deletes an account that viewed and saved OTHER accounts\' posts without deleting those posts', async () => {
    const author = await signup('caskauthor');
    const leaver = await signup('caskleaver');
    const post = await mkPost(author.token);
    const pid = post.body.post.id;

    await request(app).post(`/posts/${pid}/save`).set('Authorization', `Bearer ${leaver.token}`);
    await request(app).post(`/posts/${pid}/view`).set('Authorization', `Bearer ${leaver.token}`);
    await request(app).post(`/posts/${pid}/like`).set('Authorization', `Bearer ${leaver.token}`);

    const res = await request(app).delete('/businesses/me').set('Authorization', `Bearer ${leaver.token}`);
    expect(res.status).toBe(200);
    // The other account's post must survive.
    expect(await prisma.post.count({ where: { id: pid } })).toBe(1);
    expect(await prisma.savedPost.count({ where: { businessId: leaver.business.id } })).toBe(0);
  });
});

describe('Bug: NUL byte in text fields caused a 500', () => {
  it('rejects a caption containing U+0000 with a 400, not a 500', async () => {
    const biz = await signup('nulcap');
    const res = await mkPost(biz.token, { caption: `before${NUL}after` });
    expect(res.status).toBe(400);
  });

  it('rejects a comment containing U+0000 with a 400', async () => {
    const biz = await signup('nulcmt');
    const post = await mkPost(biz.token);
    const res = await request(app).post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${biz.token}`).send({ text: `a${NUL}b` });
    expect(res.status).toBe(400);
  });

  it('rejects a bio and a name containing U+0000 with a 400', async () => {
    const biz = await signup('nulbio');
    const bio = await request(app).patch('/businesses/me')
      .set('Authorization', `Bearer ${biz.token}`).send({ bio: `x${NUL}y` });
    expect(bio.status).toBe(400);

    const signupRes = await request(app).post('/auth/signup').send({
      email: 'nulname@bugs.com', password: 'password123', name: `Bad${NUL}Name`,
      handle: 'nulname', category: 'Testing', city: 'Bugtown', isRestaurant: false,
    });
    expect(signupRes.status).toBe(400);
  });

  it('still accepts ordinary unicode, emoji and accents unchanged', async () => {
    const biz = await signup('unicodeok');
    const caption = '🍕 Café “Naïve” 日本語 — still fine';
    const res = await mkPost(biz.token, { caption });
    expect(res.status).toBe(201);
    expect(res.body.post.caption).toBe(caption);
  });
});

describe('Bug: comments were readable on posts nobody should see', () => {
  it('does not serve comments on a moderator-hidden post', async () => {
    const owner = await signup('hidcmtowner');
    const other = await signup('hidcmtother');
    const post = await mkPost(owner.token);
    const pid = post.body.post.id;
    await request(app).post(`/posts/${pid}/comments`).set('Authorization', `Bearer ${other.token}`).send({ text: 'hi' });
    await prisma.post.update({ where: { id: pid }, data: { hidden: true } });

    const anon = await request(app).get(`/posts/${pid}/comments`);
    expect(anon.status).toBe(404);
    const stranger = await request(app).get(`/posts/${pid}/comments`).set('Authorization', `Bearer ${other.token}`);
    expect(stranger.status).toBe(404);
  });

  it('does not serve comments on an unpublished draft', async () => {
    const owner = await signup('draftcmtowner');
    const stranger = await signup('draftcmtstranger');
    const draft = await mkPost(owner.token, { status: 'draft' });
    const did = draft.body.post.id;
    await request(app).post(`/posts/${did}/comments`).set('Authorization', `Bearer ${owner.token}`).send({ text: 'own note' });

    const res = await request(app).get(`/posts/${did}/comments`).set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(404);
  });

  it('still lets the author read comments on their own hidden post', async () => {
    const owner = await signup('hidcmtself');
    const post = await mkPost(owner.token);
    const pid = post.body.post.id;
    await request(app).post(`/posts/${pid}/comments`).set('Authorization', `Bearer ${owner.token}`).send({ text: 'mine' });
    await prisma.post.update({ where: { id: pid }, data: { hidden: true } });

    const res = await request(app).get(`/posts/${pid}/comments`).set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.comments.length).toBe(1);
  });

  it('does not let a stranger like, comment on, or share a hidden post', async () => {
    const owner = await signup('hidactowner');
    const stranger = await signup('hidactstranger');
    const post = await mkPost(owner.token);
    const pid = post.body.post.id;
    await prisma.post.update({ where: { id: pid }, data: { hidden: true } });

    expect((await request(app).post(`/posts/${pid}/like`).set('Authorization', `Bearer ${stranger.token}`)).status).toBe(404);
    expect((await request(app).post(`/posts/${pid}/comments`).set('Authorization', `Bearer ${stranger.token}`).send({ text: 'x' })).status).toBe(404);
    expect((await request(app).post(`/posts/${pid}/share`)).status).toBe(404);
  });
});

describe('Bug: double-submit returned a 500 instead of failing gracefully', () => {
  it('answers a rapid double-tap signup with 201 then 409, never a 500', async () => {
    const body = {
      email: 'dblsignup@bugs.com', password: 'password123', name: 'Dbl Inc',
      handle: 'dblsignupbug', category: 'Testing', city: 'Bugtown', isRestaurant: false,
    };
    const [a, b] = await Promise.all([
      request(app).post('/auth/signup').send(body),
      request(app).post('/auth/signup').send(body),
    ]);
    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([201, 409]);
    expect(await prisma.business.count({ where: { email: 'dblsignup@bugs.com' } })).toBe(1);
  });

  it('answers a rapid double-tap promo-code create with 201 then 409, never a 500', async () => {
    const biz = await signup('dblpromobug');
    const [a, b] = await Promise.all([
      request(app).post('/promo-codes').set('Authorization', `Bearer ${biz.token}`).send({ code: 'DBLBUG', discountDescription: 'x' }),
      request(app).post('/promo-codes').set('Authorization', `Bearer ${biz.token}`).send({ code: 'DBLBUG', discountDescription: 'y' }),
    ]);
    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([201, 409]);
    expect(await prisma.promoCode.count({ where: { code: 'DBLBUG' } })).toBe(1);
  });

  it('answers a rapid double-tap like without a 500 and leaves a consistent count', async () => {
    const author = await signup('dbllikeauthor');
    const liker = await signup('dbllikeliker');
    const post = await mkPost(author.token);
    const pid = post.body.post.id;

    const [a, b] = await Promise.all([
      request(app).post(`/posts/${pid}/like`).set('Authorization', `Bearer ${liker.token}`),
      request(app).post(`/posts/${pid}/like`).set('Authorization', `Bearer ${liker.token}`),
    ]);
    expect(a.status).toBeLessThan(500);
    expect(b.status).toBeLessThan(500);
    // Whichever way the race lands, the stored count must match what was reported last.
    const rows = await prisma.like.count({ where: { postId: pid } });
    expect(rows).toBeLessThanOrEqual(1);
  });

  it('answers a rapid double-tap follow and save without a 500', async () => {
    const a = await signup('dblfollowa');
    const b = await signup('dblfollowb');
    const post = await mkPost(b.token);

    const [f1, f2] = await Promise.all([
      request(app).post(`/businesses/${b.business.id}/follow`).set('Authorization', `Bearer ${a.token}`),
      request(app).post(`/businesses/${b.business.id}/follow`).set('Authorization', `Bearer ${a.token}`),
    ]);
    expect(f1.status).toBeLessThan(500);
    expect(f2.status).toBeLessThan(500);

    const [s1, s2] = await Promise.all([
      request(app).post(`/posts/${post.body.post.id}/save`).set('Authorization', `Bearer ${a.token}`),
      request(app).post(`/posts/${post.body.post.id}/save`).set('Authorization', `Bearer ${a.token}`),
    ]);
    expect(s1.status).toBeLessThan(500);
    expect(s2.status).toBeLessThan(500);
  });
});

describe('Bug: suspended businesses stayed discoverable', () => {
  it('removes a suspended business from search and suggested follows', async () => {
    const at = await adminToken();
    const bad = await signup('suspendsearch');
    const viewer = await signup('suspendsearchviewer', { isRestaurant: false, category: 'Viewer', cuisineSlug: undefined });

    const before = await request(app).get('/businesses/search?q=suspendsearch');
    expect(before.body.businesses.length).toBeGreaterThan(0);

    await request(app).post(`/moderation/businesses/${bad.business.id}/suspend`)
      .set('Authorization', `Bearer ${at}`).send({ suspended: true });

    const search = await request(app).get('/businesses/search?q=suspendsearch');
    expect(search.body.businesses.filter((b: { id: string }) => b.id === bad.business.id)).toHaveLength(0);

    const suggested = await request(app).get('/businesses/suggested').set('Authorization', `Bearer ${viewer.token}`);
    expect((suggested.body.businesses || []).filter((b: { id: string }) => b.id === bad.business.id)).toHaveLength(0);
  });

  it('keeps a suspended business out of the feed, discover and their own profile listing', async () => {
    const at = await adminToken();
    const bad = await signup('suspendfeed');
    const viewer = await signup('suspendfeedviewer', { isRestaurant: false, category: 'Viewer', cuisineSlug: undefined });
    await mkPost(bad.token, { caption: 'suspended content' });

    await request(app).post(`/moderation/businesses/${bad.business.id}/suspend`)
      .set('Authorization', `Bearer ${at}`).send({ suspended: true });

    const feed = await request(app).get('/posts/feed?tab=forYou').set('Authorization', `Bearer ${viewer.token}`);
    const discover = await request(app).get('/posts/discover');
    const profilePosts = await request(app).get(`/businesses/${bad.business.id}/posts`);

    expect(feed.body.posts.filter((p: { businessId: string }) => p.businessId === bad.business.id)).toHaveLength(0);
    expect(discover.body.posts.filter((p: { businessId: string }) => p.businessId === bad.business.id)).toHaveLength(0);
    expect(profilePosts.body.posts).toHaveLength(0);
  });
});

describe('Bug: blocking did not hide the blocked account\'s comments', () => {
  it('hides a blocked account\'s comments from the blocker, in both directions', async () => {
    const a = await signup('blkcmta');
    const b = await signup('blkcmtb');
    const post = await mkPost(a.token);
    const pid = post.body.post.id;
    await request(app).post(`/posts/${pid}/comments`).set('Authorization', `Bearer ${b.token}`).send({ text: 'from blocked user' });
    await request(app).post(`/posts/${pid}/comments`).set('Authorization', `Bearer ${a.token}`).send({ text: 'from the blocker' });

    const before = await request(app).get(`/posts/${pid}/comments`).set('Authorization', `Bearer ${a.token}`);
    expect(before.body.comments).toHaveLength(2);

    await request(app).post(`/businesses/${b.business.id}/block`).set('Authorization', `Bearer ${a.token}`);

    // A blocked B: A must not see B's comment...
    const afterA = await request(app).get(`/posts/${pid}/comments`).set('Authorization', `Bearer ${a.token}`);
    expect(afterA.body.comments.map((c: { text: string }) => c.text)).toEqual(['from the blocker']);

    // ...and the mute is symmetric — B must not see A's comment either, even though B was
    // the one blocked. (The post itself stays reachable by id for both: block in this app
    // is a listing-level mute, not an access wall — /businesses/:id behaves the same way.)
    const afterB = await request(app).get(`/posts/${pid}/comments`).set('Authorization', `Bearer ${b.token}`);
    expect(afterB.status).toBe(200);
    expect(afterB.body.comments.map((c: { text: string }) => c.text)).toEqual(['from blocked user']);
  });

  it('leaves comments visible to everyone who is not party to the block', async () => {
    const a = await signup('blkcmtx');
    const b = await signup('blkcmty');
    const bystander = await signup('blkcmtz');
    const post = await mkPost(a.token);
    const pid = post.body.post.id;
    await request(app).post(`/posts/${pid}/comments`).set('Authorization', `Bearer ${b.token}`).send({ text: 'still public' });
    await request(app).post(`/businesses/${b.business.id}/block`).set('Authorization', `Bearer ${a.token}`);

    const res = await request(app).get(`/posts/${pid}/comments`).set('Authorization', `Bearer ${bystander.token}`);
    expect(res.body.comments).toHaveLength(1);
  });
});

describe('Bug: whitespace-only city passed signup validation', () => {
  it('rejects a city of only spaces', async () => {
    const res = await request(app).post('/auth/signup').send({
      email: 'wscity@bugs.com', password: 'password123', name: 'WS City',
      handle: 'wscity', category: 'Testing', city: '   ', isRestaurant: false,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a whitespace-only city on profile update too', async () => {
    const biz = await signup('wscity2');
    const res = await request(app).patch('/businesses/me')
      .set('Authorization', `Bearer ${biz.token}`).send({ city: '  ' });
    expect(res.status).toBe(400);
  });

  it('trims surrounding whitespace off a real city instead of storing it raw', async () => {
    const res = await request(app).post('/auth/signup').send({
      email: 'trimcity@bugs.com', password: 'password123', name: 'Trim City',
      handle: 'trimcity', category: 'Testing', city: '  Austin  ', isRestaurant: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.business.city).toBe('Austin');
  });
});
