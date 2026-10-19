'use strict';

const request = require('supertest');
const { createApp } = require('../app');
const { requestLogger } = require('../middleware/logger');
const { JWT_SECRET, makePool } = require('./helpers');

// the 'finish' event can fire a moment after supertest has the response
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('request logger middleware', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it('logs method, path, status code and duration once the response is finished', async () => {
    const app = createApp(makePool(), { jwtSecret: JWT_SECRET, logRequests: true });
    await request(app).get('/health');
    await flush();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z GET \/health 200 \d+ms$/);
  });

  it('does not write the query string to the log', async () => {
    const app = createApp(makePool(), { jwtSecret: JWT_SECRET, logRequests: true });
    await request(app).get('/api/nothing-here?secret=1');
    await flush();
    expect(logSpy.mock.calls[0][0]).toMatch(/GET \/api\/nothing-here 404/);
    expect(logSpy.mock.calls[0][0]).not.toMatch(/secret/);
  });

  it('calls next() so the request continues to the routes', () => {
    const next = jest.fn();
    requestLogger({ method: 'GET', originalUrl: '/x' }, { on: jest.fn() }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
