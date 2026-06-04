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
  res.end = (json) => { res.body = json ? JSON.parse(json) : null; };
  return res;
}
function makeReq() {
  return { on(event, cb) { if (event === 'end') { cb(); } return this; } };
}
function hostAGame(store, hostId) {
  const gameId = 'aabbcc';
  const botId = store._registry.createBot('Robo-Ada').playerId;
  store.players.get(botId).gameId = gameId;
  store.games.set(gameId, {
    id: gameId, type: 'public', hostId,
    players: new Set([hostId, botId]), requiredPlayers: 3,
    status: 'waiting', inviteCode: null, createdAt: Date.now(), round: null, session: null,
  });
  store.players.get(hostId).gameId = gameId;
  return { gameId, botId };
}

// per FR-002, FR-005 — host-only, waiting-only, must target a real bot in the game.
describe('GameController.handleRemoveBot — guards', () => {
  it('404 for an unknown game', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId } = store.createPlayer(makeWs(), '127.0.0.1');
    const res = makeRes();
    await gc.handleRemoveBot(makeReq(), res, store.players.get(playerId), 'ffffff', 'x');
    assert.equal(res.statusCode, 404);
  });

  it('403 when the requester is not the host', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId: host } = store.createPlayer(makeWs(), '127.0.0.1');
    const { playerId: other } = store.createPlayer(makeWs(), '127.0.0.1');
    const { gameId, botId } = hostAGame(store, host);
    const res = makeRes();
    await gc.handleRemoveBot(makeReq(), res, store.players.get(other), gameId, botId);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'forbidden');
  });

  it('409 when the game has already started', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId: host } = store.createPlayer(makeWs(), '127.0.0.1');
    const { gameId, botId } = hostAGame(store, host);
    store.games.get(gameId).status = 'in-progress';
    const res = makeRes();
    await gc.handleRemoveBot(makeReq(), res, store.players.get(host), gameId, botId);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'game_already_started');
  });

  it('404 when the target id is not a bot in the game', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId: host } = store.createPlayer(makeWs(), '127.0.0.1');
    const { gameId } = hostAGame(store, host);
    const res = makeRes();
    await gc.handleRemoveBot(makeReq(), res, store.players.get(host), gameId, 'not-a-bot');
    assert.equal(res.statusCode, 404);
  });

  it('200 and frees the seat on success', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId: host } = store.createPlayer(makeWs(), '127.0.0.1');
    const { gameId, botId } = hostAGame(store, host);
    const res = makeRes();
    await gc.handleRemoveBot(makeReq(), res, store.players.get(host), gameId, botId);
    assert.equal(res.statusCode, 200);
    assert.equal(store.games.get(gameId).players.has(botId), false);
    assert.equal(store.players.has(botId), false, 'bot record purged');
  });
});
