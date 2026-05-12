'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const ConnectionManager = require('../src/services/ConnectionManager');
const GameController = require('../src/controllers/GameController');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// Bootstrap 3 players + a game through the ConnectionManager hello flow,
// then start the round via store.startRound so the game is in-progress.
function setupInProgressGame() {
  const store = new ThousandStore();
  const cm = new ConnectionManager(store);

  const ws = [makeWs(), makeWs(), makeWs()];
  ws.forEach((w) => {
    cm.handleConnection(w);
    sendMsg(w, { type: 'hello' });
  });

  const pids = ws.map((w) => w._sent.find((m) => m.type === 'connected').playerId);
  pids.forEach((pid, i) => {
    store.players.get(pid).nickname = ['Alice', 'Bob', 'Charlie'][i];
  });

  const gameId = 'test-game';
  store.games.set(gameId, {
    id: gameId,
    players: new Set(pids),
    hostId: pids[0],
    type: 'public',
    status: 'waiting',
    requiredPlayers: 3,
    createdAt: Date.now(),
    inviteCode: null,
    round: null,
    waitingRoomTimer: null,
  });
  pids.forEach((pid) => { store.players.get(pid).gameId = gameId; });

  // Clear hello/lobby messages
  ws.forEach((w) => { w._sent.length = 0; });

  store.startRound(gameId);

  return { store, cm, ws, pids, gameId };
}

// ---------------------------------------------------------------------------
// T038a — round_started sent to each player with per-viewer identity filtering
// ---------------------------------------------------------------------------

describe('round-messages — round_started on startRound', () => {
  it('all three players receive round_started', () => {
    const { ws } = setupInProgressGame();
    for (const w of ws) {
      const msg = w._sent.find((m) => m.type === 'round_started');
      assert.ok(msg, 'every player must receive round_started');
    }
  });

  it('each round_started carries the correct self-seat for the recipient', () => {
    const { ws } = setupInProgressGame();
    for (let i = 0; i < 3; i++) {
      const msg = ws[i]._sent.find((m) => m.type === 'round_started');
      assert.equal(msg.seats.self, i, `player at seat ${i} must see seats.self = ${i}`);
    }
  });

  it('per-viewer filtering: own-seat and talon steps carry rank+suit; others do not', () => {
    const { ws } = setupInProgressGame();
    for (let viewerSeat = 0; viewerSeat < 3; viewerSeat++) {
      const msg = ws[viewerSeat]._sent.find((m) => m.type === 'round_started');
      assert.ok(msg.dealSequence && msg.dealSequence.length === 24, 'dealSequence must have 24 steps');

      for (const step of msg.dealSequence) {
        const isVisible = step.to === 'talon' || step.to === `seat${viewerSeat}`;
        if (isVisible) {
          assert.ok('rank' in step, `step id=${step.id} (to=${step.to}) must carry rank for viewer seat ${viewerSeat}`);
          assert.ok('suit' in step, `step id=${step.id} (to=${step.to}) must carry suit`);
        } else {
          assert.ok(!('rank' in step), `step id=${step.id} (to=${step.to}) must NOT carry rank for viewer seat ${viewerSeat}`);
          assert.ok(!('suit' in step), `step id=${step.id} (to=${step.to}) must NOT carry suit`);
        }
      }
    }
  });

  it('gameStatus in round_started has phase Dealing and null currentHighBid', () => {
    const { ws } = setupInProgressGame();
    const msg = ws[0]._sent.find((m) => m.type === 'round_started');
    assert.equal(msg.gameStatus.phase, 'Dealing');
    assert.equal(msg.gameStatus.currentHighBid, null);
    assert.equal(msg.gameStatus.activePlayer, null);
  });
});

// ---------------------------------------------------------------------------
// T038b — bid message produces bid_accepted + phase_changed to all 3
// ---------------------------------------------------------------------------

describe('round-messages — bid message broadcasts', () => {
  it('valid bid from P1 produces bid_accepted and phase_changed to all 3 players', () => {
    const { ws, pids, store } = setupInProgressGame();
    const game = store.games.get('test-game');

    // Manually advance to bidding so we can send a bid without dealing.
    // P1 is pids[1] (seat 1, the first bidder per FR-004).
    game.round.advanceFromDealingToBidding();
    ws.forEach((w) => { w._sent.length = 0; });

    // Send bid from P1's WS (seat 1)
    sendMsg(ws[1], { type: 'bid', amount: 100 });

    for (const w of ws) {
      const bidAccepted = w._sent.find((m) => m.type === 'bid_accepted');
      const phaseChanged = w._sent.find((m) => m.type === 'phase_changed');
      assert.ok(bidAccepted, 'every player must receive bid_accepted');
      assert.ok(phaseChanged, 'every player must receive phase_changed');
    }

    // bid_accepted carries the bidder's playerId and amount
    const msg = ws[0]._sent.find((m) => m.type === 'bid_accepted');
    assert.equal(msg.playerId, pids[1]);
    assert.equal(msg.amount, 100);
  });

  it('valid pass from P1 produces pass_accepted and phase_changed to all 3 players', () => {
    const { ws, pids, store } = setupInProgressGame();
    const game = store.games.get('test-game');
    game.round.advanceFromDealingToBidding();
    ws.forEach((w) => { w._sent.length = 0; });

    sendMsg(ws[1], { type: 'pass' });

    for (const w of ws) {
      assert.ok(w._sent.find((m) => m.type === 'pass_accepted'), 'pass_accepted must be broadcast');
      assert.ok(w._sent.find((m) => m.type === 'phase_changed'), 'phase_changed must be broadcast');
    }

    const msg = ws[0]._sent.find((m) => m.type === 'pass_accepted');
    assert.equal(msg.playerId, pids[1]);
  });
});

// ---------------------------------------------------------------------------
// T038c — invalid bid produces action_rejected to sender only
// ---------------------------------------------------------------------------

describe('round-messages — invalid bid sends action_rejected to sender only', () => {
  it('bid from wrong seat (not currentTurnSeat) is rejected to sender only', () => {
    const { ws, store } = setupInProgressGame();
    const game = store.games.get('test-game');
    game.round.advanceFromDealingToBidding(); // currentTurnSeat = 1
    ws.forEach((w) => { w._sent.length = 0; });

    // ws[0] is seat 0 (Dealer) — not the current turn
    sendMsg(ws[0], { type: 'bid', amount: 100 });

    const rejection = ws[0]._sent.find((m) => m.type === 'action_rejected');
    assert.ok(rejection, 'sender must receive action_rejected');
    assert.ok(rejection.reason);

    // Other players must NOT receive any message
    for (const w of [ws[1], ws[2]]) {
      assert.equal(w._sent.length, 0, 'non-sender players must receive nothing');
    }
  });

  it('bid with non-multiple-of-5 amount is rejected to sender only', () => {
    const { ws, store } = setupInProgressGame();
    const game = store.games.get('test-game');
    game.round.advanceFromDealingToBidding();
    ws.forEach((w) => { w._sent.length = 0; });

    sendMsg(ws[1], { type: 'bid', amount: 103 }); // not multiple of 5
    assert.ok(ws[1]._sent.find((m) => m.type === 'action_rejected'));
    assert.equal(ws[0]._sent.length, 0);
    assert.equal(ws[2]._sent.length, 0);
  });
});

// ---------------------------------------------------------------------------
// T038d — join_game against an in-progress game is rejected (FR-020)
// ---------------------------------------------------------------------------

describe('round-messages — joining an in-progress game is rejected (FR-020)', () => {
  it('_admitPlayerToGame sends game_join_failed when game.status is in-progress', () => {
    const store = new ThousandStore();
    const gc = new GameController(store);

    const ws4 = makeWs();
    const { playerId: pid4 } = store.createPlayer(ws4, '127.0.0.1');
    store.players.get(pid4).nickname = 'Latecomer';

    // Create a game that is already in-progress
    const gameId = 'prog-game';
    store.games.set(gameId, {
      id: gameId,
      players: new Set(),
      hostId: 'nobody',
      type: 'public',
      status: 'in-progress',
      requiredPlayers: 3,
      createdAt: Date.now(),
      inviteCode: null,
      round: null,
      waitingRoomTimer: null,
    });

    gc._admitPlayerToGame(store.games.get(gameId), gameId, pid4);

    const rejected = ws4._sent.find((m) => m.type === 'game_join_failed');
    assert.ok(rejected, 'game_join_failed must be sent to the late joiner');
    assert.ok(rejected.reason, 'rejection reason must be provided');
  });
});

// ---------------------------------------------------------------------------
// T038e — Synchrony assertions (SC-001 / SC-008)
// ---------------------------------------------------------------------------

describe('round-messages — synchrony assertions', () => {
  it('SC-001: startRound is invoked synchronously inside _admitPlayerToGame', () => {
    const store = new ThousandStore();
    const gc = new GameController(store);

    const wsArr = [makeWs(), makeWs(), makeWs()];
    const pids = wsArr.map((w) => {
      const { playerId } = store.createPlayer(w, '127.0.0.1');
      return playerId;
    });
    pids.forEach((pid, i) => { store.players.get(pid).nickname = ['A', 'B', 'C'][i]; });

    const gameId = 'sync-game';
    store.games.set(gameId, {
      id: gameId,
      players: new Set([pids[0], pids[1]]), // 2 already in; 3rd admit triggers start
      hostId: pids[0],
      type: 'public',
      status: 'waiting',
      requiredPlayers: 3,
      createdAt: Date.now(),
      inviteCode: null,
      round: null,
      waitingRoomTimer: null,
    });
    store.players.get(pids[0]).gameId = gameId;
    store.players.get(pids[1]).gameId = gameId;

    // Stub startRound to record call order
    let calledOrder = [];
    const origStartRound = store.startRound.bind(store);
    store.startRound = (...args) => {
      calledOrder.push('startRound');
      origStartRound(...args);
    };

    gc._admitPlayerToGame(store.games.get(gameId), gameId, pids[2]);
    calledOrder.push('admitReturned');

    // startRound must appear before admitReturned (no async deferral)
    assert.ok(
      calledOrder.indexOf('startRound') < calledOrder.indexOf('admitReturned'),
      'startRound must be called synchronously within _admitPlayerToGame'
    );
  });

  it('SC-008: phase_changed broadcast lands in the same synchronous tick as handleBid', () => {
    const { ws, store } = setupInProgressGame();
    const game = store.games.get('test-game');
    game.round.advanceFromDealingToBidding();
    ws.forEach((w) => { w._sent.length = 0; });

    // Send bid and immediately (synchronously) check messages
    sendMsg(ws[1], { type: 'bid', amount: 100 });

    // All 3 must have received phase_changed in the same synchronous tick
    for (const w of ws) {
      assert.ok(
        w._sent.some((m) => m.type === 'phase_changed'),
        'phase_changed must be delivered synchronously to every player'
      );
    }
  });

  it('SC-008: phase_changed broadcast lands in the same synchronous tick as handlePass', () => {
    const { ws, store } = setupInProgressGame();
    const game = store.games.get('test-game');
    game.round.advanceFromDealingToBidding();
    ws.forEach((w) => { w._sent.length = 0; });

    sendMsg(ws[1], { type: 'pass' });

    for (const w of ws) {
      assert.ok(
        w._sent.some((m) => m.type === 'phase_changed'),
        'phase_changed must be delivered synchronously after pass'
      );
    }
  });
});
