'use strict';

const request = require('supertest');
const { createApp } = require('../app');
const { sanitizeText, parseId } = require('../validation');
const { signToken } = require('../middleware/auth');

const JWT_SECRET = 'test-jwt-secret-test-jwt-secret-1234';
// Reads (GET /api/polls, GET /api/polls/:id) are public; writes need a logged-in user,
// so these tests send a valid token
const AUTH = `Bearer ${signToken(
  { id: 1, username: 'tester' },
  { jwtSecret: JWT_SECRET, jwtExpiresIn: '1h' }
)}`;

/** supertest wrapper that adds the Authorization header to every request */
const authed = (target) => ({
  get: (url) => request(target).get(url).set('Authorization', AUTH),
  post: (url) => request(target).post(url).set('Authorization', AUTH),
  delete: (url) => request(target).delete(url).set('Authorization', AUTH),
});

// ---------------------------------------------------------------------------
// Test helpers: a fake mysql2 pool, so no database is needed (CI-friendly).
// ---------------------------------------------------------------------------
function makePool() {
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    execute: jest.fn(),
  };
  return {
    execute: jest.fn(),
    getConnection: jest.fn().mockResolvedValue(conn),
    conn,
  };
}

const row = (pollId, question, optionId, label, votes) => ({
  id: pollId,
  question,
  is_active: 1,
  created_at: '2026-10-05T00:00:00.000Z',
  option_id: optionId,
  label,
  votes,
});

const POLL_ROWS = [
  row(1, 'Favorite language?', 10, 'JavaScript', 3),
  row(1, 'Favorite language?', 11, 'Python', 5),
];

let pool;
let app;

beforeEach(() => {
  pool = makePool();
  app = createApp(pool, {
    corsOrigins: ['http://localhost:8080'],
    enforceOneVote: true,
    voterSalt: 'test-salt',
    jwtSecret: JWT_SECRET,
  });
});

// ---------------------------------------------------------------------------
describe('GET /health', () => {
  it('returns 200 OK', async () => {
    const res = await authed(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/polls', () => {
  it('returns active polls with option vote counts and totals', async () => {
    pool.execute.mockResolvedValueOnce([POLL_ROWS]);

    const res = await authed(app).get('/api/polls');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: 1,
      question: 'Favorite language?',
      totalVotes: 8,
      options: [
        { id: 10, label: 'JavaScript', votes: 3 },
        { id: 11, label: 'Python', votes: 5 },
      ],
    });
    expect(pool.execute.mock.calls[0][0]).toMatch(/p\.is_active = 1/);
  });

  it('returns an empty array when there are no polls', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    const res = await authed(app).get('/api/polls');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/polls/:id', () => {
  it('returns a single poll', async () => {
    pool.execute.mockResolvedValueOnce([POLL_ROWS]);
    const res = await authed(app).get('/api/polls/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE p.id = ?'), [1]);
  });

  it('returns 404 when the poll does not exist', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    const res = await authed(app).get('/api/polls/999');
    expect(res.status).toBe(404);
  });

  it.each(['abc', '0', '-1', '1.5', '1%20OR%201%3D1', '99999999999'])(
    'rejects invalid id "%s" with 400 before touching the database',
    async (badId) => {
      const res = await authed(app).get(`/api/polls/${badId}`);
      expect(res.status).toBe(400);
      expect(pool.execute).not.toHaveBeenCalled();
    }
  );
});

// ---------------------------------------------------------------------------
describe('who may call which poll route', () => {
  it.each([
    ['POST', '/api/polls'],
    ['DELETE', '/api/polls/1'],
    ['POST', '/api/polls/1/vote'],
  ])('%s %s returns 401 without a token and never touches the database', async (method, url) => {
    const res = await request(app)[method.toLowerCase()](url).send({});
    expect(res.status).toBe(401);
    expect(pool.execute).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('rejects an invalid token on a protected route with 401', async () => {
    const res = await request(app).post('/api/polls').set('Authorization', 'Bearer not.a.token').send({});
    expect(res.status).toBe(401);
  });

  it('serves the poll list and a single poll to anonymous visitors', async () => {
    pool.execute.mockResolvedValueOnce([POLL_ROWS]).mockResolvedValueOnce([POLL_ROWS]);
    expect((await request(app).get('/api/polls')).status).toBe(200);
    expect((await request(app).get('/api/polls/1')).status).toBe(200);
  });

  it('ignores an invalid token on the public routes instead of failing', async () => {
    pool.execute.mockResolvedValueOnce([POLL_ROWS]);
    const res = await request(app).get('/api/polls').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(200);
  });

  it('the "following" feed needs a login', async () => {
    const res = await request(app).get('/api/polls?scope=following');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('DELETE /api/polls/:id', () => {
  it('deletes your own poll and returns 200', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 5, created_by: 1 }]]) // owner check
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE
    const res = await authed(app).delete('/api/polls/5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Poll deleted.', id: 5 });
    const [sql, params] = pool.execute.mock.calls[1];
    expect(sql).toBe('DELETE FROM polls WHERE id = ? AND created_by = ?');
    expect(params).toEqual([5, 1]);
  });

  it('returns 404 when the poll does not exist', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    const res = await authed(app).delete('/api/polls/999');
    expect(res.status).toBe(404);
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  it("returns 403 for somebody else's poll and deletes nothing", async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 5, created_by: 2 }]]);
    const res = await authed(app).delete('/api/polls/5');
    expect(res.status).toBe(403);
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for an invalid id', async () => {
    const res = await authed(app).delete('/api/polls/abc');
    expect(res.status).toBe(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/polls', () => {
  it('creates a poll inside a transaction and returns 201', async () => {
    pool.conn.execute
      .mockResolvedValueOnce([{ insertId: 7 }]) // INSERT poll
      .mockResolvedValue([{ insertId: 1 }]); // INSERT options
    pool.execute.mockResolvedValueOnce([
      [row(7, 'Best editor?', 1, 'VS Code', 0), row(7, 'Best editor?', 2, 'Vim', 0)],
    ]);

    const res = await authed(app)
      .post('/api/polls')
      .send({ question: 'Best editor?', options: ['VS Code', 'Vim'] });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/api/polls/7');
    expect(res.body.id).toBe(7);
    expect(res.body.options).toHaveLength(2);
    expect(pool.conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(pool.conn.commit).toHaveBeenCalledTimes(1);
    expect(pool.conn.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and returns a generic 500 if an insert fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    pool.conn.execute
      .mockResolvedValueOnce([{ insertId: 7 }])
      .mockRejectedValueOnce(new Error('boom: secret SQL details'));

    const res = await authed(app)
      .post('/api/polls')
      .send({ question: 'Best editor?', options: ['VS Code', 'Vim'] });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error.');
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
    expect(pool.conn.rollback).toHaveBeenCalledTimes(1);
    expect(pool.conn.commit).not.toHaveBeenCalled();
    expect(pool.conn.release).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it.each([
    ['missing question', { options: ['A', 'B'] }],
    ['question too short', { question: 'Hi', options: ['A', 'B'] }],
    ['question too long', { question: 'x'.repeat(256), options: ['A', 'B'] }],
    ['only one option', { question: 'Valid question?', options: ['A'] }],
    ['options not an array', { question: 'Valid question?', options: 'A,B' }],
    ['too many options', { question: 'Valid question?', options: Array.from({ length: 11 }, (_, i) => `o${i}`) }],
    ['duplicate options (case-insensitive)', { question: 'Valid question?', options: ['Yes', 'yes'] }],
    ['blank option', { question: 'Valid question?', options: ['A', '   '] }],
    ['non-string option', { question: 'Valid question?', options: ['A', 42] }],
  ])('rejects invalid payload: %s', async (_name, payload) => {
    const res = await authed(app).post('/api/polls').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed.');
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('sanitizes HTML out of user text before storing it', async () => {
    pool.conn.execute.mockResolvedValue([{ insertId: 3 }]);
    pool.execute.mockResolvedValueOnce([[row(3, 'x', 1, 'A', 0), row(3, 'x', 2, 'B', 0)]]);

    const res = await authed(app)
      .post('/api/polls')
      .send({
        question: '<script>alert(1)</script>Favorite color?',
        options: ['<b>Red</b>', 'Blue'],
      });

    expect(res.status).toBe(201);
    const [, pollParams] = pool.conn.execute.mock.calls[0];
    expect(pollParams[0]).not.toMatch(/[<>]/);
    const [, optionParams] = pool.conn.execute.mock.calls[1];
    expect(optionParams[1]).toBe('Red');
  });

  it('keeps SQL text constant and passes hostile input only as a bound parameter', async () => {
    pool.conn.execute.mockResolvedValue([{ insertId: 4 }]);
    pool.execute.mockResolvedValueOnce([[row(4, 'x', 1, 'A', 0), row(4, 'x', 2, 'B', 0)]]);
    const hostile = "Robert'); DROP TABLE polls;-- ok?";

    const res = await authed(app)
      .post('/api/polls')
      .send({ question: hostile, options: ['A', 'B'] });

    expect(res.status).toBe(201);
    const [sql, params] = pool.conn.execute.mock.calls[0];
    expect(sql).toBe('INSERT INTO polls (question, description, category, created_by) VALUES (?, ?, ?, ?)');
    expect(sql).not.toMatch(/DROP/i);
    expect(params).toEqual([hostile, '', 'General', 1]); // 1 = the logged-in user from the token
  });

  it('stores description and category and rejects an unknown category with 400', async () => {
    pool.conn.execute.mockResolvedValue([{ insertId: 8 }]);
    pool.execute.mockResolvedValueOnce([[row(8, 'x', 1, 'A', 0), row(8, 'x', 2, 'B', 0)]]);
    const ok = await authed(app)
      .post('/api/polls')
      .send({ question: 'Best RPG?', description: 'Story matters', category: 'RPG', options: ['A', 'B'] });
    expect(ok.status).toBe(201);
    expect(pool.conn.execute.mock.calls[0][1]).toEqual(['Best RPG?', 'Story matters', 'RPG', 1]);

    const bad = await authed(app)
      .post('/api/polls')
      .send({ question: 'Best RPG?', category: 'Cooking', options: ['A', 'B'] });
    expect(bad.status).toBe(400);
    expect(bad.body.details.join(' ')).toMatch(/category/);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await authed(app)
      .post('/api/polls')
      .set('Content-Type', 'application/json')
      .send('{"question": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Malformed JSON body.');
  });

  it('rejects oversized bodies with 413', async () => {
    // The JSON limit is derived from the largest allowed image (about 2 MB by default)
    const res = await authed(app)
      .post('/api/polls/1/vote')
      .send({ optionId: 1, junk: 'x'.repeat(3_000_000) });
    expect(res.status).toBe(413);
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/polls/:id/vote', () => {
  it('records a vote and returns the updated poll', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 1 }]]) // poll is active
      .mockResolvedValueOnce([{ insertId: 1 }]) // INSERT vote
      .mockResolvedValueOnce([POLL_ROWS]); // reload poll

    const res = await authed(app).post('/api/polls/1/vote').send({ optionId: 11 });

    expect(res.status).toBe(201);
    expect(res.body.options).toHaveLength(2);

    const [voteSql, voteParams] = pool.execute.mock.calls[1];
    expect(voteSql).toMatch(/INSERT INTO votes/);
    expect(voteParams[0]).toBe(1);
    expect(voteParams[1]).toBe(11);
    expect(voteParams[2]).toMatch(/^[a-f0-9]{64}$/); // salted hash, not a raw IP
  });

  it('derives the voter hash from the account, not the IP address', async () => {
    const otherUser = `Bearer ${signToken(
      { id: 2, username: 'other' },
      { jwtSecret: JWT_SECRET, jwtExpiresIn: '1h' }
    )}`;
    const hashFor = async (auth, ip) => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([POLL_ROWS]);
      await request(app)
        .post('/api/polls/1/vote')
        .set('Authorization', auth)
        .set('X-Forwarded-For', ip)
        .send({ optionId: 10 });
      return pool.execute.mock.calls.at(-2)[1][2];
    };

    const sameUserA = await hashFor(AUTH, '1.1.1.1');
    const sameUserB = await hashFor(AUTH, '2.2.2.2');
    const differentUser = await hashFor(otherUser, '1.1.1.1');

    expect(sameUserA).toBe(sameUserB); // same account, new network: still one vote
    expect(differentUser).not.toBe(sameUserA); // another account may vote
  });

  it('stores a NULL voter hash when one-vote-per-voter is disabled', async () => {
    const open = createApp(pool, { enforceOneVote: false, jwtSecret: JWT_SECRET });
    pool.execute
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([POLL_ROWS]);

    const res = await authed(open).post('/api/polls/1/vote').send({ optionId: 10 });

    expect(res.status).toBe(201);
    expect(pool.execute.mock.calls[1][1][2]).toBeNull();
  });

  it('returns 404 for an unknown or inactive poll', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    const res = await authed(app).post('/api/polls/42/vote').send({ optionId: 1 });
    expect(res.status).toBe(404);
  });

  it('returns 409 when the voter has already voted', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));

    const res = await authed(app).post('/api/polls/1/vote').send({ optionId: 10 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already voted/i);
  });

  it('returns 400 when the option belongs to a different poll', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockRejectedValueOnce(
        Object.assign(new Error('fk'), { code: 'ER_NO_REFERENCED_ROW_2' })
      );

    const res = await authed(app).post('/api/polls/1/vote').send({ optionId: 999 });

    expect(res.status).toBe(400);
  });

  it.each([
    ['missing optionId', {}],
    ['string injection', { optionId: '1 OR 1=1' }],
    ['negative', { optionId: -3 }],
    ['float', { optionId: 1.5 }],
    ['object', { optionId: { $gt: 0 } }],
    ['array', { optionId: [1] }],
  ])('rejects invalid optionId (%s) before touching the database', async (_n, body) => {
    const res = await authed(app).post('/api/polls/1/vote').send(body);
    expect(res.status).toBe(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it('rejects an invalid poll id', async () => {
    const res = await authed(app).post('/api/polls/abc/vote').send({ optionId: 1 });
    expect(res.status).toBe(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('security headers, CORS and fallbacks', () => {
  it('sets helmet headers and hides x-powered-by', async () => {
    const res = await authed(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows a whitelisted origin', async () => {
    const res = await authed(app).get('/health').set('Origin', 'http://localhost:8080');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8080');
  });

  it('sends no CORS headers to an unknown origin', async () => {
    const res = await authed(app).get('/health').set('Origin', 'http://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await authed(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found.');
  });

  it('rate limits excessive requests', async () => {
    const limited = createApp(pool, { rateLimitMax: 2, jwtSecret: JWT_SECRET });
    pool.execute.mockResolvedValue([[]]);
    await authed(limited).get('/api/polls');
    await authed(limited).get('/api/polls');
    const res = await authed(limited).get('/api/polls');
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
describe('validation helpers', () => {
  it('sanitizeText strips tags, control characters and extra whitespace', () => {
    expect(sanitizeText('  <img src=x onerror=alert(1)>Hello\u0000   World \n')).toBe('Hello World');
    expect(sanitizeText(123)).toBe('');
  });

  it('parseId accepts only positive integers', () => {
    expect(parseId('12')).toBe(12);
    expect(parseId(12)).toBe(12);
    expect(parseId('0')).toBeNull();
    expect(parseId('012')).toBeNull();
    expect(parseId('1e3')).toBeNull();
    expect(parseId(null)).toBeNull();
    expect(parseId('4294967296')).toBeNull();
  });
});
