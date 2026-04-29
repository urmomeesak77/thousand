'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');

function makeWs() {
  const sent = [];
  return {
    readyState: 1,
    _socket: { remoteAddress: '127.0.0.1' },
    send: (d) => sent.push(JSON.parse(d)),
    on: () => {},
    _sent: sent,
  };
}

describe('ThousandStore.createOrRestorePlayer', () => {
  it('(a) unknown playerId → restored: false, new identity issued', () => {
    const store = new ThousandStore();
    const ws = makeWs();
    const result = store.createOrRestorePlayer(ws, '127.0.0.1', 'nonexistent-id', 'any-token');
    assert.equal(result.restored, false);
    assert.ok(typeof result.playerId === 'string');
    assert.ok(typeof result.sessionToken === 'string');
    assert.equal(result.nickname, null);
  });

  it('(b) known playerId + matching token → restored: true, nickname preserved', () => {
    const store = new ThousandStore();
    const ws1 = makeWs();
    const { playerId, sessionToken } = store.createPlayer(ws1, '127.0.0.1');
    store.players.get(playerId).nickname = 'Alice';

    const ws2 = makeWs();
    const result = store.createOrRestorePlayer(ws2, '127.0.0.1', playerId, sessionToken);
    assert.equal(result.restored, true);
    assert.equal(result.playerId, playerId);
    assert.equal(result.sessionToken, sessionToken);
    assert.equal(result.nickname, 'Alice');
  });

  it('(c) known playerId + wrong token → restored: false, original record unchanged', () => {
    const store = new ThousandStore();
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');
    store.players.get(playerId).nickname = 'Bob';

    const ws2 = makeWs();
    const result = store.createOrRestorePlayer(ws2, '127.0.0.1', playerId, 'wrong-token');
    assert.equal(result.restored, false);
    assert.notEqual(result.playerId, playerId);
    const original = store.players.get(playerId);
    assert.ok(original, 'original player record must still exist');
    assert.equal(original.nickname, 'Bob');
  });
});
