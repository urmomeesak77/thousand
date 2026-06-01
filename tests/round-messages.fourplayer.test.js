'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const ConnectionManager = require('../src/services/ConnectionManager');
const GameController = require('../src/controllers/GameController');

function makeWs() {
  const sent = [];
  const handlers = {};
  const ws = {
    readyState: 1,
    isAlive: true,
    _socket: { remoteAddress: '127.0.0.1' },
    send: (d) => sent.push(JSON.parse(d)),
    close: (code) => { ws._closedCode = code; },
    on: (event, handler) => { handlers[event] = handler; },
    ping: () => {},
    _sent: sent,
    _handlers: handlers,
  };
  return ws;
}

function sendMsg(ws, data) {
  ws._handlers.message?.(Buffer.from(JSON.stringify(data)));
}

function bootstrap(playerCount, nicknames) {
  const store = new ThousandStore();
  const cm = new ConnectionManager(store);
  const controller = new GameController(store);
  const ws = Array.from({ length: playerCount }, () => makeWs());
  ws.forEach((w) => { cm.handleConnection(w); sendMsg(w, { type: 'hello' }); });
  const pids = ws.map((w) => w._sent.find((m) => m.type === 'connected').playerId);
  pids.forEach((pid, i) => { store.players.get(pid).nickname = nicknames[i]; });
  const gameId = `g${playerCount}`;
  store.games.set(gameId, {
    id: gameId, players: new Set([pids[0]]), hostId: pids[0], type: 'public',
    status: 'waiting', requiredPlayers: playerCount, createdAt: Date.now(),
    inviteCode: null, round: null, waitingRoomTimer: null,
  });
  store.players.get(pids[0]).gameId = gameId;
  ws.forEach((w) => { w._sent.length = 0; });
  return { store, cm, controller, ws, pids, gameId };
}

describe('round-messages (4-player) — waiting-room gate (FR-003, SC-005)', () => {
  it('a 4-player room does NOT start with three joiners and starts only when the fourth joins', () => { // per FR-003, SC-005
    const ctx = bootstrap(4, ['Alice', 'Bob', 'Charlie', 'Dave']);
    const game = ctx.store.games.get(ctx.gameId);

    ctx.controller._admitPlayerToGame(game, ctx.gameId, ctx.pids[1]);
    ctx.controller._admitPlayerToGame(game, ctx.gameId, ctx.pids[2]);
    assert.equal(game.round, null, 'three joiners: round must not start');
    assert.ok(!ctx.ws[2]._sent.find((m) => m.type === 'round_started'), 'no round_started yet');

    ctx.controller._admitPlayerToGame(game, ctx.gameId, ctx.pids[3]);
    assert.ok(game.round, 'round starts once the fourth player joins');
    for (const w of ctx.ws) {
      assert.ok(w._sent.find((m) => m.type === 'round_started'), 'all four receive round_started');
    }
  });
});

describe('round-messages (4-player) — seat layout & trick width (FR-018)', () => {
  function startedFourPlayer() {
    const ctx = bootstrap(4, ['Alice', 'Bob', 'Charlie', 'Dave']);
    const game = ctx.store.games.get(ctx.gameId);
    ctx.controller._admitPlayerToGame(game, ctx.gameId, ctx.pids[1]);
    ctx.controller._admitPlayerToGame(game, ctx.gameId, ctx.pids[2]);
    ctx.controller._admitPlayerToGame(game, ctx.gameId, ctx.pids[3]);
    return { ...ctx, game };
  }

  it('round_started seats list all four players and include an across seat', () => { // per FR-018
    const ctx = startedFourPlayer();
    const msg = ctx.ws[0]._sent.find((m) => m.type === 'round_started');
    assert.equal(msg.seats.players.length, 4);
    assert.ok('across' in msg.seats, 'seats must include an across slot for 4 players');
    const { self, left, across, right } = msg.seats;
    assert.equal(new Set([self, left, across, right]).size, 4, 'self + 3 opponents are distinct seats');
  });

  it('the view-model currentTrick can carry four entries', () => { // per FR-018
    const ctx = startedFourPlayer();
    const round = ctx.game.round;
    round.phase = 'trick-play';
    round.currentTrick = [0, 1, 2, 3].map((seat) => ({ seat, cardId: round.deck[seat].id }));
    const vm = round.getViewModelFor(0);
    assert.equal(vm.currentTrick.length, 4, 'currentTrick reaches width 4');
  });
});

describe('round-messages (3-player) — payload remains free of across (FR-006)', () => {
  it('a 3-player round_started seats payload has no across key', () => { // per FR-006
    const ctx = bootstrap(3, ['Alice', 'Bob', 'Charlie']);
    const game = ctx.store.games.get(ctx.gameId);
    ctx.controller._admitPlayerToGame(game, ctx.gameId, ctx.pids[1]);
    ctx.controller._admitPlayerToGame(game, ctx.gameId, ctx.pids[2]);
    const msg = ctx.ws[0]._sent.find((m) => m.type === 'round_started');
    assert.ok(msg, 'round started for 3 players');
    assert.equal(msg.seats.players.length, 3);
    assert.ok(!('across' in msg.seats), '3-player seats must not include across');
  });
});
