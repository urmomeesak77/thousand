'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');

// Build a minimal waiting-room game fixture with one human host and one bot seated.
function seatHumanAndBot(store) {
  const { playerId: host } = store.createPlayer({ readyState: 1, send() {}, on() {} }, '127.0.0.1');
  const { playerId: bot } = store._registry.createBot('Robo-Ada');
  const gameId = 'g-teardown';
  const game = {
    id: gameId, type: 'public', hostId: host,
    players: new Set([host, bot]), requiredPlayers: 3,
    status: 'waiting', inviteCode: null,
    createdAt: Date.now(), round: null, session: null,
  };
  store.players.get(bot).gameId = gameId;
  store.games.set(gameId, game);
  return { gameId, game, host, bot };
}

// per FR-014 — bots have no session token to expire, so every teardown path must
// explicitly purge their registry records or they leak forever.
describe('ThousandStore bot purge on teardown', () => {
  it('_deleteGame purges the game\'s bot records', () => {
    const store = new ThousandStore();
    const { gameId, game, bot } = seatHumanAndBot(store);
    store._deleteGame(gameId, game);
    assert.equal(store.players.has(bot), false, 'bot must be purged on delete');
  });

  it('_disbandGame purges the game\'s bot records', () => {
    const store = new ThousandStore();
    const { gameId, game, bot } = seatHumanAndBot(store);
    store._disbandGame(gameId, game, 'host_left');
    assert.equal(store.players.has(bot), false, 'bot must be purged on disband');
  });

  it('_cleanupRound purges the game\'s bot records', () => {
    const store = new ThousandStore();
    const { gameId, bot } = seatHumanAndBot(store);
    store._cleanupRound(gameId);
    assert.equal(store.players.has(bot), false, 'bot must be purged on round cleanup');
  });

  it('leaves human records untouched when purging bots', () => {
    const store = new ThousandStore();
    const { gameId, game, host } = seatHumanAndBot(store);
    store._deleteGame(gameId, game);
    assert.equal(store.players.has(host), true, 'human must survive bot purge');
  });
});
