'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../lib/asyncHandler');
const { createUsersController, avatarUrlFor, FOLLOW_PAGE_SIZE } = require('../controllers/usersController');

function createUsersRouter(pool, { requireAuth, avatarMaxBytes }) {
  const router = express.Router();
  const c = createUsersController(pool, { avatarMaxBytes });

  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    keyGenerator: (req) => `user:${req.user.id}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many changes, please slow down.' },
  });

  router.use(requireAuth);
  router.get('/:id/avatar', asyncHandler(c.getAvatar));
  // '/me/avatar' is declared BEFORE '/:id' so "me" is never parsed as an id
  router.put('/me/avatar', writeLimiter, asyncHandler(c.setAvatar));
  router.delete('/me/avatar', writeLimiter, asyncHandler(c.removeAvatar));
  router.get('/:id', asyncHandler(c.getProfile));
  router.post('/:id/follow', writeLimiter, asyncHandler(c.followUser));
  router.delete('/:id/follow', writeLimiter, asyncHandler(c.unfollowUser));
  router.get('/:id/followers', asyncHandler(c.listFollowers));
  router.get('/:id/following', asyncHandler(c.listFollowing));

  return router;
}

module.exports = { createUsersRouter, avatarUrlFor, FOLLOW_PAGE_SIZE };
