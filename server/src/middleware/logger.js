'use strict';

/**
 * Custom request logger (registered in app.js BEFORE the routes).
 * Prints one line per request once the response has finished:
 *   2026-10-11T08:00:00.000Z GET /api/polls 200 12ms
 * Query strings are not logged (they can contain search text).
 */
function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const path = req.originalUrl.split('?')[0];
    console.log(`${new Date().toISOString()} ${req.method} ${path} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });
  next();
}

module.exports = { requestLogger };
