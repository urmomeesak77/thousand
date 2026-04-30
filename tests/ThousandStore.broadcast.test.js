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
    close: () => {},
    _sent: sent,
  };
}

describe('ThousandStore.broadcastLobbyUpdate — send isolation', () => {
  it('one ws.send() throwing must not skip later recipients', () => {
    const store = new ThousandStore();
    const ws1 = makeWs();
    const ws2 = makeWs();
    const ws3 = makeWs();
    const { playerId: p1 } = store.createPlayer(ws1, '127.0.0.1');
    const { playerId: p2 } = store.createPlayer(ws2, '127.0.0.1');
    const { playerId: p3 } = store.createPlayer(ws3, '127.0.0.1');
    // All three are in the lobby (gameId === null).

    // ws2.send throws — simulates a socket terminated between readyState check and send.
    ws2.send = () => { throw new Error('boom'); };

    assert.doesNotThrow(() => store.broadcastLobbyUpdate());

    const got1 = ws1._sent.some((m) => m.type === 'lobby_update');
    const got3 = ws3._sent.some((m) => m.type === 'lobby_update');
    assert.ok(got1, 'player1 must receive lobby_update despite ws2 failure');
    assert.ok(got3, 'player3 must receive lobby_update despite ws2 failure');

    // Unused identifiers — kept for clarity that we covered all three players.
    void p1; void p2; void p3;
  });
});

describe('ThousandStore.sendToPlayer — error isolation', () => {
  it('throwing ws.send() does not propagate to caller', () => {
    const store = new ThousandStore();
    const ws = makeWs();
    const { playerId } = store.createPlayer(ws, '127.0.0.1');
    ws.send = () => { throw new Error('boom'); };

    assert.doesNotThrow(() => store.sendToPlayer(playerId, { type: 'hello' }));
  });
});
