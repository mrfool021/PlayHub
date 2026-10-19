'use strict';
// Shared helpers for the feature tests (not a test file itself: it does not match *.test.js)
const request = require('supertest');
const { signToken } = require('../middleware/auth');

const JWT_SECRET = 'test-jwt-secret-test-jwt-secret-1234';

const tokenFor = (id = 1, username = 'tester') =>
  `Bearer ${signToken({ id, username }, { jwtSecret: JWT_SECRET, jwtExpiresIn: '1h' })}`;

function makePool() {
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    execute: jest.fn().mockResolvedValue([{ insertId: 1 }]),
  };
  return { execute: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn), conn };
}

const authed = (app, auth = tokenFor()) => ({
  get: (u) => request(app).get(u).set('Authorization', auth),
  post: (u) => request(app).post(u).set('Authorization', auth),
  put: (u) => request(app).put(u).set('Authorization', auth),
  delete: (u) => request(app).delete(u).set('Authorization', auth),
});

// Smallest byte sequences that carry the right file signatures
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 1),
]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const dataUrl = (mime, bytes) => `data:${mime};base64,${bytes.toString('base64')}`;
const PNG_URL = dataUrl('image/png', PNG_BYTES);
const JPEG_URL = dataUrl('image/jpeg', JPEG_BYTES);

module.exports = { JWT_SECRET, tokenFor, makePool, authed, PNG_BYTES, PNG_URL, JPEG_URL, dataUrl };
