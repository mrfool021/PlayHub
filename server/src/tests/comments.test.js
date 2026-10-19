'use strict';

const request = require('supertest');
const { createApp } = require('../app');
const { JWT_SECRET, tokenFor, makePool, authed } = require('./helpers');

let pool;
let app;
beforeEach(() => {
  pool = makePool();
  app = createApp(pool, { jwtSecret: JWT_SECRET });
});

const crow = (id, parent = null, uid = 2, extra = {}) => ({
  id, poll_id: 3, parent_id: parent, body: `comment ${id}`, created_at: '2026-10-07T00:00:00.000Z',
  uid, uname: `user${uid}`, uavatar_url: null, uavatar_ver: null, ...extra,
});

describe('GET /api/polls/:id/comments', () => {
  it('returns top-level comments with their replies, user avatars and a total', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 3 }]]) // poll active
      .mockResolvedValueOnce([[crow(11, null, 2, { uavatar_ver: 'e1' }), crow(10)]]) // roots (newest first)
      .mockResolvedValueOnce([[{ total: 3 }]]) // count
      .mockResolvedValueOnce([[crow(12, 10, 4)]]); // replies

    const res = await authed(app).get('/api/polls/3/comments');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.comments.map((c) => c.id)).toEqual([11, 10]);
    expect(res.body.comments[0].user).toEqual({ id: 2, username: 'user2', avatarUrl: '/api/users/2/avatar?v=e1' });
    expect(res.body.comments[1].replies).toHaveLength(1);
    expect(res.body.comments[1].replies[0].user.username).toBe('user4');
  });

  it('paginates: returns a cursor when more than one page exists', async () => {
    const many = Array.from({ length: 21 }, (_, i) => crow(100 - i));
    pool.execute
      .mockResolvedValueOnce([[{ id: 3 }]])
      .mockResolvedValueOnce([many])
      .mockResolvedValueOnce([[{ total: 40 }]])
      .mockResolvedValueOnce([[]]);
    const res = await authed(app).get('/api/polls/3/comments');
    expect(res.body.comments).toHaveLength(20);
    expect(res.body.nextCursor).toBe(81);
  });

  it('uses the cursor as a bound parameter', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 3 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);
    await authed(app).get('/api/polls/3/comments?before=81');
    expect(pool.execute.mock.calls[1][1]).toEqual([3, 81]);
  });

  it.each(['abc', '0', '1 OR 1=1'])('rejects a bad cursor "%s"', async (before) => {
    const res = await authed(app).get(`/api/polls/3/comments?before=${encodeURIComponent(before)}`);
    expect(res.status).toBe(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it('404s for an unknown poll and 401s without a token', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    expect((await authed(app).get('/api/polls/99/comments')).status).toBe(404);
    expect((await request(app).get('/api/polls/3/comments')).status).toBe(401);
  });
});

describe('POST /api/polls/:id/comments', () => {
  it('creates a top-level comment for the logged-in user', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 3 }]])
      .mockResolvedValueOnce([{ insertId: 50 }])
      .mockResolvedValueOnce([[crow(50, null, 7)]]);
    const res = await authed(app, tokenFor(7, 'user7')).post('/api/polls/3/comments').send({ body: 'GG well played' });
    expect(res.status).toBe(201);
    expect(res.body.replies).toEqual([]);
    expect(pool.execute.mock.calls[1][0]).toMatch(/INSERT INTO comments/);
    expect(pool.execute.mock.calls[1][1]).toEqual([3, 7, null, 'GG well played']);
  });

  it('attaches a reply to the thread root when replying to a reply', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 3 }]])
      .mockResolvedValueOnce([[{ id: 12, parent_id: 10 }]]) // parent is itself a reply of 10
      .mockResolvedValueOnce([{ insertId: 51 }])
      .mockResolvedValueOnce([[crow(51, 10)]]);
    const res = await authed(app).post('/api/polls/3/comments').send({ body: 'agreed', parentId: 12 });
    expect(res.status).toBe(201);
    expect(pool.execute.mock.calls[2][1][2]).toBe(10);
  });

  it('404s when the parent comment is not in this poll', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 3 }]]).mockResolvedValueOnce([[]]);
    const res = await authed(app).post('/api/polls/3/comments').send({ body: 'hi', parentId: 999 });
    expect(res.status).toBe(404);
  });

  it('sanitizes HTML but keeps line breaks', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 3 }]])
      .mockResolvedValueOnce([{ insertId: 52 }])
      .mockResolvedValueOnce([[crow(52)]]);
    await authed(app).post('/api/polls/3/comments').send({ body: '<img src=x onerror=alert(1)>line1\nline2' });
    expect(pool.execute.mock.calls[1][1][3]).toBe('line1\nline2');
  });

  it.each([
    ['empty', { body: '' }],
    ['whitespace only', { body: '   \n  ' }],
    ['only a tag', { body: '<b></b>' }],
    ['too long', { body: 'x'.repeat(501) }],
    ['non-string', { body: 123 }],
    ['bad parentId', { body: 'ok', parentId: 'abc' }],
  ])('rejects %s before touching the database', async (_n, payload) => {
    const res = await authed(app).post('/api/polls/3/comments').send(payload);
    expect(res.status).toBe(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it('404s for an unknown poll and 401s without a token', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    expect((await authed(app).post('/api/polls/99/comments').send({ body: 'hi' })).status).toBe(404);
    expect((await request(app).post('/api/polls/3/comments').send({ body: 'hi' })).status).toBe(401);
  });

  it('rate limits comment spam per user', async () => {
    pool.execute.mockResolvedValue([[]]);
    let last;
    for (let i = 0; i < 16; i += 1) last = await authed(app).post('/api/polls/3/comments').send({ body: 'spam' });
    expect(last.status).toBe(429);
  });
});

describe('DELETE /api/polls/:id/comments/:commentId', () => {
  it('deletes only when the comment belongs to the caller (ownership is in the WHERE clause)', async () => {
    pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = await authed(app, tokenFor(7)).delete('/api/polls/3/comments/50');
    expect(res.status).toBe(204);
    expect(pool.execute.mock.calls[0][0]).toMatch(/WHERE id = \? AND poll_id = \? AND user_id = \?/);
    expect(pool.execute.mock.calls[0][1]).toEqual([50, 3, 7]);
  });
  it('404s when it is not the caller\'s comment', async () => {
    pool.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);
    expect((await authed(app).delete('/api/polls/3/comments/50')).status).toBe(404);
  });
  it('400s for bad ids, 401s without token', async () => {
    expect((await authed(app).delete('/api/polls/3/comments/abc')).status).toBe(400);
    expect((await request(app).delete('/api/polls/3/comments/5')).status).toBe(401);
  });
});
