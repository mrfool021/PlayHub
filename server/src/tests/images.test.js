'use strict';

const request = require('supertest');
const { createApp } = require('../app');
const { parseImageDataUrl } = require('../images');
const { JWT_SECRET, tokenFor, makePool, authed, PNG_URL, JPEG_URL, dataUrl } = require('./helpers');

let pool;
let app;
beforeEach(() => {
  pool = makePool();
  app = createApp(pool, { jwtSecret: JWT_SECRET, pollImageMaxBytes: 4096, avatarMaxBytes: 2048 });
});

const row = (id, optionId, label) => ({
  id, question: 'Best map?', is_active: 1, created_at: 'd', created_by: 1, creator: 'tester',
  creator_avatar_url: null, creator_avatar_ver: null, has_image: 1, comment_count: 0,
  option_id: optionId, label, votes: 0,
});

describe('parseImageDataUrl', () => {
  it('accepts a valid PNG and JPEG data URL', () => {
    expect(parseImageDataUrl(PNG_URL, 4096)).toMatchObject({ ok: true, mime: 'image/png' });
    expect(parseImageDataUrl(JPEG_URL, 4096)).toMatchObject({ ok: true, mime: 'image/jpeg' });
  });

  it.each([
    ['SVG (script carrier)', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['HTML disguised as PNG', dataUrl('image/png', Buffer.from('<html><script>alert(1)</script></html>'))],
    ['JPEG bytes declared as PNG', dataUrl('image/png', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(30)]))],
    ['not base64', 'data:image/png;base64,@@@@'],
    ['no data-URL header', 'AAAA'],
    ['plain http URL', 'http://example.com/a.png'],
    ['number', 12345],
    ['empty', ''],
  ])('rejects %s', (_n, value) => {
    expect(parseImageDataUrl(value, 4096).ok).toBe(false);
  });

  it('rejects images over the size cap', () => {
    const big = dataUrl('image/png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(5000)]));
    expect(parseImageDataUrl(big, 4096).ok).toBe(false);
  });
});

describe('POST /api/polls with an image', () => {
  it('stores the photo in the same transaction as the poll and its options', async () => {
    pool.conn.execute.mockResolvedValueOnce([{ insertId: 7 }]).mockResolvedValue([{ insertId: 1 }]);
    pool.execute.mockResolvedValueOnce([[row(7, 1, 'A'), row(7, 2, 'B')]]);

    const res = await authed(app).post('/api/polls').send({ question: 'Best map?', options: ['A', 'B'], image: PNG_URL });

    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toBe('/api/polls/7/image');
    const calls = pool.conn.execute.mock.calls;
    expect(calls).toHaveLength(4); // poll, 2 options, image
    expect(calls[3][0]).toMatch(/INSERT INTO poll_images/);
    expect(calls[3][1][0]).toBe(7);
    expect(calls[3][1][1]).toBe('image/png');
    expect(Buffer.isBuffer(calls[3][1][2])).toBe(true);
    expect(pool.conn.commit).toHaveBeenCalledTimes(1);
  });

  it('works without an image (image is optional)', async () => {
    pool.conn.execute.mockResolvedValueOnce([{ insertId: 8 }]).mockResolvedValue([{ insertId: 1 }]);
    pool.execute.mockResolvedValueOnce([[{ ...row(8, 1, 'A'), has_image: 0 }, { ...row(8, 2, 'B'), has_image: 0 }]]);
    const res = await authed(app).post('/api/polls').send({ question: 'Best map?', options: ['A', 'B'] });
    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toBeNull();
    expect(pool.conn.execute).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['image with NO question', { image: PNG_URL, options: ['A', 'B'] }],
    ['image with NO options', { image: PNG_URL, question: 'Best map?' }],
    ['image with only ONE option', { image: PNG_URL, question: 'Best map?', options: ['A'] }],
    ['image with a too-short question', { image: PNG_URL, question: 'Hi', options: ['A', 'B'] }],
    ['image ONLY (standalone photo)', { image: PNG_URL }],
  ])('refuses a standalone photo: %s -> 400 and NOTHING is written', async (_n, payload) => {
    const res = await authed(app).post('/api/polls').send(payload);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toMatch(/image/i);
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it('rejects a poll whose image is invalid (nothing is written)', async () => {
    const res = await authed(app).post('/api/polls').send({
      question: 'Best map?', options: ['A', 'B'], image: dataUrl('image/png', Buffer.from('not an image at all!!')),
    });
    expect(res.status).toBe(400);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('rolls back the poll when the image insert fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    pool.conn.execute
      .mockResolvedValueOnce([{ insertId: 7 }])
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([{ insertId: 2 }])
      .mockRejectedValueOnce(new Error('disk full'));
    const res = await authed(app).post('/api/polls').send({ question: 'Best map?', options: ['A', 'B'], image: PNG_URL });
    expect(res.status).toBe(500);
    expect(pool.conn.rollback).toHaveBeenCalledTimes(1);
    expect(pool.conn.commit).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('answers 401 and stores nothing when there is no token', async () => {
    const res = await request(app).post('/api/polls').send({ question: 'Best map?', options: ['A', 'B'], image: PNG_URL });
    expect(res.status).toBe(401);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('rejects a body above the image limit with 413', async () => {
    const res = await authed(app).post('/api/polls').send({ question: 'Best map?', options: ['A', 'B'], image: 'A'.repeat(40000) });
    expect(res.status).toBe(413);
  });

  it('has no endpoint to attach an image to an existing poll', async () => {
    for (const [method, url] of [['post', '/api/polls/1/image'], ['put', '/api/polls/1/image'], ['post', '/api/images']]) {
      const res = await authed(app)[method](url).send({ image: PNG_URL });
      expect([404, 400]).toContain(res.status);
      expect(pool.conn.execute).not.toHaveBeenCalled();
    }
  });
});

describe('GET /api/polls/:id/image', () => {
  it('serves the stored bytes with the right type and hardened headers', async () => {
    pool.execute.mockResolvedValueOnce([[{ mime: 'image/png', data: Buffer.from([1, 2, 3]) }]]);
    const res = await authed(app).get('/api/polls/7/image');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['content-security-policy']).toMatch(/sandbox/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  it('404s when there is no image (poll photos are public, like the polls themselves)', async () => {
    pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
    expect((await authed(app).get('/api/polls/7/image')).status).toBe(404);
    expect((await request(app).get('/api/polls/7/image')).status).toBe(404);
  });
});

describe('poll list feed', () => {
  it('scope=following filters by the logged-in user', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    await authed(app, tokenFor(5)).get('/api/polls?scope=following');
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toMatch(/FROM follows f WHERE f\.follower_id = \?/);
    expect(params).toEqual([5]);
  });
  it('includes creator avatar and comment count', async () => {
    pool.execute.mockResolvedValueOnce([[
      { ...row(1, 1, 'A'), creator_avatar_ver: 'v9', comment_count: 4 }, row(1, 2, 'B'),
    ]]);
    const res = await authed(app).get('/api/polls');
    expect(res.body[0].creator.avatarUrl).toBe('/api/users/1/avatar?v=v9');
    expect(res.body[0].commentCount).toBe(4);
  });
});
