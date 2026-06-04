'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const GameController = require('../src/controllers/GameController');

function makeWs() {
  return { readyState: 1, send: () => {}, on: () => {}, close: () => {} };
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.writeHead = (status) => { res.statusCode = status; };
  res.end = (json) => { res.body = JSON.parse(json); };
  return res;
}

describe('GameController.handleCreateGame — already-in-game guard', () => {
  it('rejects with 409 already_in_game when the player already has a gameId', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const ws = makeWs();
    const { playerId } = store.createPlayer(ws, '127.0.0.1');
    const player = store.players.get(playerId);
    player.nickname = 'Alice';
    player.gameId = 'existing-game';

    const res = makeRes();
    await gc.handleCreateGame({}, res, player, '127.0.0.1');

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'already_in_game');
    assert.equal(store.games.size, 0, 'no second game was created');
  });
});
