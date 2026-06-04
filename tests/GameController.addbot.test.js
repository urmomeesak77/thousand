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

// Empty-body request stand-in for HttpUtil.parseBody (add-bot carries no body).
function makeReq() {
  return {
    on(event, cb) {
      if (event === 'end') { cb(); }
      return this;
    },
  };
}

// Seats `player` as host of a fresh waiting-room game; returns the gameId.
function hostAGame(store, hostId, requiredPlayers = 3) {
  const gameId = 'aabbcc';
  store.games.set(gameId, {
    id: gameId, type: 'public', hostId,
    players: new Set([hostId]), requiredPlayers,
    status: 'waiting', inviteCode: null,
    createdAt: Date.now(), round: null, session: null,
  });
  store.players.get(hostId).gameId = gameId;
  return gameId;
}

// per FR-001, FR-003, FR-005 — host-only, waiting-only, not-full add-bot guards.
describe('GameController.handleAddBot — guards', () => {
  it('404 not_found for an unknown game', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId } = store.createPlayer(makeWs(), '127.0.0.1');
    const res = makeRes();
    await gc.handleAddBot(makeReq(), res, store.players.get(playerId), 'ffffff');
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'not_found');
  });

  it('403 forbidden when the requester is not the host', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId: host } = store.createPlayer(makeWs(), '127.0.0.1');
    const { playerId: other } = store.createPlayer(makeWs(), '127.0.0.1');
    const gameId = hostAGame(store, host);
    const res = makeRes();
    await gc.handleAddBot(makeReq(), res, store.players.get(other), gameId);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'forbidden');
  });

  it('409 game_already_started when the game is not waiting', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId: host } = store.createPlayer(makeWs(), '127.0.0.1');
    const gameId = hostAGame(store, host);
    store.games.get(gameId).status = 'in-progress';
    const res = makeRes();
    await gc.handleAddBot(makeReq(), res, store.players.get(host), gameId);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'game_already_started');
  });

  it('409 game_full when no empty seat remains', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId: host } = store.createPlayer(makeWs(), '127.0.0.1');
    const gameId = hostAGame(store, host, 3);
    // Fill the remaining two seats so size === requiredPlayers.
    const a = store._registry.createBot('Robo-Ada').playerId;
    const b = store._registry.createBot('Robo-Max').playerId;
    store.games.get(gameId).players.add(a).add(b);
    const res = makeRes();
    await gc.handleAddBot(makeReq(), res, store.players.get(host), gameId);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'game_full');
  });

  it('201 { botId, nickname } and seats the bot on success', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const { playerId: host } = store.createPlayer(makeWs(), '127.0.0.1');
    const gameId = hostAGame(store, host, 3);
    const res = makeRes();
    await gc.handleAddBot(makeReq(), res, store.players.get(host), gameId);
    assert.equal(res.statusCode, 201);
    assert.equal(typeof res.body.botId, 'string');
    assert.equal(typeof res.body.nickname, 'string');
    const bot = store.players.get(res.body.botId);
    assert.equal(bot.isBot, true);
    assert.ok(store.games.get(gameId).players.has(res.body.botId));
  });
});
