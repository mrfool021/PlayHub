'use strict';

const request = require('supertest');
const { createApp } = require('../app');
const { signToken } = require('../middleware/auth');
const { likePattern } = require('../routes/search');

const JWT_SECRET = 'test-jwt-secret-test-jwt-secret-1234';
const AUTH = `Bearer ${signToken(
  { id: 1, username: 'tester' },
  { jwtSecret: JWT_SECRET, jwtExpiresIn: '1h' }
)}`;

let pool;
let app;

beforeEach(() => {
  pool = { execute: jest.fn(), getConnection: jest.fn() };
  app = createApp(pool, { jwtSecret: JWT_SECRET });
});

const get = (url) => request(app).get(url).set('Authorization', AUTH);

// ---------------------------------------------------------------------------
describe('GET /api/search', () => {
  it('returns matching polls and public profiles', async () => {
    pool.execute
      .mockResolvedValueOnce([
        [{ id: 4, question: 'Best game ever?', created_at: 'd1', created_by: 2, creator: 'ivan' }],
      ])
      .mockResolvedValueOnce([[{ id: 2, username: 'ivan', created_at: 'd2' }]]);

    const res = await get('/api/search?q=iv');

    expect(res.status).toBe(200);
    expect(res.body.polls).toEqual([
      {
        id: 4,
        question: 'Best game ever?',
        createdAt: 'd1',
        imageUrl: null,
        creator: { id: 2, username: 'ivan', avatarUrl: null },
      },
    ]);
    expect(res.body.users).toEqual([{ id: 2, username: 'ivan', avatarUrl: null, createdAt: 'd2' }]);
  });

  it('never exposes email or password hash', async () => {
    pool.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 2, username: 'ivan', created_at: 'd', email: 'x@y.z', password_hash: 'h' }]]);
    const res = await get('/api/search?q=ivan');
    expect(JSON.stringify(res.body)).not.toMatch(/email|password|x@y\.z/);
  });

  it('passes the text only as a bound parameter, with wildcards escaped', async () => {
    pool.execute.mockResolvedValue([[]]);
    await get(`/api/search?q=${encodeURIComponent("100%_'; DROP TABLE users;--")}`);

    for (const [sql, params] of pool.execute.mock.calls) {
      expect(sql).not.toMatch(/DROP/i);
      expect(params).toHaveLength(1);
      expect(params[0]).toMatch(/^%100\\%\\_/); // % and _ are escaped
    }
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/search?q=ivan');
    expect(res.status).toBe(401);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', '/api/search'],
    ['too short', '/api/search?q=a'],
    ['too long', `/api/search?q=${'x'.repeat(51)}`],
    ['array value', '/api/search?q[]=ab&q[]=cd'],
    ['object value', '/api/search?q[$ne]=ab'],
  ])('rejects a %s query with 400 before touching the database', async (_n, url) => {
    const res = await get(url);
    expect(res.status).toBe(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (profile, avatar and follow tests live in users.test.js)

// ---------------------------------------------------------------------------
describe('likePattern', () => {
  it('escapes LIKE wildcards and wraps the text', () => {
    expect(likePattern('a%b_c\\d')).toBe('%a\\%b\\_c\\\\d%');
    expect(likePattern('plain')).toBe('%plain%');
  });
});
