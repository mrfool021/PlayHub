'use strict';

const express = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { createSearchController, likePattern } = require('../controllers/searchController');

function createSearchRouter(pool, { requireAuth }) {
  const router = express.Router();
  const c = createSearchController(pool);
  router.use(requireAuth);
  router.get('/', asyncHandler(c.search));
  return router;
}

module.exports = { createSearchRouter, likePattern };
