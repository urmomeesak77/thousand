'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const RateLimiter = require('../src/utils/RateLimiter');

describe('RateLimiter', () => {
  it('allows requests within the limit', () => {
    const rl = new RateLimiter(10000, 3);
    assert.ok(rl.isAllowed('a'));
    assert.ok(rl.isAllowed('a'));
    assert.ok(rl.isAllowed('a'));
  });

  it('returns false when limit exceeded', () => {
    const rl = new RateLimiter(10000, 2);
    rl.isAllowed('x');
    rl.isAllowed('x');
    assert.equal(rl.isAllowed('x'), false);
  });

  it('cleanup removes expired entries', () => {
    const rl = new RateLimiter(1, 10);
    rl.isAllowed('z');
    return new Promise((resolve) => setTimeout(() => {
      rl.cleanup();
      assert.equal(rl._counts.has('z'), false, 'expired entry removed');
      resolve();
    }, 10));
  });
});
