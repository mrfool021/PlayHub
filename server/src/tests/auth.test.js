'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createApp } = require('../app');
const { signToken } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../validation');

const JWT_SECRET = 'test-jwt-secret-test-jwt-secret-1234';

let pool;
let app;

beforeEach(() => {
  pool = { execute: jest.fn(), getConnection: jest.fn() };
  app = createApp(pool, {
    jwtSecret: JWT_SECRET,
    jwtExpiresIn: '1h',
    bcryptCost: 4, // fast hashing in tests; production default is 12
    authRateLimit: 1000,
  });
});

const validUser = { username: 'player_one', email: 'Player@Example.com', password: 'correct horse battery' };

// ---------------------------------------------------------------------------
describe('POST /api/auth/register', () => {
  it('creates a user, stores a bcrypt hash and returns a token', async () => {
    pool.execute.mockResolvedValueOnce([{ insertId: 5 }]);

    const res = await request(app).post('/api/auth/register').send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ id: 5, username: 'player_one', email: 'player@example.com', avatarUrl: null });

    const payload = jwt.verify(res.body.token, JWT_SECRET);
    expect(payload.sub).toBe('5');

    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toBe('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
    expect(params[0]).toBe('player_one');
    expect(params[1]).toBe('player@example.com'); // email is normalised to lower case
    expect(params[2]).not.toBe(validUser.password); // never stored in plain text
    expect(await bcrypt.compare(validUser.password, params[2])).toBe(true);
  });

  it('never returns the password hash', async () => {
    pool.execute.mockResolvedValueOnce([{ insertId: 5 }]);
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('returns 409 when the username or email already exists', async () => {
    pool.execute.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(409);
  });

  it.each([
    ['short username', { ...validUser, username: 'ab' }],
    ['username with spaces', { ...validUser, username: 'bad name' }],
    ['username with HTML', { ...validUser, username: '<b>hacker</b>' }],
    ['invalid email', { ...validUser, email: 'not-an-email' }],
    ['short password', { ...validUser, password: 'short' }],
    ['password over 72 bytes', { ...validUser, password: 'x'.repeat(73) }],
    ['non-string password', { ...validUser, password: 12345678 }],
    ['missing fields', {}],
  ])('rejects invalid input (%s) before touching the database', async (_n, body) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed.');
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it('returns a generic 500 and no SQL details on unexpected errors', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    pool.execute.mockRejectedValueOnce(new Error('secret SQL details'));
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
  let storedHash;
  beforeAll(async () => {
    storedHash = await bcrypt.hash('correct horse battery', 4);
  });

  const dbRow = () => ({ id: 9, username: 'player_one', email: 'player@example.com', password_hash: storedHash });

  it('logs in with the right password and returns a token', async () => {
    pool.execute.mockResolvedValueOnce([[dbRow()]]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'player@example.com', password: 'correct horse battery' });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 9, username: 'player_one', email: 'player@example.com', avatarUrl: null });
    expect(jwt.verify(res.body.token, JWT_SECRET).sub).toBe('9');
  });

  it('accepts a username as the identifier', async () => {
    pool.execute.mockResolvedValueOnce([[dbRow()]]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'player_one', password: 'correct horse battery' });
    expect(res.status).toBe(200);
    expect(pool.execute.mock.calls[0][1]).toEqual(['player_one', 'player_one']);
  });

  it('returns the same 401 message for a wrong password and an unknown user', async () => {
    pool.execute.mockResolvedValueOnce([[dbRow()]]);
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'player_one', password: 'wrong password!' });

    pool.execute.mockResolvedValueOnce([[]]);
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'ghost', password: 'whatever123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownUser.body.error);
  });

  it('rejects a missing or non-string body with 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: { $ne: '' }, password: 'x' });
    expect(res.status).toBe(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it('rate limits repeated attempts', async () => {
    const strict = createApp(pool, { jwtSecret: JWT_SECRET, bcryptCost: 4, authRateLimit: 2 });
    pool.execute.mockResolvedValue([[]]);
    const body = { identifier: 'ghost', password: 'whatever123' };
    await request(strict).post('/api/auth/login').send(body);
    await request(strict).post('/api/auth/login').send(body);
    const res = await request(strict).post('/api/auth/login').send(body);
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/auth/me and token checks', () => {
  const token = (opts = {}) =>
    signToken({ id: 3, username: 'player_one' }, { jwtSecret: JWT_SECRET, jwtExpiresIn: '1h', ...opts });

  it('returns the current user for a valid token', async () => {
    pool.execute.mockResolvedValueOnce([
      [{ id: 3, username: 'player_one', email: 'p@example.com', created_at: '2026-10-06T00:00:00.000Z' }],
    ]);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 3, username: 'player_one' });
    expect(pool.execute.mock.calls[0][1]).toEqual([3]);
  });

  it('returns 401 when the user no longer exists', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it('returns 401 for a token signed with a different secret', async () => {
    const forged = jwt.sign({ username: 'x' }, 'some-other-secret-some-other-secret!', { subject: '3' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign({ username: 'x' }, JWT_SECRET, { subject: '3', expiresIn: -10 });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an unsigned "alg: none" token', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '3', username: 'x' })}.`;
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${none}`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('avatar in auth responses', () => {
  it('login returns the uploaded-avatar URL with a cache-busting version', async () => {
    const hash = await bcrypt.hash('correct horse battery', 4);
    pool.execute.mockResolvedValueOnce([
      [{ id: 9, username: 'p', email: 'p@e.co', password_hash: hash, avatar_url: null, avatar_ver: 'abc123' }],
    ]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'p', password: 'correct horse battery' });
    expect(res.body.user.avatarUrl).toBe('/api/users/9/avatar?v=abc123');
  });

  it('login returns an external avatar URL when no upload exists', async () => {
    const hash = await bcrypt.hash('correct horse battery', 4);
    pool.execute.mockResolvedValueOnce([
      [{ id: 9, username: 'p', email: 'p@e.co', password_hash: hash, avatar_url: 'https://x.io/a.png', avatar_ver: null }],
    ]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'p', password: 'correct horse battery' });
    expect(res.body.user.avatarUrl).toBe('https://x.io/a.png');
  });
});

// ---------------------------------------------------------------------------
describe('auth validation helpers', () => {
  it('validateRegister trims and lower-cases the email', () => {
    const r = validateRegister({ username: ' abc ', email: ' A@B.CO ', password: '12345678' });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ username: 'abc', email: 'a@b.co', password: '12345678' });
  });

  it('validateLogin requires both fields', () => {
    expect(validateLogin({ identifier: 'a' }).ok).toBe(false);
    expect(validateLogin({ identifier: 'a', password: 'b' }).ok).toBe(true);
  });
});
