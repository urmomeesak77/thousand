'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { stackedDeckForTest } = require('../src/services/testDeckStacking');

// The deck-stacking seam is a card-cheat if it ever runs in production. It is
// gated on THOUSAND_STACK_DECK, but must also stay inert when NODE_ENV is
// 'production' even if the env var is somehow set.
const savedStack = process.env.THOUSAND_STACK_DECK;
const savedNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  if (savedStack === undefined) { delete process.env.THOUSAND_STACK_DECK; }
  else { process.env.THOUSAND_STACK_DECK = savedStack; }
  if (savedNodeEnv === undefined) { delete process.env.NODE_ENV; }
  else { process.env.NODE_ENV = savedNodeEnv; }
});

describe('testDeckStacking seam — production safety', () => {
  it('returns null when the env var is unset', () => {
    delete process.env.THOUSAND_STACK_DECK;
    assert.equal(stackedDeckForTest(3), null);
  });

  it('stacks the deck when the env var is set outside production', () => {
    delete process.env.NODE_ENV;
    process.env.THOUSAND_STACK_DECK = 'four-nines';
    const deck = stackedDeckForTest(3);
    assert.ok(Array.isArray(deck), 'seam is active outside production');
  });

  it('stays inert in production even when the env var is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.THOUSAND_STACK_DECK = 'four-nines';
    assert.equal(stackedDeckForTest(3), null);
  });
});
