'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../lib/asyncHandler');
const { createRequireAuth } = require('../middleware/auth');
const { createAuthController } = require('../controllers/authController');

function createAuthRouter(pool, { jwtSecret, jwtExpiresIn, bcryptCost, authRateLimit = 10 }) {
  const router = express.Router();
  const requireAuth = createRequireAuth(jwtSecret);
  const c = createAuthController(pool, { jwtSecret, jwtExpiresIn, bcryptCost });

  // Stricter than the global limiter: slows down password guessing
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: authRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again in a minute.' },
  });

  router.post('/register', authLimiter, asyncHandler(c.register));
  router.post('/login', authLimiter, asyncHandler(c.login));
  router.get('/me', requireAuth, asyncHandler(c.me));

  return router;
}

module.exports = { createAuthRouter };
