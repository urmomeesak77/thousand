'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const PlayerRegistry = require('../src/services/PlayerRegistry');

// findBySessionToken keeps a linear O(n) fallback scan for test fixtures that
// mutate `players` directly without going through create(). That scan must NOT
// run in production (an unauthenticated bad token would otherwise force a full
// timing-safe scan over every player). Production always populates _tokenIndex.
const savedNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  if (savedNodeEnv === undefined) { delete process.env.NODE_ENV; }
  else { process.env.NODE_ENV = savedNodeEnv; }
});

// A player inserted directly into the Map (no create()), so it is absent from
// _tokenIndex and only reachable via the linear fallback.
function withFixturePlayer(registry, token) {
  registry.players.set('fixture', {
    id: 'fixture', nickname: null, gameId: null, ws: null, sessionToken: token,
  });
}

describe('PlayerRegistry.findBySessionToken — linear fallback', () => {
  it('finds a directly-inserted fixture player outside production', () => {
    delete process.env.NODE_ENV;
    const registry = new PlayerRegistry();
    withFixturePlayer(registry, 'fixture-token');
    assert.equal(registry.findBySessionToken('fixture-token')?.id, 'fixture');
  });

  it('skips the linear fallback in production (index-only lookup)', () => {
    process.env.NODE_ENV = 'production';
    const registry = new PlayerRegistry();
    withFixturePlayer(registry, 'fixture-token');
    // Not in _tokenIndex → must not be found once the fallback is disabled.
    assert.equal(registry.findBySessionToken('fixture-token'), null);
  });

  it('still resolves index-backed tokens in production', () => {
    process.env.NODE_ENV = 'production';
    const registry = new PlayerRegistry();
    const { sessionToken, playerId } = registry.create({}, '127.0.0.1');
    assert.equal(registry.findBySessionToken(sessionToken)?.id, playerId);
  });
});
