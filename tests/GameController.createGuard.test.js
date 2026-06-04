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

// Minimal readable-request stand-in for HttpUtil.parseBody: emits the JSON body
// then end. The guard lives below the body-parse await (in the create critical
// section), so the request must actually carry a valid body to reach it.
function makeReq(body) {
  const json = JSON.stringify(body ?? { type: 'public', nickname: 'Alice', requiredPlayers: 3 });
  return {
    on(event, cb) {
      if (event === 'data') { cb(Buffer.from(json)); }
      else if (event === 'end') { cb(); }
      return this;
    },
  };
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
    await gc.handleCreateGame(makeReq(), res, player, '127.0.0.1');

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'already_in_game');
    assert.equal(store.games.size, 0, 'no second game was created');
  });

  // Regression: the guard must sit inside the synchronous critical section
  // (below the body-parse await, above _admitPlayerToGame). If it sits before
  // the await, two concurrent creates from one player (two tabs) both pass the
  // check before either admits → two games. This drives both requests through
  // the await concurrently and asserts exactly one game results.
  it('two concurrent creates from one player yield exactly one game', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId } = store.createPlayer(makeWs(), '127.0.0.1');
    const player = store.players.get(playerId);

    const res1 = makeRes();
    const res2 = makeRes();
    await Promise.all([
      gc.handleCreateGame(makeReq(), res1, player, '127.0.0.1'),
      gc.handleCreateGame(makeReq(), res2, player, '127.0.0.1'),
    ]);

    assert.equal(store.games.size, 1, 'exactly one game created despite the race');
    const statuses = [res1.statusCode, res2.statusCode].sort();
    assert.deepEqual(statuses, [201, 409], 'one create succeeds, the other is rejected');
  });
});
