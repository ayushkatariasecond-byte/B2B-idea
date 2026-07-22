import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { app } from '../index';
import { prisma } from '../db';
import { UPLOAD_DIR } from '../upload';
import { makeResetToken, makeVerifyToken } from '../authTokens';

async function signup(handle: string) {
  const res = await request(app).post('/auth/signup').send({
    email: `${handle}@test.com`,
    password: 'password123',
    name: `${handle} Inc`,
    handle,
    category: 'Testing',
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
      .send({ email: 'dupe@test.com', password: 'password123', name: 'Other', handle: 'dupeother', category: 'Testing' });
    expect(dupeEmail.status).toBe(409);

    const dupeHandle = await request(app)
      .post('/auth/signup')
      .send({ email: 'other@test.com', password: 'password123', name: 'Other', handle: 'dupe', category: 'Testing' });
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

    const feedRes = await request(app).get('/posts/feed?tab=forYou');
    expect(feedRes.status).toBe(200);
    const dominantOnPage = feedRes.body.posts.filter((p: { businessId: string }) => p.businessId === dominant.business.id);
    expect(dominantOnPage.length).toBeLessThanOrEqual(3);

    // The cap reorders, it doesn't drop — all 5 posts must still be reachable across pages.
    const allIds = await fetchForYouOrder();
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
});
