'use strict';

const request = require('supertest');
const { createApp } = require('../app');
const { JWT_SECRET, tokenFor, makePool, authed, PNG_URL, dataUrl } = require('./helpers');

let pool;
let app;
beforeEach(() => {
  pool = makePool();
  app = createApp(pool, { jwtSecret: JWT_SECRET, avatarMaxBytes: 2048 });
});

describe('GET /api/users/:id (profile)', () => {
  it('returns profile, avatar, follow counts, isFollowing and the polls', async () => {
    pool.execute
      .mockResolvedValueOnce([[{
        id: 2, username: 'ivan', created_at: 'joined', avatar_url: null, avatar_ver: 'v1',
        followers_count: 12, following_count: 3, is_following: 1,
      }]])
      .mockResolvedValueOnce([[{ id: 9, question: 'Best editor?', created_at: 'c', has_image: 1 }]]);

    const res = await authed(app, tokenFor(1)).get('/api/users/2');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 2, username: 'ivan', avatarUrl: '/api/users/2/avatar?v=v1', createdAt: 'joined',
      followersCount: 12, followingCount: 3, isFollowing: true,
      polls: [{ id: 9, question: 'Best editor?', createdAt: 'c', imageUrl: '/api/polls/9/image' }],
    });
    expect(pool.execute.mock.calls[0][1]).toEqual([1, 2]); // viewer id, profile id
    expect(JSON.stringify(res.body)).not.toMatch(/email|password/);
  });
  it('404s for an unknown user', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    expect((await authed(app).get('/api/users/999')).status).toBe(404);
  });
  it.each(['abc', '0', '-1', '1.5', '99999999999'])('rejects invalid id "%s"', async (bad) => {
    expect((await authed(app).get(`/api/users/${bad}`)).status).toBe(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });
  it('401s without a token', async () => {
    expect((await request(app).get('/api/users/2')).status).toBe(401);
  });
});

describe('avatar upload / url / remove', () => {
  const state = { id: 1, username: 'tester', avatar_url: null, avatar_ver: 'newetag' };

  it('stores an uploaded avatar and clears any external URL, in one transaction', async () => {
    pool.execute.mockResolvedValueOnce([[state]]);
    const res = await authed(app).put('/api/users/me/avatar').send({ image: PNG_URL });
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toBe('/api/users/1/avatar?v=newetag');
    const [upsert, clearUrl] = pool.conn.execute.mock.calls;
    expect(upsert[0]).toMatch(/INSERT INTO user_avatars/);
    expect(upsert[1][0]).toBe(1);
    expect(upsert[1][1]).toBe('image/png');
    expect(upsert[1][3]).toMatch(/^[a-f0-9]{16}$/);
    expect(clearUrl[1]).toEqual([null, 1]);
    expect(pool.conn.commit).toHaveBeenCalled();
  });

  it('accepts an https URL and removes any uploaded avatar', async () => {
    pool.execute.mockResolvedValueOnce([[{ ...state, avatar_url: 'https://cdn.example.com/me.png', avatar_ver: null }]]);
    const res = await authed(app).put('/api/users/me/avatar').send({ url: 'https://cdn.example.com/me.png' });
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toBe('https://cdn.example.com/me.png');
    expect(pool.conn.execute.mock.calls[0][0]).toMatch(/DELETE FROM user_avatars/);
    expect(pool.conn.execute.mock.calls[1][1]).toEqual(['https://cdn.example.com/me.png', 1]);
  });

  it.each([
    ['http URL', { url: 'http://example.com/a.png' }],
    ['javascript URL', { url: 'javascript:alert(1)' }],
    ['URL with credentials', { url: 'https://u:p@example.com/a.png' }],
    ['data URL inside "url"', { url: PNG_URL }],
    ['both image and url', { image: PNG_URL, url: 'https://example.com/a.png' }],
    ['neither', {}],
    ['SVG upload', { image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }],
    ['fake PNG', { image: dataUrl('image/png', Buffer.from('<script>alert(1)</script>')) }],
    ['avatar over the cap', { image: dataUrl('image/png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3000)])) }],
  ])('rejects %s', async (_n, body) => {
    const res = await authed(app).put('/api/users/me/avatar').send(body);
    expect([400, 413]).toContain(res.status);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('removes the avatar', async () => {
    pool.execute
      .mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ ...state, avatar_ver: null }]]);
    const res = await authed(app).delete('/api/users/me/avatar');
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toBeNull();
  });

  it('serves avatar bytes with hardened headers; 404 if none', async () => {
    pool.execute.mockResolvedValueOnce([[{ mime: 'image/jpeg', data: Buffer.from([1, 2, 3]) }]]);
    const ok = await authed(app).get('/api/users/2/avatar');
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toMatch(/image\/jpeg/);
    expect(ok.headers['content-security-policy']).toMatch(/sandbox/);
    pool.execute.mockResolvedValueOnce([[]]);
    expect((await authed(app).get('/api/users/2/avatar')).status).toBe(404);
  });

  it('401s without a token (and does not read the large body)', async () => {
    const res = await request(app).put('/api/users/me/avatar').send({ image: PNG_URL });
    expect(res.status).toBe(401);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});

describe('follow / unfollow', () => {
  it('follows a user and returns the new follower count', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 2, username: 'ivan' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ n: 5 }]]);
    const res = await authed(app, tokenFor(1)).post('/api/users/2/follow');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ following: true, followersCount: 5 });
    expect(pool.execute.mock.calls[1][0]).toMatch(/INSERT IGNORE INTO follows/);
    expect(pool.execute.mock.calls[1][1]).toEqual([1, 2]);
  });

  it('refuses to follow yourself without touching the database', async () => {
    const res = await authed(app, tokenFor(4)).post('/api/users/4/follow');
    expect(res.status).toBe(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it('404s when following a user that does not exist', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    expect((await authed(app).post('/api/users/999/follow')).status).toBe(404);
  });

  it('unfollows (idempotent) and returns the count', async () => {
    pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ n: 4 }]]);
    const res = await authed(app, tokenFor(1)).delete('/api/users/2/follow');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ following: false, followersCount: 4 });
    expect(pool.execute.mock.calls[0][1]).toEqual([1, 2]);
  });

  it('requires login and a valid id', async () => {
    expect((await request(app).post('/api/users/2/follow')).status).toBe(401);
    expect((await request(app).delete('/api/users/2/follow')).status).toBe(401);
    expect((await authed(app).post('/api/users/abc/follow')).status).toBe(400);
  });
});

describe('GET /api/users/:id/followers and /following', () => {
  const u = (id, f = 0) => ({ id, username: `u${id}`, avatar_url: null, avatar_ver: null, is_following: f });

  it('lists followers with avatars and the viewer\'s follow state', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 2, username: 'ivan' }]])
      .mockResolvedValueOnce([[u(5, 1), u(6, 0)]]);
    const res = await authed(app, tokenFor(1)).get('/api/users/2/followers');
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 2, username: 'ivan' });
    expect(res.body.hasMore).toBe(false);
    expect(res.body.users).toEqual([
      { id: 5, username: 'u5', avatarUrl: null, isFollowing: true },
      { id: 6, username: 'u6', avatarUrl: null, isFollowing: false },
    ]);
    expect(pool.execute.mock.calls[1][0]).toMatch(/WHERE f\.following_id = \?/);
    expect(pool.execute.mock.calls[1][1]).toEqual([1, 2]);
  });

  it('lists who a user follows', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 2, username: 'ivan' }]]).mockResolvedValueOnce([[u(8)]]);
    const res = await authed(app).get('/api/users/2/following');
    expect(res.status).toBe(200);
    expect(pool.execute.mock.calls[1][0]).toMatch(/WHERE f\.follower_id = \?/);
  });

  it('flags hasMore and paginates with a validated page number', async () => {
    const rows = Array.from({ length: 31 }, (_, i) => u(i + 10));
    pool.execute.mockResolvedValueOnce([[{ id: 2, username: 'ivan' }]]).mockResolvedValueOnce([rows]);
    const res = await authed(app).get('/api/users/2/followers?page=3');
    expect(res.body.hasMore).toBe(true);
    expect(res.body.users).toHaveLength(30);
    expect(pool.execute.mock.calls[1][0]).toMatch(/LIMIT 31 OFFSET \?/);
    expect(pool.execute.mock.calls[1][1]).toEqual([1, 2, '60']); // viewer, profile, offset (page 3)
  });

  it.each(['0', 'abc', '1;DROP TABLE users', '9999'])('rejects page "%s"', async (page) => {
    const res = await authed(app).get(`/api/users/2/followers?page=${encodeURIComponent(page)}`);
    expect(res.status).toBe(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });
});
