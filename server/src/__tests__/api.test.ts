import request from 'supertest';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { prisma } from '../db';
import { UPLOAD_DIR } from '../upload';
import { makeResetToken, makeVerifyToken } from '../authTokens';

// Nibbler's For You feed hard-filters to same-city restaurants, and virtually every
// existing test signs up a business purely to post content and then check the feed — so
// the default here is a restaurant in a fixed shared test city. Tests that specifically
// care about city-locking, cuisine filtering, or plain (non-posting) viewer accounts pass
// explicit overrides.
async function signup(
  handle: string,
  overrides: Partial<{ city: string; isRestaurant: boolean; cuisineSlug: string; latitude: number; longitude: number }> = {}
) {
  const res = await request(app)
    .post('/auth/signup')
    .send({
      email: `${handle}@test.com`,
      password: 'password123',
      name: `${handle} Inc`,
      handle,
      category: 'Testing',
      city: 'Testville',
      isRestaurant: true,
      cuisineSlug: 'other',
      ...overrides,
    });
  return res.body as { token: string; business: { id: string } };
}

async function createPost(token: string, overrides: Record<string, string> = {}) {
  let req = request(app)
    .post('/posts')
    .set('Authorization', `Bearer ${token}`)
    .field('caption', overrides.caption ?? 'A default test caption')
    .field('tag', overrides.tag ?? 'Culture');
  if (overrides.status) req = req.field('status', overrides.status);
  if (overrides.scheduledFor) req = req.field('scheduledFor', overrides.scheduledFor);
  return req.attach('media', path.join(__dirname, 'fixtures', 'sample.png'));
}

/** Walks every page of the For You feed and returns post ids in ranked order, so ranking
 * tests can check relative order between two posts without assuming they both land on page 1. */
async function fetchForYouOrder(token?: string): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 20; page++) {
    let req = request(app).get(`/posts/feed?tab=forYou&page=${page}`);
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    const res = await req;
    ids.push(...res.body.posts.map((p: { id: string }) => p.id));
    if (!res.body.hasMore) break;
  }
  return ids;
}

describe('Verve API', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects signup with a weak password', async () => {
    const res = await request(app).post('/auth/signup').send({
      email: 'weak@test.com',
      password: 'short',
      name: 'Weak Co',
      handle: 'weakco',
      category: 'Testing',
    });
    expect(res.status).toBe(400);
  });

  it('signs up, logs in, and returns the authenticated profile', async () => {
    const signupRes = await signup('acme');
    expect(signupRes.token).toBeTruthy();
    expect(signupRes.business.id).toBeTruthy();

    const loginRes = await request(app).post('/auth/login').send({ email: 'acme@test.com', password: 'password123' });
    expect(loginRes.status).toBe(200);

    const meRes = await request(app).get('/auth/me').set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.business.handle).toBe('acme');
  });

  it('rejects duplicate email and duplicate handle', async () => {
    await signup('dupe');
    const dupeEmail = await request(app)
      .post('/auth/signup')
      .send({ email: 'dupe@test.com', password: 'password123', name: 'Other', handle: 'dupeother', category: 'Testing', city: 'Testville' });
    expect(dupeEmail.status).toBe(409);

    const dupeHandle = await request(app)
      .post('/auth/signup')
      .send({ email: 'other@test.com', password: 'password123', name: 'Other', handle: 'dupe', category: 'Testing', city: 'Testville' });
    expect(dupeHandle.status).toBe(409);
  });

  it('creates a post with a media upload and it appears in the For You feed', async () => {
    const { token, business } = await signup('creator');
    const createRes = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'A genuinely bold hook that should score well!')
      .field('tag', 'Product Launch')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    expect(createRes.status).toBe(201);
    expect(createRes.body.post.businessId).toBe(business.id);
    expect(createRes.body.post.mediaUrl).toMatch(/^\/uploads\//);

    const feedRes = await request(app).get('/posts/feed?tab=forYou').set('Authorization', `Bearer ${token}`);
    expect(feedRes.status).toBe(200);
    expect(feedRes.body.posts.some((p: { id: string }) => p.id === createRes.body.post.id)).toBe(true);
  });

  it('stores an uploaded thumbnail alongside a video post', async () => {
    const { token } = await signup('videoposter');
    const createRes = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'A video post with a real thumbnail!')
      .field('tag', 'Product Launch')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'))
      .attach('thumbnail', path.join(__dirname, 'fixtures', 'sample.png'));

    expect(createRes.status).toBe(201);
    expect(createRes.body.post.thumbnailUrl).toMatch(/^\/uploads\//);
    expect(createRes.body.post.thumbnailUrl).not.toBe(createRes.body.post.mediaUrl);
  });

  it('leaves thumbnailUrl null when no thumbnail is uploaded', async () => {
    const { token } = await signup('nothumb');
    const createRes = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'No thumbnail here')
      .field('tag', 'Culture')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    expect(createRes.status).toBe(201);
    expect(createRes.body.post.thumbnailUrl).toBeNull();
  });

  it('rejects post creation without a media file', async () => {
    const { token } = await signup('nomedia');
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'no file attached')
      .field('tag', 'Culture');
    expect(res.status).toBe(400);
  });

  it('toggles likes idempotently and updates the like count', async () => {
    const author = await signup('liked');
    const liker = await signup('liker');
    const post = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${author.token}`)
      .field('caption', 'Like me please')
      .field('tag', 'Culture')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    const like1 = await request(app).post(`/posts/${post.body.post.id}/like`).set('Authorization', `Bearer ${liker.token}`);
    expect(like1.body).toEqual({ likedByMe: true, likeCount: 1 });

    const like2 = await request(app).post(`/posts/${post.body.post.id}/like`).set('Authorization', `Bearer ${liker.token}`);
    expect(like2.body).toEqual({ likedByMe: false, likeCount: 0 });
  });

  it('posts and lists comments on a post', async () => {
    const author = await signup('commented');
    const commenter = await signup('commenter');
    const post = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${author.token}`)
      .field('caption', 'Comment on this')
      .field('tag', 'Culture')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    const addComment = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ text: 'Nice work!' });
    expect(addComment.status).toBe(201);

    const list = await request(app).get(`/posts/${post.body.post.id}/comments`);
    expect(list.body.comments).toHaveLength(1);
    expect(list.body.comments[0].text).toBe('Nice work!');
  });

  it('prevents a business from following itself', async () => {
    const { token, business } = await signup('selffollow');
    const res = await request(app).post(`/businesses/${business.id}/follow`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('follow toggling changes the Following feed contents', async () => {
    const follower = await signup('follower1');
    const followee = await signup('followee1');
    await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${followee.token}`)
      .field('caption', 'Followee post')
      .field('tag', 'Culture')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    const beforeFollow = await request(app).get('/posts/feed?tab=following').set('Authorization', `Bearer ${follower.token}`);
    expect(beforeFollow.body.posts).toHaveLength(0);

    await request(app).post(`/businesses/${followee.business.id}/follow`).set('Authorization', `Bearer ${follower.token}`);

    const afterFollow = await request(app).get('/posts/feed?tab=following').set('Authorization', `Bearer ${follower.token}`);
    expect(afterFollow.body.posts).toHaveLength(1);
  });

  it('requires auth for the Following feed', async () => {
    const res = await request(app).get('/posts/feed?tab=following');
    expect(res.status).toBe(401);
  });

  it('filters discover by tag and search query', async () => {
    const biz = await signup('discoverable');
    await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${biz.token}`)
      .field('caption', 'Unique searchable phrase xyzzy')
      .field('tag', 'Case Study')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    const byTag = await request(app).get('/posts/discover?tag=Case Study');
    expect(byTag.body.posts.some((p: { caption: string }) => p.caption.includes('xyzzy'))).toBe(true);

    const byQuery = await request(app).get('/posts/discover?q=xyzzy');
    expect(byQuery.body.posts).toHaveLength(1);
  });

  it('sends and receives messages in a thread with unread tracking', async () => {
    const a = await signup('threada');
    const b = await signup('threadb');

    const start = await request(app).post('/threads').set('Authorization', `Bearer ${a.token}`).send({ businessId: b.business.id });
    expect(start.status).toBe(201);
    const threadId = start.body.threadId;

    await request(app).post(`/threads/${threadId}/messages`).set('Authorization', `Bearer ${a.token}`).send({ text: 'Hello there' });

    const bThreads = await request(app).get('/threads').set('Authorization', `Bearer ${b.token}`);
    expect(bThreads.body.threads[0].unread).toBe(true);

    await request(app).get(`/threads/${threadId}/messages`).set('Authorization', `Bearer ${b.token}`);

    const bThreadsAfterRead = await request(app).get('/threads').set('Authorization', `Bearer ${b.token}`);
    expect(bThreadsAfterRead.body.threads[0].unread).toBe(false);
  });

  it('blocks messaging a thread you are not part of', async () => {
    const a = await signup('outsidera');
    const b = await signup('outsiderb');
    const outsider = await signup('outsiderc');

    const start = await request(app).post('/threads').set('Authorization', `Bearer ${a.token}`).send({ businessId: b.business.id });
    const res = await request(app)
      .post(`/threads/${start.body.threadId}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ text: 'sneaky' });
    expect(res.status).toBe(404);
  });

  it('computes analytics from real engagement data', async () => {
    const biz = await signup('analytics1');
    const viewer = await signup('analytics2');
    const post = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${biz.token}`)
      .field('caption', 'Analytics test post with a solid hook!')
      .field('tag', 'Culture')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));

    await request(app).post(`/posts/${post.body.post.id}/view`).set('Authorization', `Bearer ${viewer.token}`);
    await request(app).post(`/posts/${post.body.post.id}/view`);
    await request(app).post(`/posts/${post.body.post.id}/like`).set('Authorization', `Bearer ${viewer.token}`);

    const analytics = await request(app).get('/analytics/me').set('Authorization', `Bearer ${biz.token}`);
    expect(analytics.status).toBe(200);
    expect(analytics.body.views30d).toBe(2);
    expect(analytics.body.topPost.id).toBe(post.body.post.id);
    expect(analytics.body.weeklyViews).toHaveLength(6);
  });

  // --- Team members ---

  it('lets an owner invite a team member who can then log in as the same business', async () => {
    const owner = await signup('teamowner1');
    const invite = await request(app)
      .post('/team')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: 'editor1@test.com', password: 'password123' });
    expect(invite.status).toBe(201);

    const login = await request(app).post('/auth/login').send({ email: 'editor1@test.com', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.business.id).toBe(owner.business.id);
    expect(login.body.memberRole).toBe('editor');
  });

  it('blocks an invited editor from inviting or removing other team members', async () => {
    const owner = await signup('teamowner2');
    await request(app).post('/team').set('Authorization', `Bearer ${owner.token}`).send({ email: 'editor2@test.com', password: 'password123' });
    const editorLogin = await request(app).post('/auth/login').send({ email: 'editor2@test.com', password: 'password123' });

    const secondInvite = await request(app)
      .post('/team')
      .set('Authorization', `Bearer ${editorLogin.body.token}`)
      .send({ email: 'editor3@test.com', password: 'password123' });
    expect(secondInvite.status).toBe(403);
  });

  it('lets an owner remove a team member', async () => {
    const owner = await signup('teamowner3');
    const invite = await request(app)
      .post('/team')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: 'editor4@test.com', password: 'password123' });

    const remove = await request(app).delete(`/team/${invite.body.member.id}`).set('Authorization', `Bearer ${owner.token}`);
    expect(remove.status).toBe(200);

    const loginAfterRemoval = await request(app).post('/auth/login').send({ email: 'editor4@test.com', password: 'password123' });
    expect(loginAfterRemoval.status).toBe(401);
  });

  // --- Notifications ---

  it('creates a notification when a post is liked, and marking it read clears unread count', async () => {
    const author = await signup('notifauthor');
    const liker = await signup('notifliker');
    const post = await createPost(author.token);

    await request(app).post(`/posts/${post.body.post.id}/like`).set('Authorization', `Bearer ${liker.token}`);

    const list = await request(app).get('/notifications').set('Authorization', `Bearer ${author.token}`);
    expect(list.body.notifications.some((n: { type: string }) => n.type === 'like')).toBe(true);

    const unread = await request(app).get('/notifications/unread-count').set('Authorization', `Bearer ${author.token}`);
    expect(unread.body.count).toBeGreaterThan(0);

    await request(app).post('/notifications/read-all').set('Authorization', `Bearer ${author.token}`);
    const unreadAfter = await request(app).get('/notifications/unread-count').set('Authorization', `Bearer ${author.token}`);
    expect(unreadAfter.body.count).toBe(0);
  });

  it('does not notify yourself for your own actions', async () => {
    const biz = await signup('notifself');
    const post = await createPost(biz.token);
    await request(app).post(`/posts/${post.body.post.id}/like`).set('Authorization', `Bearer ${biz.token}`);
    const list = await request(app).get('/notifications').set('Authorization', `Bearer ${biz.token}`);
    expect(list.body.notifications).toHaveLength(0);
  });

  // --- Scheduling & drafts ---

  it('requires scheduledFor when creating a scheduled post', async () => {
    const biz = await signup('scheduler1');
    const res = await createPost(biz.token, { status: 'scheduled' });
    expect(res.status).toBe(400);
  });

  it('keeps drafts and future-scheduled posts out of public feeds but visible in "mine/drafts"', async () => {
    const biz = await signup('scheduler2');
    const draft = await createPost(biz.token, { status: 'draft' });
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const scheduled = await createPost(biz.token, { status: 'scheduled', scheduledFor: future });

    expect(draft.status).toBe(201);
    expect(scheduled.status).toBe(201);

    const discover = await request(app).get('/posts/discover');
    const discoverIds = discover.body.posts.map((p: { id: string }) => p.id);
    expect(discoverIds).not.toContain(draft.body.post.id);
    expect(discoverIds).not.toContain(scheduled.body.post.id);

    const drafts = await request(app).get('/posts/mine/drafts').set('Authorization', `Bearer ${biz.token}`);
    const draftIds = drafts.body.posts.map((p: { id: string }) => p.id);
    expect(draftIds).toContain(draft.body.post.id);
    expect(draftIds).toContain(scheduled.body.post.id);
  });

  it('publishes a draft via PATCH and it then appears in discover', async () => {
    const biz = await signup('scheduler3');
    const draft = await createPost(biz.token, { status: 'draft', caption: 'Ready to ship #launchday' });

    const publish = await request(app)
      .patch(`/posts/${draft.body.post.id}`)
      .set('Authorization', `Bearer ${biz.token}`)
      .send({ status: 'published' });
    expect(publish.status).toBe(200);
    expect(publish.body.post.status).toBe('published');

    const discover = await request(app).get('/posts/discover');
    expect(discover.body.posts.some((p: { id: string }) => p.id === draft.body.post.id)).toBe(true);
  });

  it('lets an author delete their own post', async () => {
    const biz = await signup('deleter1');
    const post = await createPost(biz.token);
    const del = await request(app).delete(`/posts/${post.body.post.id}`).set('Authorization', `Bearer ${biz.token}`);
    expect(del.status).toBe(200);
    const getRes = await request(app).get(`/posts/${post.body.post.id}`);
    expect(getRes.status).toBe(404);
  });

  // --- Hashtags & trending ---

  it('extracts hashtags from captions and filters discover by hashtag', async () => {
    const biz = await signup('hashtagger');
    await createPost(biz.token, { caption: 'Big news today #ProductLaunch #ProductLaunch' });

    const byHashtag = await request(app).get('/posts/discover?hashtag=productlaunch');
    expect(byHashtag.body.posts.length).toBeGreaterThan(0);

    const trending = await request(app).get('/posts/trending-tags');
    expect(trending.body.tags.some((t: { tag: string }) => t.tag === 'productlaunch')).toBe(true);
  });

  // --- Saved posts ---

  it('toggles saving a post and lists it under /posts/saved', async () => {
    const author = await signup('savedauthor');
    const saver = await signup('saver');
    const post = await createPost(author.token);

    const save = await request(app).post(`/posts/${post.body.post.id}/save`).set('Authorization', `Bearer ${saver.token}`);
    expect(save.body.saved).toBe(true);

    const savedList = await request(app).get('/posts/saved').set('Authorization', `Bearer ${saver.token}`);
    expect(savedList.body.posts.some((p: { id: string }) => p.id === post.body.post.id)).toBe(true);

    const unsave = await request(app).post(`/posts/${post.body.post.id}/save`).set('Authorization', `Bearer ${saver.token}`);
    expect(unsave.body.saved).toBe(false);
  });

  // --- Search & suggestions ---

  it('finds businesses by partial name/handle via search', async () => {
    await signup('zephyrtech');
    const res = await request(app).get('/businesses/search?q=zephyr');
    expect(res.body.businesses.some((b: { handle: string }) => b.handle === 'zephyrtech')).toBe(true);
  });

  it('suggests businesses the caller does not already follow, ranked by followers, excluding already-followed ones', async () => {
    const me = await signup('suggestme');
    const other = await signup('suggestother');
    const alreadyFollowed = await signup('suggestfollowed');
    // Give "other" enough followers to clearly outrank the pile of zero-follower
    // businesses created by earlier tests, so this assertion isn't order-flaky.
    const followerA = await signup('suggestfollowera');
    const followerB = await signup('suggestfollowerb');
    await request(app).post(`/businesses/${other.business.id}/follow`).set('Authorization', `Bearer ${followerA.token}`);
    await request(app).post(`/businesses/${other.business.id}/follow`).set('Authorization', `Bearer ${followerB.token}`);
    await request(app).post(`/businesses/${alreadyFollowed.business.id}/follow`).set('Authorization', `Bearer ${me.token}`);

    const res = await request(app).get('/businesses/suggested').set('Authorization', `Bearer ${me.token}`);
    expect(res.body.businesses.some((b: { id: string }) => b.id === other.business.id)).toBe(true);
    expect(res.body.businesses.some((b: { id: string }) => b.id === me.business.id)).toBe(false);
    expect(res.body.businesses.some((b: { id: string }) => b.id === alreadyFollowed.business.id)).toBe(false);
  });

  // --- Comment moderation ---

  it('lets a comment author delete their own comment', async () => {
    const author = await signup('commodauthor');
    const commenter = await signup('commodcommenter');
    const post = await createPost(author.token);
    const comment = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ text: 'Nice!' });

    const del = await request(app)
      .delete(`/posts/${post.body.post.id}/comments/${comment.body.comment.id}`)
      .set('Authorization', `Bearer ${commenter.token}`);
    expect(del.status).toBe(200);
  });

  it('lets a post owner delete a comment someone else left', async () => {
    const author = await signup('commodauthor2');
    const commenter = await signup('commodcommenter2');
    const post = await createPost(author.token);
    const comment = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ text: 'Nice!' });

    const del = await request(app)
      .delete(`/posts/${post.body.post.id}/comments/${comment.body.comment.id}`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(del.status).toBe(200);
  });

  it('blocks an unrelated business from deleting someone else’s comment', async () => {
    const author = await signup('commodauthor3');
    const commenter = await signup('commodcommenter3');
    const bystander = await signup('commodbystander');
    const post = await createPost(author.token);
    const comment = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ text: 'Nice!' });

    const del = await request(app)
      .delete(`/posts/${post.body.post.id}/comments/${comment.body.comment.id}`)
      .set('Authorization', `Bearer ${bystander.token}`);
    expect(del.status).toBe(403);
  });

  // --- Blocking ---

  it('hides a blocked business’s posts from discover for the blocker', async () => {
    const blocker = await signup('blocker1');
    const blocked = await signup('blocked1');
    const post = await createPost(blocked.token, { caption: 'Unique blocked content xyzblock' });

    await request(app).post(`/businesses/${blocked.business.id}/block`).set('Authorization', `Bearer ${blocker.token}`);

    const discover = await request(app).get('/posts/discover?q=xyzblock').set('Authorization', `Bearer ${blocker.token}`);
    expect(discover.body.posts).toHaveLength(0);
  });

  it('prevents messaging a business that blocked you', async () => {
    const blocker = await signup('blocker2');
    const blocked = await signup('blocked2');
    await request(app).post(`/businesses/${blocked.business.id}/block`).set('Authorization', `Bearer ${blocker.token}`);

    const startThread = await request(app)
      .post('/threads')
      .set('Authorization', `Bearer ${blocked.token}`)
      .send({ businessId: blocker.business.id });
    expect(startThread.status).toBe(403);
  });

  // --- Reports ---

  it('accepts a report against a post', async () => {
    const author = await signup('reportedauthor');
    const reporter = await signup('reporter1');
    const post = await createPost(author.token);

    const res = await request(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ targetType: 'post', targetId: post.body.post.id, reason: 'Spam' });
    expect(res.status).toBe(201);
  });

  // --- Account data export/delete & verification ---

  it('exports account data only for the owner, not an invited editor', async () => {
    const owner = await signup('exportowner');
    await request(app).post('/team').set('Authorization', `Bearer ${owner.token}`).send({ email: 'exporteditor@test.com', password: 'password123' });
    const editorLogin = await request(app).post('/auth/login').send({ email: 'exporteditor@test.com', password: 'password123' });

    const ownerExport = await request(app).get('/businesses/me/export').set('Authorization', `Bearer ${owner.token}`);
    expect(ownerExport.status).toBe(200);
    expect(ownerExport.body.business.id).toBe(owner.business.id);

    const editorExport = await request(app).get('/businesses/me/export').set('Authorization', `Bearer ${editorLogin.body.token}`);
    expect(editorExport.status).toBe(403);
  });

  it('deletes the account so subsequent logins fail', async () => {
    const biz = await signup('deleteme1');
    const del = await request(app).delete('/businesses/me').set('Authorization', `Bearer ${biz.token}`);
    expect(del.status).toBe(200);

    const login = await request(app).post('/auth/login').send({ email: 'deleteme1@test.com', password: 'password123' });
    expect(login.status).toBe(401);
  });

  it('marks verification as requested for the owner only', async () => {
    const owner = await signup('verifyowner');
    const res = await request(app).post('/businesses/me/request-verification').set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.business.verificationRequested).toBe(true);
    expect(res.body.business.verified).toBe(false);
  });

  it('transcodes an uploaded video to a web-friendly mp4 and removes the raw original', async () => {
    const { token } = await signup('videotranscode');
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'Real video upload')
      .field('tag', 'Product Launch')
      .attach('media', path.join(__dirname, 'fixtures', 'sample.mp4'));

    expect(res.status).toBe(201);
    expect(res.body.post.mediaType).toBe('video');
    expect(res.body.post.mediaUrl).toMatch(/-web\.mp4$/);

    const transcodedPath = path.join(UPLOAD_DIR, path.basename(res.body.post.mediaUrl));
    expect(fs.existsSync(transcodedPath)).toBe(true);
    expect(fs.statSync(transcodedPath).size).toBeGreaterThan(0);
  }, 20000);

  it('forgot-password responds 200 whether or not the email exists (no user enumeration)', async () => {
    await signup('forgotme');
    const known = await request(app).post('/auth/forgot-password').send({ email: 'forgotme@test.com' });
    const unknown = await request(app).post('/auth/forgot-password').send({ email: 'nobody@test.com' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it('resets the password with a valid token and rejects reuse of the old link', async () => {
    const { business } = await signup('resetme');
    const before = await prisma.business.findUnique({ where: { id: business.id } });
    const token = makeResetToken(business.id, before!.passwordHash);

    const reset = await request(app).post('/auth/reset-password').send({ token, password: 'brandnewpass1' });
    expect(reset.status).toBe(200);

    // Old password no longer works, new one does.
    const oldLogin = await request(app).post('/auth/login').send({ email: 'resetme@test.com', password: 'password123' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/auth/login').send({ email: 'resetme@test.com', password: 'brandnewpass1' });
    expect(newLogin.status).toBe(200);

    // The same link can't be replayed — the hash it was signed against has changed.
    const replay = await request(app).post('/auth/reset-password').send({ token, password: 'yetanotherpass1' });
    expect(replay.status).toBe(400);
  });

  it('rejects a garbage reset token', async () => {
    const res = await request(app).post('/auth/reset-password').send({ token: 'not-a-real-token', password: 'whateverpass1' });
    expect(res.status).toBe(400);
  });

  it('verifies email with a valid token and ignores an invalid one', async () => {
    const { business } = await signup('verifyme');
    const fresh = await prisma.business.findUnique({ where: { id: business.id } });
    expect(fresh!.emailVerified).toBe(false);

    const ok = await request(app).post('/auth/verify-email').send({ token: makeVerifyToken(business.id) });
    expect(ok.status).toBe(200);
    const after = await prisma.business.findUnique({ where: { id: business.id } });
    expect(after!.emailVerified).toBe(true);

    const bad = await request(app).post('/auth/verify-email').send({ token: 'bogus.token.here' });
    expect(bad.status).toBe(400);
  });

  it('logs in regardless of email casing, and stores/looks up email normalized to lowercase', async () => {
    const signupRes = await request(app).post('/auth/signup').send({
      email: 'MixedCase@Example.com',
      password: 'password123',
      name: 'Mixed Case Inc',
      handle: 'mixedcase',
      category: 'Testing',
      city: 'Testville',
    });
    expect(signupRes.status).toBe(201);
    // Stored normalized, not as typed.
    expect(signupRes.body.business.id).toBeTruthy();
    const stored = await prisma.business.findUnique({ where: { id: signupRes.body.business.id } });
    expect(stored!.email).toBe('mixedcase@example.com');

    // Logging in with a totally different casing than either the signup input or storage still works.
    const loginRes = await request(app).post('/auth/login').send({ email: 'MIXEDCASE@EXAMPLE.COM', password: 'password123' });
    expect(loginRes.status).toBe(200);

    // Signing up again with the same email in yet another casing is rejected as a duplicate.
    const dupeRes = await request(app).post('/auth/signup').send({
      email: 'mixedCase@example.COM',
      password: 'password123',
      name: 'Dupe Inc',
      handle: 'mixedcasedupe',
      category: 'Testing',
      city: 'Testville',
    });
    expect(dupeRes.status).toBe(409);
  });

  // --- Stories ---

  async function createStory(token: string) {
    return request(app)
      .post('/stories')
      .set('Authorization', `Bearer ${token}`)
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));
  }

  it('creates a story and it appears in GET /stories as unseen for another viewer', async () => {
    const author = await signup('storyauthor1');
    const viewer = await signup('storyviewer1');

    const createRes = await createStory(author.token);
    expect(createRes.status).toBe(201);
    expect(createRes.body.story.businessId).toBe(author.business.id);
    expect(createRes.body.story.mediaUrl).toMatch(/^\/uploads\//);

    const listRes = await request(app).get('/stories').set('Authorization', `Bearer ${viewer.token}`);
    expect(listRes.status).toBe(200);
    const group = listRes.body.groups.find((g: { business: { id: string } }) => g.business.id === author.business.id);
    expect(group).toBeTruthy();
    expect(group.hasUnseen).toBe(true);
    expect(
      group.stories.some((s: { id: string; viewedByMe: boolean }) => s.id === createRes.body.story.id && s.viewedByMe === false)
    ).toBe(true);
  });

  it('rejects story creation without a media file', async () => {
    const { token } = await signup('storynomedia');
    const res = await request(app).post('/stories').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('marks a story viewed idempotently and reflects viewedByMe/hasUnseen afterward', async () => {
    const author = await signup('storyauthor2');
    const viewer = await signup('storyviewer2');
    const createRes = await createStory(author.token);

    const view1 = await request(app)
      .post(`/stories/${createRes.body.story.id}/view`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(view1.status).toBe(200);
    expect(view1.body).toEqual({ ok: true });

    // Viewing again must not error — it's idempotent.
    const view2 = await request(app)
      .post(`/stories/${createRes.body.story.id}/view`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(view2.status).toBe(200);

    const listRes = await request(app).get('/stories').set('Authorization', `Bearer ${viewer.token}`);
    const group = listRes.body.groups.find((g: { business: { id: string } }) => g.business.id === author.business.id);
    expect(group.hasUnseen).toBe(false);
    const story = group.stories.find((s: { id: string }) => s.id === createRes.body.story.id);
    expect(story.viewedByMe).toBe(true);
  });

  it('404s viewing a story that does not exist', async () => {
    const { token } = await signup('storyviewer3');
    const res = await request(app).post('/stories/nonexistent-id/view').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('excludes an expired story from GET /stories', async () => {
    const author = await signup('storyauthor3');
    const createRes = await createStory(author.token);
    await prisma.story.update({
      where: { id: createRes.body.story.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const listRes = await request(app).get('/stories');
    expect(
      listRes.body.groups.some((g: { stories: { id: string }[] }) =>
        g.stories.some((s) => s.id === createRes.body.story.id)
      )
    ).toBe(false);
  });

  it('excludes a blocked business\'s stories from GET /stories', async () => {
    const blocker = await signup('storyblocker1');
    const blocked = await signup('storyblocked1');
    await createStory(blocked.token);
    await request(app).post(`/businesses/${blocked.business.id}/block`).set('Authorization', `Bearer ${blocker.token}`);

    const listRes = await request(app).get('/stories').set('Authorization', `Bearer ${blocker.token}`);
    expect(listRes.body.groups.some((g: { business: { id: string } }) => g.business.id === blocked.business.id)).toBe(false);
  });

  it('orders groups: own story first, then followed businesses, then everyone else', async () => {
    const me = await signup('storyorderme');
    const followed = await signup('storyorderfollowed');
    const stranger = await signup('storyorderstranger');

    await createStory(stranger.token);
    await createStory(followed.token);
    await createStory(me.token);
    await request(app).post(`/businesses/${followed.business.id}/follow`).set('Authorization', `Bearer ${me.token}`);

    const listRes = await request(app).get('/stories').set('Authorization', `Bearer ${me.token}`);
    const ids = listRes.body.groups.map((g: { business: { id: string } }) => g.business.id);
    const meIdx = ids.indexOf(me.business.id);
    const followedIdx = ids.indexOf(followed.business.id);
    const strangerIdx = ids.indexOf(stranger.business.id);
    expect(meIdx).toBeLessThan(followedIdx);
    expect(followedIdx).toBeLessThan(strangerIdx);
  });

  it('works for logged-out viewers without personalization', async () => {
    const author = await signup('storyanon1');
    const createRes = await createStory(author.token);

    const listRes = await request(app).get('/stories');
    expect(listRes.status).toBe(200);
    const group = listRes.body.groups.find((g: { business: { id: string } }) => g.business.id === author.business.id);
    expect(group).toBeTruthy();
    expect(group.hasUnseen).toBe(true);
    const story = group.stories.find((s: { id: string }) => s.id === createRes.body.story.id);
    expect(story.viewedByMe).toBe(false);
  });

  it('creates a video story using the shared transcode pipeline', async () => {
    const { token } = await signup('storyvideo1');
    const res = await request(app)
      .post('/stories')
      .set('Authorization', `Bearer ${token}`)
      .attach('media', path.join(__dirname, 'fixtures', 'sample.mp4'));
    expect(res.status).toBe(201);
    expect(res.body.story.mediaType).toBe('video');
    expect(res.body.story.mediaUrl).toMatch(/-web\.mp4$/);
  }, 20000);

  it('For You: ranks a fresher post above an equally-engaged older post from the same business', async () => {
    const author = await signup('rankfreshold');
    const oldPost = await createPost(author.token, { caption: 'Equal engagement post either way', tag: 'Culture' });
    const freshPost = await createPost(author.token, { caption: 'Equal engagement post either way', tag: 'Culture' });
    // Neither post has any likes/comments/shares, so their base creativity scores are
    // identical — only the recency/velocity boosts (which depend on age) can separate them.
    await prisma.post.update({
      where: { id: oldPost.body.post.id },
      data: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });

    const order = await fetchForYouOrder(author.token);
    const freshIdx = order.indexOf(freshPost.body.post.id);
    const oldIdx = order.indexOf(oldPost.body.post.id);
    expect(freshIdx).toBeGreaterThanOrEqual(0);
    expect(oldIdx).toBeGreaterThanOrEqual(0);
    expect(freshIdx).toBeLessThan(oldIdx);
  });

  it('For You: boosts a followed business post above an equal-scored post from a business the viewer does not follow', async () => {
    const viewer = await signup('rankfollowviewer');
    const followedBiz = await signup('rankfollowfollowed');
    const stranger = await signup('rankfollowstranger');

    const followedPost = await createPost(followedBiz.token, { caption: 'Same caption for a fair fight', tag: 'Culture' });
    const strangerPost = await createPost(stranger.token, { caption: 'Same caption for a fair fight', tag: 'Culture' });
    await request(app).post(`/businesses/${followedBiz.business.id}/follow`).set('Authorization', `Bearer ${viewer.token}`);

    const order = await fetchForYouOrder(viewer.token);
    const followedIdx = order.indexOf(followedPost.body.post.id);
    const strangerIdx = order.indexOf(strangerPost.body.post.id);
    expect(followedIdx).toBeGreaterThanOrEqual(0);
    expect(strangerIdx).toBeGreaterThanOrEqual(0);
    expect(followedIdx).toBeLessThan(strangerIdx);
  });

  it('For You: diversity cap limits one business to at most 3 posts on a single page even when it has more qualifying posts', async () => {
    const dominant = await signup('rankdiversedom');
    const boosters = await Promise.all([
      signup('rankdiverseb1'),
      signup('rankdiverseb2'),
      signup('rankdiverseb3'),
    ]);

    const dominantPostIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const post = await createPost(dominant.token, { caption: `A bold hook for dominant post ${i}!`, tag: 'Culture' });
      dominantPostIds.push(post.body.post.id);
      // Likes push score + velocity well above baseline noise, so without the diversity
      // cap all 5 of this business's posts would rank ahead of the other businesses' posts.
      for (const booster of boosters) {
        await request(app).post(`/posts/${post.body.post.id}/like`).set('Authorization', `Bearer ${booster.token}`);
      }
    }
    for (const booster of boosters) {
      await createPost(booster.token, { caption: 'A normal post from another business', tag: 'Culture' });
    }

    const feedRes = await request(app).get('/posts/feed?tab=forYou').set('Authorization', `Bearer ${dominant.token}`);
    expect(feedRes.status).toBe(200);
    const dominantOnPage = feedRes.body.posts.filter((p: { businessId: string }) => p.businessId === dominant.business.id);
    expect(dominantOnPage.length).toBeLessThanOrEqual(3);

    // The cap reorders, it doesn't drop — all 5 posts must still be reachable across pages.
    const allIds = await fetchForYouOrder(dominant.token);
    const dominantTotal = dominantPostIds.filter((id) => allIds.includes(id)).length;
    expect(dominantTotal).toBe(5);
  });

  // --- Content moderation ---

  it('auto-hides a post once enough distinct businesses report it', async () => {
    const author = await signup('modautohideauthor');
    const post = await createPost(author.token, { caption: 'A post about to get reported' });
    const postId = post.body.post.id;

    const reporters = await Promise.all([
      signup('modautohiderep1'),
      signup('modautohiderep2'),
      signup('modautohiderep3'),
    ]);
    for (const reporter of reporters) {
      const res = await request(app)
        .post('/reports')
        .set('Authorization', `Bearer ${reporter.token}`)
        .send({ targetType: 'post', targetId: postId, reason: 'Spam' });
      expect(res.status).toBe(201);
    }

    const detailRes = await request(app).get(`/posts/${postId}`);
    expect(detailRes.status).toBe(404);

    const discoverRes = await request(app).get('/posts/discover');
    expect(discoverRes.body.posts.some((p: { id: string }) => p.id === postId)).toBe(false);

    // The author can still see their own hidden post.
    const ownViewRes = await request(app).get(`/posts/${postId}`).set('Authorization', `Bearer ${author.token}`);
    expect(ownViewRes.status).toBe(200);
    expect(ownViewRes.body.post.hidden).toBe(true);
  });

  it('rejects non-admins from the moderation endpoints, and lets the admin list and resolve a report', async () => {
    const author = await signup('modreviewauthor');
    const post = await createPost(author.token, { caption: 'A borderline post' });
    const postId = post.body.post.id;
    const reporter = await signup('modreviewreporter');
    const reportRes = await request(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ targetType: 'post', targetId: postId, reason: 'Inappropriate' });
    const reportId = reportRes.body.report.id;

    const nonAdmin = await signup('modnonadmin');
    const deniedRes = await request(app).get('/moderation/reports').set('Authorization', `Bearer ${nonAdmin.token}`);
    expect(deniedRes.status).toBe(403);

    const admin = await signup('admin');
    const listRes = await request(app).get('/moderation/reports').set('Authorization', `Bearer ${admin.token}`);
    expect(listRes.status).toBe(200);
    const listed = listRes.body.reports.find((r: { id: string }) => r.id === reportId);
    expect(listed.target.caption).toBe('A borderline post');

    const resolveRes = await request(app)
      .post(`/moderation/reports/${reportId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'hide' });
    expect(resolveRes.status).toBe(200);

    const discoverRes = await request(app).get('/posts/discover');
    expect(discoverRes.body.posts.some((p: { id: string }) => p.id === postId)).toBe(false);
  });

  it('suspending a business hides its posts and blocks future logins', async () => {
    const offender = await signup('modsuspendbiz');
    const post = await createPost(offender.token, { caption: 'Post from a business about to be banned' });

    // Reuses the admin account created in the previous test rather than signing up a
    // second one — env.adminEmail is a single fixed address for the whole test run.
    const adminLogin = await request(app).post('/auth/login').send({ email: 'admin@test.com', password: 'password123' });
    expect(adminLogin.status).toBe(200);

    const suspendRes = await request(app)
      .post(`/moderation/businesses/${offender.business.id}/suspend`)
      .set('Authorization', `Bearer ${adminLogin.body.token}`)
      .send({ suspended: true });
    expect(suspendRes.status).toBe(200);

    const discoverRes = await request(app).get('/posts/discover');
    expect(discoverRes.body.posts.some((p: { id: string }) => p.id === post.body.post.id)).toBe(false);

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'modsuspendbiz@test.com', password: 'password123' });
    expect(loginRes.status).toBe(403);

    const meRes = await request(app).get('/auth/me').set('Authorization', `Bearer ${offender.token}`);
    expect(meRes.status).toBe(403);
  });

  it('rejects a post caption that matches the spam denylist', async () => {
    const business = await signup('modspamauthor');
    const res = await createPost(business.token, { caption: 'DM me now, buy followers cheap!' });
    expect(res.status).toBe(400);
  });

  // --- Nibbler: city-locked restaurant directory ---

  it('lists the fixed cuisine taxonomy', async () => {
    const res = await request(app).get('/cuisines');
    expect(res.status).toBe(200);
    const names = res.body.cuisines.map((c: { name: string }) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Italian', 'Thai', 'Mexican']));
  });

  it('requires a cuisine for a restaurant signup, and rejects an unknown cuisine slug', async () => {
    const missingCuisine = await request(app).post('/auth/signup').send({
      email: 'norest@test.com',
      password: 'password123',
      name: 'No Cuisine',
      handle: 'norestcuisine',
      city: 'Testville',
      isRestaurant: true,
    });
    expect(missingCuisine.status).toBe(400);

    const badCuisine = await request(app).post('/auth/signup').send({
      email: 'badcuisine@test.com',
      password: 'password123',
      name: 'Bad Cuisine',
      handle: 'badcuisine',
      city: 'Testville',
      isRestaurant: true,
      cuisineSlug: 'not-a-real-cuisine',
    });
    expect(badCuisine.status).toBe(400);
  });

  it('derives category from the chosen cuisine on a restaurant signup', async () => {
    const res = await signup('cuisinecategory', { cuisineSlug: 'thai' });
    expect(res.business).toMatchObject({ category: 'Thai' });
  });

  it('signs up a plain (non-restaurant) viewer account without requiring a cuisine', async () => {
    const res = await signup('plainviewer', { isRestaurant: false });
    expect(res.business).toMatchObject({ isRestaurant: false, city: 'Testville' });
  });

  it('requires login to view the city-locked For You feed', async () => {
    const res = await request(app).get('/posts/feed?tab=forYou');
    expect(res.status).toBe(401);
  });

  it('never shows a viewer posts from a restaurant in a different city, in either direction', async () => {
    const cityA = await signup('cityarest', { city: 'Springfield' });
    const cityB = await signup('citybrest', { city: 'Shelbyville' });
    await createPost(cityA.token, { caption: 'Only Springfield should see this' });
    await createPost(cityB.token, { caption: 'Only Shelbyville should see this' });

    const viewerA = await signup('cityaviewer', { city: 'Springfield', isRestaurant: false });
    const viewerB = await signup('citybviewer', { city: 'Shelbyville', isRestaurant: false });

    const feedA = await request(app).get('/posts/feed?tab=forYou').set('Authorization', `Bearer ${viewerA.token}`);
    const namesA = feedA.body.posts.map((p: { caption: string }) => p.caption);
    expect(namesA).toContain('Only Springfield should see this');
    expect(namesA).not.toContain('Only Shelbyville should see this');

    const feedB = await request(app).get('/posts/feed?tab=forYou').set('Authorization', `Bearer ${viewerB.token}`);
    const namesB = feedB.body.posts.map((p: { caption: string }) => p.caption);
    expect(namesB).toContain('Only Shelbyville should see this');
    expect(namesB).not.toContain('Only Springfield should see this');
  });

  it('shows an empty feed (not a fallback to other cities) when the viewer\'s city has zero restaurants', async () => {
    const viewer = await signup('emptycityviewer', { city: 'Nowheresville', isRestaurant: false });
    const res = await request(app).get('/posts/feed?tab=forYou').set('Authorization', `Bearer ${viewer.token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.city).toBe('Nowheresville');
  });

  it('filters the feed by cuisine within the viewer\'s own city', async () => {
    const italian = await signup('cuisinefilteritalian', { city: 'Ogdenville', cuisineSlug: 'italian' });
    const mexican = await signup('cuisinefiltermexican', { city: 'Ogdenville', cuisineSlug: 'mexican' });
    await createPost(italian.token, { caption: 'Fresh pasta tonight' });
    await createPost(mexican.token, { caption: 'Tacos al pastor' });

    const viewer = await signup('cuisinefilterviewer', { city: 'Ogdenville', isRestaurant: false });
    const res = await request(app)
      .get('/posts/feed?tab=forYou&cuisine=italian')
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(res.status).toBe(200);
    const captions = res.body.posts.map((p: { caption: string }) => p.caption);
    expect(captions).toContain('Fresh pasta tonight');
    expect(captions).not.toContain('Tacos al pastor');
  });

  it('rejects an unknown cuisine slug in the feed filter', async () => {
    const viewer = await signup('badcuisinefilterviewer');
    const res = await request(app)
      .get('/posts/feed?tab=forYou&cuisine=not-a-real-cuisine')
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(res.status).toBe(400);
  });

  it('updates a restaurant profile: city, website, menu, and cuisine (which re-derives category)', async () => {
    const { token } = await signup('menueditor', { cuisineSlug: 'american' });
    const res = await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        city: 'New Cityville',
        website: 'https://example.com/menu',
        cuisineSlug: 'japanese',
        menuItems: [{ name: 'Ramen', price: 14.5, description: 'Tonkotsu broth' }, { name: 'Gyoza', price: 8 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.business).toMatchObject({
      city: 'New Cityville',
      website: 'https://example.com/menu',
      category: 'Japanese',
    });
    expect(res.body.business.cuisine).toMatchObject({ slug: 'japanese' });
    expect(res.body.business.menuItems).toHaveLength(2);
    expect(res.body.business.menuItems[0]).toMatchObject({ name: 'Ramen', price: 14.5 });
  });

  it('rejects a profile update with an unknown cuisine slug', async () => {
    const { token } = await signup('badcuisineupdate');
    const res = await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ cuisineSlug: 'not-a-real-cuisine' });
    expect(res.status).toBe(400);
  });

  it('returns cuisine, city, website, and menu on a restaurant\'s public profile', async () => {
    const { token } = await signup('publicprofilerest', { city: 'Publictown', cuisineSlug: 'indian' });
    await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ website: 'https://example.com/curry', menuItems: [{ name: 'Butter Chicken', price: 15 }] });

    const res = await request(app).get('/businesses/handle/publicprofilerest');
    expect(res.status).toBe(200);
    expect(res.body.business).toMatchObject({
      city: 'Publictown',
      isRestaurant: true,
      website: 'https://example.com/curry',
    });
    expect(res.body.business.cuisine).toMatchObject({ name: 'Indian', slug: 'indian' });
    expect(res.body.business.menuItems).toEqual([{ name: 'Butter Chicken', price: 15 }]);
  });

  // --- Promo codes ---

  it('lets a restaurant create a promo code, but not a plain viewer', async () => {
    const restaurant = await signup('promocreator1');
    const create = await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ code: 'save10', discountDescription: '10% off' });
    expect(create.status).toBe(201);
    expect(create.body.promoCode).toMatchObject({ code: 'SAVE10', discountDescription: '10% off', active: true });

    const viewer = await signup('promoviewer1', { isRestaurant: false });
    const viewerCreate = await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ code: 'VIEWER10', discountDescription: '10% off' });
    expect(viewerCreate.status).toBe(403);
  });

  it('rejects creating a code that is already taken', async () => {
    const restaurant = await signup('promodupecreator');
    await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ code: 'DUPE20', discountDescription: '20% off' });

    const other = await signup('promodupecreator2');
    const dupe = await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ code: 'dupe20', discountDescription: 'a different description' });
    expect(dupe.status).toBe(409);
  });

  it('rejects malformed promo codes (too short, or containing invalid characters)', async () => {
    const restaurant = await signup('promovalidatecreator');
    const tooShort = await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ code: 'ab', discountDescription: '10% off' });
    expect(tooShort.status).toBe(400);

    const badChars = await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ code: 'SAVE 10%!', discountDescription: '10% off' });
    expect(badChars.status).toBe(400);
  });

  it('redeems a valid code anonymously (no auth), case-insensitively', async () => {
    const restaurant = await signup('promoredeemcreator');
    await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ code: 'ANON15', discountDescription: '15% off' });

    const redeem = await request(app).post('/promo-codes/redeem').send({ code: 'anon15' });
    expect(redeem.status).toBe(201);
    expect(redeem.body.ok).toBe(true);
    expect(redeem.body.redeemedAt).toBeTruthy();
  });

  it('rejects redemption of a code that does not exist', async () => {
    const res = await request(app).post('/promo-codes/redeem').send({ code: 'NOSUCHCODE' });
    expect(res.status).toBe(400);
  });

  it('rejects redemption of an inactive ("expired") code', async () => {
    const restaurant = await signup('promoinactivecreator');
    const create = await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ code: 'GONE30', discountDescription: '30% off' });
    await prisma.promoCode.update({ where: { id: create.body.promoCode.id }, data: { active: false } });

    const redeem = await request(app).post('/promo-codes/redeem').send({ code: 'GONE30' });
    expect(redeem.status).toBe(400);
  });

  it('allows the same code to be redeemed multiple times (duplicates are allowed by design)', async () => {
    const restaurant = await signup('promomulticreator');
    await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ code: 'MULTI5', discountDescription: '5% off' });

    const first = await request(app).post('/promo-codes/redeem').send({ code: 'MULTI5' });
    const second = await request(app).post('/promo-codes/redeem').send({ code: 'MULTI5' });
    const third = await request(app).post('/promo-codes/redeem').send({ code: 'MULTI5' });
    expect([first.status, second.status, third.status]).toEqual([201, 201, 201]);

    const stats = await request(app)
      .get('/promo-codes/MULTI5/stats')
      .set('Authorization', `Bearer ${restaurant.token}`);
    expect(stats.body.redemptionCount).toBe(3);
    expect(stats.body.redemptions).toHaveLength(3);
  });

  it('records the redeeming business when the redeemer is logged in', async () => {
    const restaurant = await signup('promologgedincreator');
    await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ code: 'LOGGEDIN7', discountDescription: '7% off' });
    const redeemer = await signup('promologgedinredeemer', { isRestaurant: false });

    await request(app)
      .post('/promo-codes/redeem')
      .set('Authorization', `Bearer ${redeemer.token}`)
      .send({ code: 'LOGGEDIN7' });

    const promoCode = await prisma.promoCode.findUnique({ where: { code: 'LOGGEDIN7' } });
    const redemptions = await prisma.redemption.findMany({ where: { promoCodeId: promoCode!.id } });
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].userId).toBe(redeemer.business.id);
  });

  it("blocks a restaurant from viewing another restaurant's promo code stats", async () => {
    const owner = await signup('promoownerstats');
    await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: 'PRIVATE9', discountDescription: '9% off' });
    const intruder = await signup('promointruderstats');

    const res = await request(app)
      .get('/promo-codes/PRIVATE9/stats')
      .set('Authorization', `Bearer ${intruder.token}`);
    expect(res.status).toBe(403);
  });

  it('404s stats for a promo code that does not exist', async () => {
    const restaurant = await signup('promo404creator');
    const res = await request(app)
      .get('/promo-codes/NOPE123/stats')
      .set('Authorization', `Bearer ${restaurant.token}`);
    expect(res.status).toBe(404);
  });

  it('requires auth to view promo code stats', async () => {
    const restaurant = await signup('promonoauthcreator');
    await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ code: 'NOAUTH1', discountDescription: '1% off' });

    const res = await request(app).get('/promo-codes/NOAUTH1/stats');
    expect(res.status).toBe(401);
  });

  it('deleting a restaurant account cleans up its promo codes and redemptions without error', async () => {
    const restaurant = await signup('promodeletecreator');
    await request(app)
      .post('/promo-codes')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ code: 'DELETEME1', discountDescription: '1% off' });
    await request(app).post('/promo-codes/redeem').send({ code: 'DELETEME1' });

    const del = await request(app).delete('/businesses/me').set('Authorization', `Bearer ${restaurant.token}`);
    expect(del.status).toBe(200);

    const promoCode = await prisma.promoCode.findUnique({ where: { code: 'DELETEME1' } });
    expect(promoCode).toBeNull();
  });

  // --- Reliability ---

  it('GET /health reports healthy when the database is reachable', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'connected' });
  });

  it('GET /health reports 503 when the database is unreachable', async () => {
    const spy = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: 'unreachable' });
    spy.mockRestore();
  });

  it('turns an unexpected async error (e.g. a dropped DB call) into a structured 500, not a hang or a leaked stack trace', async () => {
    // GET /cuisines has no try/catch of its own — a genuine unhandled-rejection scenario
    // for Express 4 without express-async-errors. Confirms the fix actually reaches
    // routes, not just ones that happen to already catch their own errors (like requireAuth).
    const spy = jest
      .spyOn(prisma.cuisine, 'findMany')
      .mockRejectedValueOnce(new Error('Connection terminated unexpectedly: password authentication failed for user "postgres"'));

    const res = await request(app).get('/cuisines');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('password authentication failed');
    spy.mockRestore();
  });

  // --- Security: input validation hardening ---

  it('rejects signup with an absurdly long password', async () => {
    const res = await request(app).post('/auth/signup').send({
      email: 'longpw@test.com',
      password: 'a'.repeat(500),
      name: 'Long Password Co',
      handle: 'longpwco',
      city: 'Testville',
      category: 'Testing',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a menu item price of Infinity or an unreasonably large number', async () => {
    const { token } = await signup('menuvalidation');
    const infinite = await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ menuItems: [{ name: 'Broken Item', price: Infinity }] });
    expect(infinite.status).toBe(400);

    const tooLarge = await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ menuItems: [{ name: 'Broken Item', price: 99999999 }] });
    expect(tooLarge.status).toBe(400);
  });

  it('rejects an oversized cuisineSlug on signup and on profile update', async () => {
    const signupRes = await request(app).post('/auth/signup').send({
      email: 'bigcuisine@test.com',
      password: 'password123',
      name: 'Big Cuisine Co',
      handle: 'bigcuisineco',
      city: 'Testville',
      isRestaurant: true,
      cuisineSlug: 'x'.repeat(200),
    });
    expect(signupRes.status).toBe(400);

    const { token } = await signup('bigcuisineupdate');
    const updateRes = await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ cuisineSlug: 'x'.repeat(200) });
    expect(updateRes.status).toBe(400);
  });

  // --- Security: auth token expiry ---
  // Note: this codebase has no refresh-token flow — signToken() issues a single 30-day
  // JWT with no rotation/renewal mechanism; the only way to get a new one is to log in
  // again. These tests cover the expiry behavior that actually exists, signing tokens
  // directly with the same secret the test environment uses (see tests/setupEnv.ts)
  // rather than waiting 30 real days.

  it('accepts a token that is still within its 30-day life', async () => {
    const { business } = await signup('validtokentest');
    const notYetExpiredToken = jwt.sign({ sub: business.id, mid: null }, 'test-secret', { expiresIn: '29d' });
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${notYetExpiredToken}`);
    expect(res.status).toBe(200);
  });

  it('rejects a token once it has expired', async () => {
    const { business } = await signup('expiredtokentest');
    const expiredToken = jwt.sign({ sub: business.id, mid: null }, 'test-secret', { expiresIn: '-10s' });
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const { business } = await signup('wrongsecrettest');
    const forgedToken = jwt.sign({ sub: business.id, mid: null }, 'not-the-real-secret', { expiresIn: '30d' });
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${forgedToken}`);
    expect(res.status).toBe(401);
  });

  // --- Observability: structured logging around the city-lock filter ---

  function readStructuredLogEvents(spy: jest.SpyInstance, event: string): Record<string, unknown>[] {
    return spy.mock.calls
      .map(([line]) => {
        try {
          return JSON.parse(line as string);
        } catch {
          return null;
        }
      })
      .filter((parsed): parsed is Record<string, unknown> => Boolean(parsed) && parsed!.event === event);
  }

  it('logs a structured feed.city_lock event with real match/mismatch counts', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const cityA = await signup('logcitya', { city: 'Logtown' });
    const cityB = await signup('logcityb', { city: 'Othertown' });
    await createPost(cityA.token, { caption: 'Logtown post' });
    await createPost(cityB.token, { caption: 'Othertown post' });
    const viewer = await signup('logviewer', { city: 'Logtown', isRestaurant: false });

    logSpy.mockClear();
    const res = await request(app).get('/posts/feed?tab=forYou').set('Authorization', `Bearer ${viewer.token}`);
    expect(res.status).toBe(200);

    const events = readStructuredLogEvents(logSpy, 'feed.city_lock');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: 'info',
      viewerCity: 'Logtown',
      matchedCount: 1,
    });
    expect(typeof events[0].totalEligiblePlatformWide).toBe('number');
    expect(events[0].totalEligiblePlatformWide as number).toBeGreaterThanOrEqual(2);
    expect(events[0].mismatchCount).toBe((events[0].totalEligiblePlatformWide as number) - 1);

    logSpy.mockRestore();
  });

  // --- Edge cases ---

  it('accepts a post whose video is malformed (undecodable), falling back to the untranscoded original rather than rejecting it', async () => {
    const { token } = await signup('malformedvideo');
    // A REAL MP4 container header (`ftyp` box, isom brand) followed by garbage, rather than
    // the plain ASCII string this used to send. The point of this test is transcoder
    // resilience — "ffmpeg couldn't decode it" must not fail the upload — and that needs a
    // file which genuinely is an MP4 but is undecodable. The old fixture wasn't a video at
    // all, so once uploads started verifying magic bytes (see upload.ts) it was really
    // asserting that the API accepts arbitrary bytes wearing a video mimetype, which is the
    // spoofed-Content-Type bypass itself. Both guarantees hold now: this still exercises the
    // fallback path, and security.test.ts covers the rejection path it used to contradict.
    const ftypBox = Buffer.from([
      0x00, 0x00, 0x00, 0x20, // box size: 32
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6f, 0x6d, // major brand 'isom'
      0x00, 0x00, 0x02, 0x00, // minor version
      0x69, 0x73, 0x6f, 0x6d, // compatible: 'isom'
      0x69, 0x73, 0x6f, 0x32, // 'iso2'
      0x61, 0x76, 0x63, 0x31, // 'avc1'
      0x6d, 0x70, 0x34, 0x31, // 'mp41'
    ]);
    const garbage = Buffer.concat([ftypBox, Buffer.from('no moov, no mdat, nothing decodable here')]);
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'A video that is not actually a video')
      .field('tag', 'Culture')
      .attach('media', garbage, { filename: 'fake.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(201);
    expect(res.body.post.mediaType).toBe('video');
    // Fell back to the raw upload — never got a "-web.mp4" transcoded name.
    expect(res.body.post.mediaUrl).not.toMatch(/-web\.mp4$/);
  }, 15000);

  it('rejects an oversized upload with 400, not a 500 or a hang', async () => {
    const { token } = await signup('oversizedupload');
    const oversized = Buffer.alloc(51 * 1024 * 1024); // over the 50MB limit in upload.ts
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'Way too big')
      .field('tag', 'Culture')
      .attach('media', oversized, { filename: 'huge.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(400);
  }, 20000);

  it('rejects an upload whose declared mimetype is neither image nor video', async () => {
    const { token } = await signup('wrongmimetype');
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'A PDF, not media')
      .field('tag', 'Culture')
      .attach('media', Buffer.from('%PDF-1.4 not really'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
  });

  it('rejects an SVG upload even though its mimetype starts with "image/"', async () => {
    // image/svg+xml used to pass the old `startsWith('image/')` check and get served back by
    // express.static with that same content-type — a browser treats that as active content,
    // so an SVG with an embedded <script> is a stored-XSS payload, not an inert image.
    const { token } = await signup('svgupload');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'Not actually an image')
      .field('tag', 'Culture')
      .attach('media', svg, { filename: 'evil.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(400);
  });

  it('derives the stored file extension from the validated mimetype, not the client-supplied filename', async () => {
    // A client fully controls `originalname`; deriving the stored extension from it (rather
    // than from the mimetype fileFilter already checked) would let that same attacker-chosen
    // string decide how the file is later served, regardless of what fileFilter approved.
    const { token } = await signup('trickyfilename');
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'Sneaky filename, real image bytes')
      .field('tag', 'Culture')
      .attach('media', fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.png')), {
        filename: 'not-what-it-looks-like.svg',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    expect(res.body.post.mediaUrl).toMatch(/\.png$/);
  });

  it('uploads an avatar and a cover photo through the same persistence path posts/stories use', async () => {
    // Regression guard: /me/avatar and /me/cover used to hardcode a local `/uploads/...` path
    // instead of calling persistUpload() like every other upload route, so profile photos
    // silently never made it to Supabase Storage even when it was configured. Storage isn't
    // configured in this test env either way, so persistUpload() resolves to the same local
    // path here — this mainly guards against a regression in wiring, not the Supabase path.
    const { token } = await signup('avatarcoveruser');

    const avatarRes = await request(app)
      .post('/businesses/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));
    expect(avatarRes.status).toBe(200);
    expect(avatarRes.body.business.avatarUrl).toMatch(/^\/uploads\/.+\.png$/);

    const coverRes = await request(app)
      .post('/businesses/me/cover')
      .set('Authorization', `Bearer ${token}`)
      .attach('media', path.join(__dirname, 'fixtures', 'sample.png'));
    expect(coverRes.status).toBe(200);
    expect(coverRes.body.business.coverUrl).toMatch(/^\/uploads\/.+\.png$/);
  });

  // --- Reply-to-post (questions directed at the restaurant) ---

  it('creates a reply flagged distinctly from a plain comment', async () => {
    const restaurant = await signup('replyrestaurant');
    const post = await createPost(restaurant.token);
    const asker = await signup('replyasker', { isRestaurant: false });

    const reply = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ text: 'Are you open on Mondays?', isReply: true });

    expect(reply.status).toBe(201);
    expect(reply.body.comment.isReply).toBe(true);
    expect(reply.body.comment.answered).toBe(false);
  });

  it('defaults to a plain comment when isReply is omitted, so existing clients are unaffected', async () => {
    const restaurant = await signup('replydefault');
    const post = await createPost(restaurant.token);
    const commenter = await signup('replydefaultcommenter', { isRestaurant: false });

    const res = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ text: 'Looks great' });

    expect(res.status).toBe(201);
    expect(res.body.comment.isReply).toBe(false);
  });

  it('reports the open question count to the post owner', async () => {
    const restaurant = await signup('replycount');
    const post = await createPost(restaurant.token);
    const asker = await signup('replycountasker', { isRestaurant: false });

    await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ text: 'Do you have vegan options?', isReply: true });
    await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ text: 'Just a normal comment', isReply: false });

    const res = await request(app)
      .get(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${restaurant.token}`);

    expect(res.body.openReplyCount).toBe(1);
  });

  it('sorts unanswered questions first for the post owner only', async () => {
    const restaurant = await signup('replysort');
    const post = await createPost(restaurant.token);
    const asker = await signup('replysortasker', { isRestaurant: false });

    // Plain comment posted FIRST, question SECOND — so chronological order and
    // questions-first order are genuinely different.
    const plain = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ text: 'Nice photo' });
    const question = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ text: 'Is this gluten free?', isReply: true });

    const ownerView = await request(app)
      .get(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${restaurant.token}`);
    expect(ownerView.body.comments[0].id).toBe(question.body.comment.id);

    // Everyone else keeps plain chronological order.
    const askerView = await request(app)
      .get(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`);
    expect(askerView.body.comments[0].id).toBe(plain.body.comment.id);
  });

  it('lets the post owner mark a question answered, clearing it from the open count', async () => {
    const restaurant = await signup('replyanswer');
    const post = await createPost(restaurant.token);
    const asker = await signup('replyanswerasker', { isRestaurant: false });
    const question = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ text: 'Do you deliver?', isReply: true });

    const res = await request(app)
      .post(`/posts/${post.body.post.id}/comments/${question.body.comment.id}/answered`)
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.comment.answered).toBe(true);

    const after = await request(app)
      .get(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${restaurant.token}`);
    expect(after.body.openReplyCount).toBe(0);
  });

  it('does not let anyone but the post owner mark a question answered', async () => {
    // Including the person who asked it — otherwise the owner's indicator could be
    // cleared out from under them and would stop meaning anything.
    const restaurant = await signup('replyauthz');
    const post = await createPost(restaurant.token);
    const asker = await signup('replyauthzasker', { isRestaurant: false });
    const stranger = await signup('replyauthzstranger', { isRestaurant: false });
    const question = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ text: 'Parking?', isReply: true });

    const byAsker = await request(app)
      .post(`/posts/${post.body.post.id}/comments/${question.body.comment.id}/answered`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({});
    expect(byAsker.status).toBe(403);

    const byStranger = await request(app)
      .post(`/posts/${post.body.post.id}/comments/${question.body.comment.id}/answered`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({});
    expect(byStranger.status).toBe(403);

    const anon = await request(app)
      .post(`/posts/${post.body.post.id}/comments/${question.body.comment.id}/answered`)
      .send({});
    expect(anon.status).toBe(401);
  });

  it('404s marking answered when the comment does not belong to that post', async () => {
    const restaurant = await signup('replywrongpost');
    const postA = await createPost(restaurant.token, { caption: 'Post A' });
    const postB = await createPost(restaurant.token, { caption: 'Post B' });
    const asker = await signup('replywrongpostasker', { isRestaurant: false });
    const question = await request(app)
      .post(`/posts/${postA.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ text: 'Question on A', isReply: true });

    const res = await request(app)
      .post(`/posts/${postB.body.post.id}/comments/${question.body.comment.id}/answered`)
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it('still applies the spam filter and moderation hiding to replies', async () => {
    const restaurant = await signup('replymoderation');
    const post = await createPost(restaurant.token);
    const asker = await signup('replymoderationasker', { isRestaurant: false });

    const spam = await request(app)
      .post(`/posts/${post.body.post.id}/comments`)
      .set('Authorization', `Bearer ${asker.token}`)
      .send({ text: 'buy followers cheap here', isReply: true });
    expect(spam.status).toBe(400);
  });

  // --- Ordering/website link click tracking ---

  it('logs a link click from a logged-in viewer', async () => {
    const restaurant = await signup('clicktarget');
    const viewer = await signup('clickviewer', { isRestaurant: false });

    const res = await request(app)
      .post(`/businesses/${restaurant.business.id}/link-click`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({});

    expect(res.status).toBe(201);
    const rows = await prisma.linkClick.findMany({ where: { restaurantId: restaurant.business.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].viewerId).toBe(viewer.business.id);
  });

  it('logs an anonymous link click with a null viewerId', async () => {
    // Restaurant profiles are publicly viewable, so their links are publicly tappable —
    // requiring auth here would undercount exactly the traffic restaurants care about.
    const restaurant = await signup('clickanontarget');

    const res = await request(app).post(`/businesses/${restaurant.business.id}/link-click`).send({});

    expect(res.status).toBe(201);
    const rows = await prisma.linkClick.findMany({ where: { restaurantId: restaurant.business.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].viewerId).toBeNull();
  });

  it('404s a link click against a business that does not exist', async () => {
    const res = await request(app).post('/businesses/does-not-exist-id/link-click').send({});
    expect(res.status).toBe(404);
  });

  it('counts repeat clicks separately rather than deduping them', async () => {
    // A second tap is a real second intent to order, not a duplicate to collapse.
    const restaurant = await signup('clickrepeat');
    const viewer = await signup('clickrepeatviewer', { isRestaurant: false });

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/businesses/${restaurant.business.id}/link-click`)
        .set('Authorization', `Bearer ${viewer.token}`)
        .send({});
    }

    const stats = await request(app)
      .get('/businesses/me/link-clicks')
      .set('Authorization', `Bearer ${restaurant.token}`);
    expect(stats.body.totalClicks).toBe(3);
    expect(stats.body.clicks30d).toBe(3);
  });

  it('returns an accurate click count on the stats endpoint', async () => {
    const restaurant = await signup('clickstats');
    const viewer = await signup('clickstatsviewer', { isRestaurant: false });

    await request(app).post(`/businesses/${restaurant.business.id}/link-click`).send({});
    await request(app)
      .post(`/businesses/${restaurant.business.id}/link-click`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({});

    const res = await request(app)
      .get('/businesses/me/link-clicks')
      .set('Authorization', `Bearer ${restaurant.token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalClicks).toBe(2);
    expect(res.body.recentClicks).toHaveLength(2);
  });

  it('never lets one restaurant see another restaurant\'s click data', async () => {
    // Click volume is competitive business intelligence. The stats route is scoped by the
    // token's own businessId and takes no :id param at all, so there is no path — spoofed
    // or otherwise — for restaurant B to read restaurant A's numbers.
    const restaurantA = await signup('clickisolationa');
    const restaurantB = await signup('clickisolationb');

    await request(app).post(`/businesses/${restaurantA.business.id}/link-click`).send({});
    await request(app).post(`/businesses/${restaurantA.business.id}/link-click`).send({});

    const bStats = await request(app)
      .get('/businesses/me/link-clicks')
      .set('Authorization', `Bearer ${restaurantB.token}`);
    expect(bStats.status).toBe(200);
    expect(bStats.body.totalClicks).toBe(0);

    const aStats = await request(app)
      .get('/businesses/me/link-clicks')
      .set('Authorization', `Bearer ${restaurantA.token}`);
    expect(aStats.body.totalClicks).toBe(2);
  });

  it('requires authentication to read click stats', async () => {
    const res = await request(app).get('/businesses/me/link-clicks');
    expect(res.status).toBe(401);
  });

  it('surfaces link clicks in the analytics dashboard, scoped to the owning restaurant', async () => {
    const restaurantA = await signup('clickanalyticsa');
    const restaurantB = await signup('clickanalyticsb');
    await request(app).post(`/businesses/${restaurantA.business.id}/link-click`).send({});

    const aRes = await request(app).get('/analytics/me').set('Authorization', `Bearer ${restaurantA.token}`);
    expect(aRes.body.linkClicks30d).toBe(1);

    const bRes = await request(app).get('/analytics/me').set('Authorization', `Bearer ${restaurantB.token}`);
    expect(bRes.body.linkClicks30d).toBe(0);
  });

  it('deletes link clicks with the account rather than blocking the delete on a foreign key', async () => {
    // restaurantId is an onDelete: Restrict FK — without explicit cleanup in the delete
    // transaction, any restaurant that ever got a link tap could never delete its account.
    const restaurant = await signup('clickdeletion');
    const viewer = await signup('clickdeletionviewer', { isRestaurant: false });
    await request(app).post(`/businesses/${restaurant.business.id}/link-click`).send({});
    await request(app)
      .post(`/businesses/${viewer.business.id}/link-click`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({});

    const res = await request(app).delete('/businesses/me').set('Authorization', `Bearer ${restaurant.token}`);
    expect(res.status).toBe(200);
    expect(await prisma.linkClick.count({ where: { restaurantId: restaurant.business.id } })).toBe(0);
  });

  // --- GPS / radius-based location matching ---
  //
  // Real coordinates so the distances are checkable: downtown Austin, Round Rock (~17mi,
  // inside the 20mi default radius), San Marcos (~29mi, outside it), and Denver (~780mi).
  const GEO = {
    austin: { latitude: 30.2672, longitude: -97.7431 },
    roundRock: { latitude: 30.5083, longitude: -97.6789 },
    sanMarcos: { latitude: 29.8833, longitude: -97.9414 },
    denver: { latitude: 39.7392, longitude: -104.9903 },
  };

  it('shows a geolocated restaurant inside the radius, even when its city label differs', async () => {
    const restaurant = await signup('georadiusnear', { city: 'Round Rock', ...GEO.roundRock });
    const post = await createPost(restaurant.token, { caption: 'Near geo restaurant' });
    const viewer = await signup('georadiusviewer', { city: 'Austin', isRestaurant: false, ...GEO.austin });

    const res = await request(app)
      .get('/posts/feed?tab=forYou')
      .set('Authorization', `Bearer ${viewer.token}`);

    expect(res.status).toBe(200);
    // The old exact city-string match ("Austin" !== "Round Rock") would have hidden this.
    expect(res.body.posts.some((p: { id: string }) => p.id === post.body.post.id)).toBe(true);
  });

  it('hides a geolocated restaurant outside the radius', async () => {
    const restaurant = await signup('georadiusfar', { city: 'San Marcos', ...GEO.sanMarcos });
    const post = await createPost(restaurant.token, { caption: 'Far geo restaurant' });
    const viewer = await signup('georadiusfarviewer', { city: 'Austin', isRestaurant: false, ...GEO.austin });

    const res = await request(app)
      .get('/posts/feed?tab=forYou')
      .set('Authorization', `Bearer ${viewer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.some((p: { id: string }) => p.id === post.body.post.id)).toBe(false);
  });

  it('hides a far-away restaurant whose city string happens to match the viewer\'s', async () => {
    // Coordinates take precedence when both sides have them, so a same-named city in
    // another state must not leak in through the fallback path.
    const restaurant = await signup('geosamecityfar', { city: 'Springfield', ...GEO.denver });
    const post = await createPost(restaurant.token, { caption: 'Same city name, wrong state' });
    const viewer = await signup('geosamecityviewer', { city: 'Springfield', isRestaurant: false, ...GEO.austin });

    const res = await request(app)
      .get('/posts/feed?tab=forYou')
      .set('Authorization', `Bearer ${viewer.token}`);

    expect(res.body.posts.some((p: { id: string }) => p.id === post.body.post.id)).toBe(false);
  });

  it('falls back to city matching for a viewer who declined the location permission', async () => {
    // The permission-denied path: no coordinates are sent at signup at all, and the
    // account must still get a working feed rather than an empty one.
    const restaurant = await signup('geodeniedrestaurant', { city: 'Fallbackville', ...GEO.austin });
    const post = await createPost(restaurant.token, { caption: 'Fallback city restaurant' });
    const viewer = await signup('geodeniedviewer', { city: 'Fallbackville', isRestaurant: false });

    const res = await request(app)
      .get('/posts/feed?tab=forYou')
      .set('Authorization', `Bearer ${viewer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.some((p: { id: string }) => p.id === post.body.post.id)).toBe(true);
    expect(res.body.city).toBe('Fallbackville');
  });

  it('still shows a city-only restaurant to a geolocated viewer in the same city', async () => {
    // Mixed population: a restaurant that never captured coordinates (pre-feature account
    // or declined permission) must remain visible to viewers who DID grant location.
    const restaurant = await signup('geomixedrestaurant', { city: 'Mixedtown' });
    const post = await createPost(restaurant.token, { caption: 'City-only restaurant' });
    const viewer = await signup('geomixedviewer', { city: 'Mixedtown', isRestaurant: false, ...GEO.austin });

    const res = await request(app)
      .get('/posts/feed?tab=forYou')
      .set('Authorization', `Bearer ${viewer.token}`);

    expect(res.body.posts.some((p: { id: string }) => p.id === post.body.post.id)).toBe(true);
  });

  it('does not expose raw coordinates on a profile, only a hasLocation flag', async () => {
    // A viewer's coordinates are their home location — publishing them on a profile any
    // stranger can fetch would be a privacy leak.
    const viewer = await signup('geoprivacy', { city: 'Austin', isRestaurant: false, ...GEO.austin });
    const res = await request(app).get(`/businesses/${viewer.business.id}`);

    expect(res.status).toBe(200);
    expect(res.body.business.hasLocation).toBe(true);
    expect(res.body.business.latitude).toBeUndefined();
    expect(res.body.business.longitude).toBeUndefined();
  });

  it('ignores a partial or out-of-range coordinate pair rather than storing half a location', async () => {
    const viewer = await signup('geopartial', { city: 'Partialville', isRestaurant: false, latitude: 30.2672 });
    const row = await prisma.business.findUnique({ where: { id: viewer.business.id } });
    expect(row!.latitude).toBeNull();
    expect(row!.longitude).toBeNull();
  });

  it('rejects an out-of-range coordinate at signup validation', async () => {
    const res = await request(app).post('/auth/signup').send({
      email: 'geobadrange@test.com',
      password: 'password123',
      name: 'Bad Range Inc',
      handle: 'geobadrange',
      city: 'Nowhere',
      isRestaurant: false,
      category: 'Testing',
      latitude: 999,
      longitude: -97.7431,
    });
    expect(res.status).toBe(400);
  });

  it('lets a restaurant attach coordinates later via profile update', async () => {
    const restaurant = await signup('geolateattach', { city: 'Latetown' });
    const before = await prisma.business.findUnique({ where: { id: restaurant.business.id } });
    expect(before!.latitude).toBeNull();

    const res = await request(app)
      .patch('/businesses/me')
      .set('Authorization', `Bearer ${restaurant.token}`)
      .send({ latitude: GEO.austin.latitude, longitude: GEO.austin.longitude });

    expect(res.status).toBe(200);
    expect(res.body.business.hasLocation).toBe(true);
    const after = await prisma.business.findUnique({ where: { id: restaurant.business.id } });
    expect(after!.latitude).toBeCloseTo(GEO.austin.latitude, 4);
    expect(after!.longitude).toBeCloseTo(GEO.austin.longitude, 4);
  });

  // --- Map view: nearby restaurants endpoint ---

  it('returns nearby restaurants with coarsened coordinates and a distance', async () => {
    const restaurant = await signup('mapnear', { city: 'Round Rock', ...GEO.roundRock });
    const viewer = await signup('mapviewer', { city: 'Austin', isRestaurant: false, ...GEO.austin });

    const res = await request(app).get('/businesses/nearby').set('Authorization', `Bearer ${viewer.token}`);

    expect(res.status).toBe(200);
    const pin = res.body.restaurants.find((r: { id: string }) => r.id === restaurant.business.id);
    expect(pin).toBeDefined();
    expect(pin.distanceMiles).toBeGreaterThan(0);
    // Rounded to 3dp (~100m) so an exact fix isn't published for a restaurant.
    expect(pin.latitude.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
    expect(pin.longitude.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it('excludes restaurants outside the radius from the map', async () => {
    const far = await signup('mapfar', { city: 'San Marcos', ...GEO.sanMarcos });
    const viewer = await signup('mapfarviewer', { city: 'Austin', isRestaurant: false, ...GEO.austin });

    const res = await request(app).get('/businesses/nearby').set('Authorization', `Bearer ${viewer.token}`);
    expect(res.body.restaurants.some((r: { id: string }) => r.id === far.business.id)).toBe(false);
  });

  it('omits restaurants that have no coordinates, since they cannot be placed on a map', async () => {
    const cityOnly = await signup('mapcityonly', { city: 'Maptown' });
    const viewer = await signup('mapcityonlyviewer', { city: 'Maptown', isRestaurant: false, ...GEO.austin });

    const res = await request(app).get('/businesses/nearby').set('Authorization', `Bearer ${viewer.token}`);
    expect(res.body.restaurants.some((r: { id: string }) => r.id === cityOnly.business.id)).toBe(false);
  });

  it('never returns plain viewer accounts as map pins', async () => {
    const otherViewer = await signup('mapotherviewer', { city: 'Austin', isRestaurant: false, ...GEO.austin });
    const viewer = await signup('mappinviewer', { city: 'Austin', isRestaurant: false, ...GEO.austin });

    const res = await request(app).get('/businesses/nearby').set('Authorization', `Bearer ${viewer.token}`);
    expect(res.body.restaurants.some((r: { id: string }) => r.id === otherViewer.business.id)).toBe(false);
  });

  it('excludes blocked businesses from the map, matching the feed', async () => {
    const blocked = await signup('mapblocked', { city: 'Austin', ...GEO.austin });
    const viewer = await signup('mapblockviewer', { city: 'Austin', isRestaurant: false, ...GEO.austin });
    await request(app)
      .post(`/businesses/${blocked.business.id}/block`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({});

    const res = await request(app).get('/businesses/nearby').set('Authorization', `Bearer ${viewer.token}`);
    expect(res.body.restaurants.some((r: { id: string }) => r.id === blocked.business.id)).toBe(false);
  });

  it('requires authentication for the nearby endpoint', async () => {
    const res = await request(app).get('/businesses/nearby');
    expect(res.status).toBe(401);
  });

  it('reports whether the viewer has a location so the client can prompt for it', async () => {
    const withLoc = await signup('maphasloc', { city: 'Austin', isRestaurant: false, ...GEO.austin });
    const withoutLoc = await signup('mapnoloc', { city: 'Austin', isRestaurant: false });

    const a = await request(app).get('/businesses/nearby').set('Authorization', `Bearer ${withLoc.token}`);
    expect(a.body.viewerHasLocation).toBe(true);

    const b = await request(app).get('/businesses/nearby').set('Authorization', `Bearer ${withoutLoc.token}`);
    expect(b.body.viewerHasLocation).toBe(false);
  });

  it('shows an empty result (not another city\'s posts) when the cuisine filter matches nothing in the viewer\'s own city', async () => {
    const restaurant = await signup('zeromatchcuisine', { city: 'Zerotown', cuisineSlug: 'italian' });
    await createPost(restaurant.token, { caption: 'Italian food in Zerotown' });
    const viewer = await signup('zeromatchviewer', { city: 'Zerotown', isRestaurant: false });

    // Zerotown has an Italian restaurant but no Thai one — filtering by Thai should come
    // back empty, not silently fall back to showing the Italian posts or another city's.
    const res = await request(app)
      .get('/posts/feed?tab=forYou&cuisine=thai')
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
    expect(res.body.city).toBe('Zerotown');
  });
});
