'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');

function makeWs() {
  const sent = [];
  const ws = {
    readyState: 1,
    _socket: { remoteAddress: '127.0.0.1' },
    send: (d) => sent.push(JSON.parse(d)),
    on: () => {},
    _sent: sent,
    _closed: false,
  };
  ws.close = () => { ws._closed = true; };
  return ws;
}

// T018: grace period tests
describe('ThousandStore.handlePlayerDisconnect grace period', () => {
  it('(a) does not delete player immediately — starts grace timer', () => {
    process.env.GRACE_PERIOD_MS = '60000';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws = makeWs();
    const { playerId } = store.createPlayer(ws, '127.0.0.1');

    store.handlePlayerDisconnect(playerId);

    assert.ok(store.players.has(playerId), 'player record must survive disconnect');
    const player = store.players.get(playerId);
    assert.equal(player.ws, null);
    assert.ok(player.disconnectedAt !== null);
    assert.ok(player.graceTimer !== null);
    clearTimeout(player.graceTimer);
  });

  it('(b) reconnectPlayer within grace period restores ws, cancels timer', () => {
    process.env.GRACE_PERIOD_MS = '60000';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');
    store.handlePlayerDisconnect(playerId);

    const ws2 = makeWs();
    store.reconnectPlayer(playerId, ws2);

    const player = store.players.get(playerId);
    assert.equal(player.ws, ws2);
    assert.equal(player.graceTimer, null);
    assert.equal(player.disconnectedAt, null);
    assert.equal(ws2._playerId, playerId);
  });

  it('(c) grace timer expiry deletes player record', async () => {
    process.env.GRACE_PERIOD_MS = '1';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws = makeWs();
    const { playerId } = store.createPlayer(ws, '127.0.0.1');

    store.handlePlayerDisconnect(playerId);
    await new Promise((r) => setTimeout(r, 20));

    assert.ok(!store.players.has(playerId), 'player record must be purged after grace period');
  });

  it('(d) grace timer expiry removes player from game', async () => {
    process.env.GRACE_PERIOD_MS = '1';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws = makeWs();
    const { playerId } = store.createPlayer(ws, '127.0.0.1');
    const gameId = 'test-game-d';
    store.games.set(gameId, {
      players: new Set([playerId]),
      hostId: playerId,
      status: 'waiting',
      type: 'public',
      maxPlayers: 4,
      inviteCode: null,
      createdAt: Date.now(),
    });
    store.players.get(playerId).gameId = gameId;

    store.handlePlayerDisconnect(playerId);
    await new Promise((r) => setTimeout(r, 20));

    assert.ok(!store.players.has(playerId), 'player purged');
    assert.ok(!store.games.has(gameId), 'empty game deleted after player purge');
  });

  it('(e) reconnectPlayer before timer fires prevents purge', async () => {
    process.env.GRACE_PERIOD_MS = '1';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');

    store.handlePlayerDisconnect(playerId);
    const ws2 = makeWs();
    store.reconnectPlayer(playerId, ws2);

    await new Promise((r) => setTimeout(r, 20));
    assert.ok(store.players.has(playerId), 'player must survive — clearTimeout prevented purge');
    assert.equal(store.players.get(playerId).ws, ws2);
  });
});

// T019: last-connect-wins
describe('ThousandStore.reconnectPlayer last-connect-wins', () => {
  it('sends session_replaced to live ws and closes it when player already connected', () => {
    const store = new ThousandStore();
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');

    const ws2 = makeWs();
    store.reconnectPlayer(playerId, ws2);

    assert.deepEqual(ws1._sent[0], { type: 'session_replaced' });
    assert.ok(ws1._closed, 'old ws must be closed');
    assert.equal(store.players.get(playerId).ws, ws2);
    assert.equal(ws2._playerId, playerId);
  });
});

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
