'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { createPollsController } = require('../controllers/pollsController');

/**
 * /api/polls
 *   GET    /              list polls            (public)
 *   GET    /:id           one poll              (public)
 *   GET    /:id/image     poll photo            (public)
 *   POST   /              create a poll         (login required)
 *   DELETE /:id           delete your own poll  (login required)
 *   POST   /:id/vote      vote                  (login required)
 */
function createPollsRouter(pool, { enforceOneVote, voterSalt, requireAuth, optionalAuth, pollImageMaxBytes }) {
  const router = express.Router();
  const c = createPollsController(pool, { enforceOneVote, voterSalt, pollImageMaxBytes });

  const voteLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many votes from this address, please slow down.' },
  });
  const createLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    keyGenerator: (req) => `user:${req.user.id}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'You are posting too fast, please wait a moment.' },
  });

  router.get('/', optionalAuth, c.listPolls);
  router.get('/:id/image', c.getPollImage);
  router.get('/:id', c.getPollById);
  router.post('/', requireAuth, createLimiter, c.createPoll);
  router.delete('/:id', requireAuth, c.deletePoll);
  router.post('/:id/vote', requireAuth, voteLimiter, c.votePoll);

  return router;
}

module.exports = { createPollsRouter };
