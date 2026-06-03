'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const { isNicknameTaken } = require('../src/controllers/nicknameLookup');

// ---------------------------------------------------------------------------
// logoutPlayer — intentional logout must release the nickname immediately.
//
// Bug: logging in, logging out, then logging back in with the same nickname
// returned "That nickname is already taken." Logout only cleared client-side
// identity; the server kept the player record (and its nickname) alive for the
// disconnect grace window, so isNicknameTaken still matched it. logoutPlayer
// purges the record now instead of waiting out the grace period.
// ---------------------------------------------------------------------------

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

describe('ThousandStore.logoutPlayer', () => {
  it('frees the nickname immediately so it can be reclaimed', () => {
    const store = new ThousandStore();
    const ws = makeWs();
    const { playerId } = store.createPlayer(ws, '127.0.0.1');
    store.players.get(playerId).nickname = 'Alice';

    assert.ok(isNicknameTaken(store.players, 'Alice'), 'precondition: nickname taken while logged in');

    store.logoutPlayer(playerId);

    assert.ok(!store.players.has(playerId), 'player record must be removed on logout');
    assert.ok(!isNicknameTaken(store.players, 'Alice'), 'nickname must be free for reuse after logout');
  });

  it('invalidates the old session token so it cannot restore the player', () => {
    const store = new ThousandStore();
    const ws = makeWs();
    const { playerId, sessionToken } = store.createPlayer(ws, '127.0.0.1');

    store.logoutPlayer(playerId);

    assert.equal(store.findBySessionToken(sessionToken), null,
      'logged-out token must no longer resolve to a player');
  });

  it('removes a logged-out host from their waiting game', () => {
    const store = new ThousandStore();
    const ws = makeWs();
    const { playerId } = store.createPlayer(ws, '127.0.0.1');
    const gameId = 'abc123';
    store.games.set(gameId, {
      players: new Set([playerId]),
      hostId: playerId,
      status: 'waiting',
      type: 'public',
      requiredPlayers: 4,
      inviteCode: null,
      createdAt: Date.now(),
    });
    store.players.get(playerId).gameId = gameId;

    store.logoutPlayer(playerId);

    assert.ok(!store.players.has(playerId), 'player purged on logout');
    assert.ok(!store.games.has(gameId), 'now-empty game cleaned up after logout');
  });

  it('is a no-op for an unknown playerId', () => {
    const store = new ThousandStore();
    assert.doesNotThrow(() => store.logoutPlayer('nonexistent-id'));
  });
});
