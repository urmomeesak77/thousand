'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Requiring the server module does not start it (it only listens under
// require.main === module). We test the exported origin-check predicate directly.
const { isOriginAllowed } = require('../src/server');

// ALLOWED_ORIGINS is read at module load; the suite runs with it unset, so these
// cases exercise the "no explicit allowlist" branch.
const savedNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  if (savedNodeEnv === undefined) { delete process.env.NODE_ENV; }
  else { process.env.NODE_ENV = savedNodeEnv; }
});

const reqWith = (origin, host = 'thousand.example') => ({ headers: { origin, host } });

describe('isOriginAllowed — no explicit ALLOWED_ORIGINS', () => {
  it('allows any origin outside production (dev/test/curl convenience)', () => {
    delete process.env.NODE_ENV;
    assert.equal(isOriginAllowed(reqWith('https://evil.example')), true);
  });

  it('blocks a foreign browser origin in production', () => {
    process.env.NODE_ENV = 'production';
    assert.equal(isOriginAllowed(reqWith('https://evil.example')), false);
  });

  it('allows the app\'s own same-origin frontend in production', () => {
    process.env.NODE_ENV = 'production';
    assert.equal(isOriginAllowed(reqWith('https://thousand.example')), true);
  });

  it('allows same-origin including a matching non-default port in production', () => {
    process.env.NODE_ENV = 'production';
    assert.equal(isOriginAllowed(reqWith('http://localhost:3000', 'localhost:3000')), true);
  });

  it('allows non-browser clients with no Origin header in production', () => {
    process.env.NODE_ENV = 'production';
    assert.equal(isOriginAllowed(reqWith(undefined)), true);
  });

  it('blocks a malformed Origin header in production', () => {
    process.env.NODE_ENV = 'production';
    assert.equal(isOriginAllowed(reqWith('not a url')), false);
  });
});
