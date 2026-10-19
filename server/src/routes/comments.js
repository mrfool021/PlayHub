'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../lib/asyncHandler');
const { createCommentsController, PAGE_SIZE } = require('../controllers/commentsController');

/** Mounted at /api/polls/:id/comments (login required) */
function createCommentsRouter(pool, { requireAuth }) {
  const router = express.Router({ mergeParams: true });
  const c = createCommentsController(pool);

  const postLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 15,
    keyGenerator: (req) => `user:${req.user.id}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'You are commenting too fast, please wait a moment.' },
  });

  router.use(requireAuth);
  router.get('/', asyncHandler(c.listComments));
  router.post('/', postLimiter, asyncHandler(c.addComment));
  router.delete('/:commentId', asyncHandler(c.deleteComment));

  return router;
}

module.exports = { createCommentsRouter, PAGE_SIZE };
