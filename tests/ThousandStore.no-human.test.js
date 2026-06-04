'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');

function makeWs() {
  return { readyState: 1, send: () => {}, on: () => {}, close: () => {} };
}

// per FR-014, FR-015 — a table must never linger with only bots once its last
// human leaves: the round is aborted, the game deleted, and bot records purged.
describe('ThousandStore — no human remaining cleanup', () => {
  it('deletes the game and purges bots when the last human leaves an in-progress table', () => {
    const store = new ThousandStore();
    const { playerId: human } = store.createPlayer(makeWs(), '127.0.0.1');
    const bot = store._registry.createBot('Robo-Ada').playerId;
    const gameId = 'abc123';
    let aborted = false;
    const game = {
      id: gameId, type: 'public', hostId: human,
      players: new Set([human, bot]), requiredPlayers: 3,
      status: 'in-progress', inviteCode: null, createdAt: Date.now(),
      round: { abort: () => { aborted = true; }, seatByPlayer: new Map() }, session: {},
    };
    store.players.get(human).gameId = gameId;
    store.players.get(bot).gameId = gameId;
    store.games.set(gameId, game);

    store.leaveGame(human, gameId);

    assert.equal(aborted, true, 'in-progress round was aborted');
    assert.equal(store.games.has(gameId), false, 'game deleted');
    assert.equal(store.players.has(bot), false, 'bot record purged');
  });

  it('keeps the game alive while another human remains', () => {
    const store = new ThousandStore();
    const { playerId: host } = store.createPlayer(makeWs(), '127.0.0.1');
    const { playerId: guest } = store.createPlayer(makeWs(), '127.0.0.1');
    const bot = store._registry.createBot('Robo-Ada').playerId;
    const gameId = 'abc124';
    const game = {
      id: gameId, type: 'public', hostId: host,
      players: new Set([host, guest, bot]), requiredPlayers: 3,
      status: 'waiting', inviteCode: null, createdAt: Date.now(), round: null, session: null,
    };
    for (const p of [host, guest, bot]) { store.players.get(p).gameId = gameId; }
    store.games.set(gameId, game);

    store.leaveGame(guest, gameId); // a non-host human leaves; host + bot remain

    assert.equal(store.games.has(gameId), true, 'game survives while a human remains');
    assert.equal(store.players.has(bot), true, 'bot not purged while a human remains');
  });
});
