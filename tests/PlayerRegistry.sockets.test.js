'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const PlayerRegistry = require('../src/services/PlayerRegistry');

function makeWs() {
  const sent = [];
  return { readyState: 1, send: (d) => sent.push(JSON.parse(d)), _sent: sent };
}

describe('PlayerRegistry multi-socket', () => {
  it('create() seeds the player with a single-socket Set', () => {
    const registry = new PlayerRegistry();
    const ws = makeWs();
    const { playerId } = registry.create(ws, '127.0.0.1');
    const player = registry.players.get(playerId);
    assert.ok(player.sockets instanceof Set);
    assert.equal(player.sockets.size, 1);
    assert.ok(player.sockets.has(ws));
  });

  it('sendToPlayer delivers to every open socket', () => {
    const registry = new PlayerRegistry();
    const ws1 = makeWs();
    const { playerId } = registry.create(ws1, '127.0.0.1');
    const ws2 = makeWs();
    registry.players.get(playerId).sockets.add(ws2);

    registry.sendToPlayer(playerId, { type: 'ping' });

    assert.deepEqual(ws1._sent, [{ type: 'ping' }]);
    assert.deepEqual(ws2._sent, [{ type: 'ping' }]);
  });

  it('sendToPlayer skips non-open sockets and isolates throwing ones', () => {
    const registry = new PlayerRegistry();
    const ws1 = makeWs();
    const { playerId } = registry.create(ws1, '127.0.0.1');
    const wsClosed = { readyState: 3, send: () => { throw new Error('closed'); } };
    const wsThrows = { readyState: 1, send: () => { throw new Error('boom'); } };
    registry.players.get(playerId).sockets.add(wsClosed);
    registry.players.get(playerId).sockets.add(wsThrows);

    assert.doesNotThrow(() => registry.sendToPlayer(playerId, { type: 'ping' }));
    assert.deepEqual(ws1._sent, [{ type: 'ping' }]);
  });
});
