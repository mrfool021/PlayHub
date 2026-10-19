'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { requestLogger } = require('./middleware/logger');
const { createRequireAuth, createOptionalAuth } = require('./middleware/auth');
const { createPollsRouter } = require('./routes/polls');
const { createAuthRouter } = require('./routes/auth');
const { createSearchRouter } = require('./routes/search');
const { createUsersRouter } = require('./routes/users');
const { createCommentsRouter } = require('./routes/comments');
const { DEFAULT_LIMITS } = require('./images');

/**
 * App factory. The database pool is injected so tests can pass a mock and
 * run without a real MySQL server.
 */
function createApp(pool, config = {}) {
  const {
    corsOrigins = ['http://localhost:5173', 'http://localhost:4173'],
    enforceOneVote = true,
    voterSalt = 'dev-only-salt',
    rateLimitMax = 600, // avatars/photos are separate requests, so allow more than a text-only API
    pollImageMaxBytes = DEFAULT_LIMITS.pollImageMaxBytes,
    avatarMaxBytes = DEFAULT_LIMITS.avatarMaxBytes,
    jwtSecret = 'dev-only-jwt-secret', // server.js makes the real one mandatory
    jwtExpiresIn = '7d',
    bcryptCost = 12,
    authRateLimit = 10,
    logRequests = process.env.NODE_ENV !== 'test', // jest sets NODE_ENV=test: keep test output quiet
    trustProxyHops = 0,
  } = config;

  const app = express();
  app.disable('x-powered-by');
  if (trustProxyHops) app.set('trust proxy', trustProxyHops);

  // ---- Middleware: registered BEFORE any route, in this order ---------------
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // images are fetched from the Vite origin
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || corsOrigins.includes(origin));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    })
  );
  // Images travel as base64 inside the JSON body (create poll, set avatar), so the
  // limit is derived from the largest allowed image (+33% base64 overhead).
  const bodyLimit = Math.ceil((Math.max(pollImageMaxBytes, avatarMaxBytes) * 4) / 3) + 16 * 1024;
  app.use(express.json({ limit: bodyLimit }));
  if (logRequests) app.use(requestLogger);

  const requireAuth = createRequireAuth(jwtSecret);
  const optionalAuth = createOptionalAuth(jwtSecret);

  // ---- Routes -----------------------------------------------------------------
  // Liveness probe for uptime monitors
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
    })
  );

  app.use('/api/auth', createAuthRouter(pool, { jwtSecret, jwtExpiresIn, bcryptCost, authRateLimit }));
  // Mounted before /api/polls so ".../:id/comments" is not swallowed by the polls router
  app.use('/api/polls/:id/comments', createCommentsRouter(pool, { requireAuth }));
  app.use(
    '/api/polls',
    createPollsRouter(pool, { enforceOneVote, voterSalt, requireAuth, optionalAuth, pollImageMaxBytes })
  );
  app.use('/api/search', createSearchRouter(pool, { requireAuth }));
  app.use('/api/users', createUsersRouter(pool, { requireAuth, avatarMaxBytes }));

  // ---- 404 + central error handler ---------------------------------------------
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large (images must be compressed).' });
    }
    console.error('Unhandled error:', err);
    // Never leak internals (stack traces, SQL messages) to clients
    return res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

module.exports = { createApp };
