'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');

function makeWs() {
  const sent = [];
  const ws = {
    readyState: 1,
    send: (d) => sent.push(JSON.parse(d)),
    on: () => {},
    _sent: sent,
    _closed: false,
  };
  ws.close = () => { ws._closed = true; };
  return ws;
}

describe('ConnectionLifecycle multi-socket', () => {
  it('a second connection is additive — both sockets stay open, no session_replaced', () => {
    const store = new ThousandStore();
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');

    const ws2 = makeWs();
    store.reconnectPlayer(playerId, ws2);

    const player = store.players.get(playerId);
    assert.equal(player.sockets.size, 2, 'both tabs are connected');
    assert.ok(player.sockets.has(ws1) && player.sockets.has(ws2));
    assert.equal(ws1._closed, false, 'first tab is NOT kicked');
    assert.equal(ws1._sent.length, 0, 'no session_replaced sent to the first tab');
    assert.equal(ws2._playerId, playerId);
  });

  it('closing one of several sockets does not start the grace timer', () => {
    process.env.GRACE_PERIOD_MS = '60000';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');
    const ws2 = makeWs();
    store.reconnectPlayer(playerId, ws2);

    store.handlePlayerDisconnect(playerId, ws1);

    const player = store.players.get(playerId);
    assert.equal(player.sockets.size, 1, 'the other tab is still connected');
    assert.ok(player.sockets.has(ws2));
    assert.equal(player.disconnectedAt, null, 'player is still fully connected');
    assert.equal(player.graceTimer, null, 'no grace timer while a tab remains');
  });

  it('closing the last socket starts the grace timer', () => {
    process.env.GRACE_PERIOD_MS = '60000';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');

    store.handlePlayerDisconnect(playerId, ws1);

    const player = store.players.get(playerId);
    assert.equal(player.sockets.size, 0);
    assert.ok(player.disconnectedAt !== null);
    assert.ok(player.graceTimer !== null);
    clearTimeout(player.graceTimer);
  });

  it('a stale close for an already-removed socket is a no-op', () => {
    process.env.GRACE_PERIOD_MS = '60000';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');
    const ws2 = makeWs();
    store.reconnectPlayer(playerId, ws2);

    store.handlePlayerDisconnect(playerId, ws1); // ws1 removed, ws2 remains
    store.handlePlayerDisconnect(playerId, ws1); // stale repeat — must not touch ws2/grace

    const player = store.players.get(playerId);
    assert.equal(player.sockets.size, 1);
    assert.ok(player.sockets.has(ws2));
    assert.equal(player.graceTimer, null);
  });
});
