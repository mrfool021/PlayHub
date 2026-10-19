'use strict';

const { required } = require('./config/env'); // loads .env first
const { createPool } = require('./config/db');
const { createApp } = require('./app');

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long.');
  process.exit(1);
}

const pool = createPool();

const app = createApp(pool, {
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  enforceOneVote: (process.env.ENFORCE_ONE_VOTE || 'true') !== 'false',
  voterSalt: required('VOTER_SALT'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  pollImageMaxBytes: Number(process.env.POLL_IMAGE_MAX_BYTES) || undefined,
  avatarMaxBytes: Number(process.env.AVATAR_MAX_BYTES) || undefined,
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || undefined,
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS) || 0,
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`PlayHub API listening on http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
