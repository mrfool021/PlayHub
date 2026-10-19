'use strict';

/** Express 4 does not catch rejected promises: forward them to the error middleware. */
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

module.exports = { asyncHandler };
