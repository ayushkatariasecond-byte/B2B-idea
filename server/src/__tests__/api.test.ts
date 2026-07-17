import request from 'supertest';
import path from 'path';
import { app } from '../index';
import { prisma } from '../db';

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
});
