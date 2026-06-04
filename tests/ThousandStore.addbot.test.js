'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');

// A ws that records every payload sent to it, so we can assert player_joined shape.
function makeRecordingWs() {
  const sent = [];
  return { readyState: 1, send: (d) => sent.push(JSON.parse(d)), on: () => {}, close: () => {}, _sent: sent };
}

function seatHost(store, requiredPlayers = 3) {
  const ws = makeRecordingWs();
  const { playerId: host } = store.createPlayer(ws, '127.0.0.1');
  store.players.get(host).nickname = 'Kashka';
  const gameId = 'aabbcc';
  store.games.set(gameId, {
    id: gameId, type: 'public', hostId: host,
    players: new Set([host]), requiredPlayers,
    status: 'waiting', inviteCode: null,
    createdAt: Date.now(), round: null, session: null,
  });
  store.players.get(host).gameId = gameId;
  return { gameId, host, ws };
}

// per FR-001, FR-004 — adding bots seats them; filling the table auto-starts.
describe('ThousandStore.addBot', () => {
  it('seats a uniquely-named bot and broadcasts player_joined with isBot', () => {
    const store = new ThousandStore();
    const { gameId, ws } = seatHost(store);
    const { botId, nickname } = store.addBot(gameId);

    assert.ok(store.games.get(gameId).players.has(botId));
    assert.equal(store.players.get(botId).nickname, nickname);
    const joined = ws._sent.find((m) => m.type === 'player_joined');
    assert.ok(joined, 'host receives player_joined');
    assert.equal(joined.player.isBot, true);
    assert.ok(joined.players.some((p) => p.nickname === nickname && p.isBot === true));
  });

  it('does not auto-start while seats remain empty', () => {
    const store = new ThousandStore();
    const { gameId } = seatHost(store, 3);
    store.addBot(gameId); // 2 of 3 seats filled
    assert.equal(store.games.get(gameId).status, 'waiting');
    assert.equal(store.games.get(gameId).round, null);
  });

  it('auto-starts the round when the added bot fills the table', () => {
    const store = new ThousandStore();
    const { gameId } = seatHost(store, 3);
    store.addBot(gameId);
    store.addBot(gameId); // fills seat 3 → startRound
    const game = store.games.get(gameId);
    assert.equal(game.status, 'in-progress');
    assert.ok(game.round, 'round was dealt on fill');
  });

  it('gives each bot at a table a distinct name', () => {
    const store = new ThousandStore();
    const { gameId } = seatHost(store, 4);
    const a = store.addBot(gameId);
    const b = store.addBot(gameId);
    assert.notEqual(a.nickname, b.nickname);
  });
});
