'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');
const ThousandStore = require('../src/services/ThousandStore');
const ConnectionManager = require('../src/services/ConnectionManager');

// ---------------------------------------------------------------------------
// Helpers — direct Round unit tests
// ---------------------------------------------------------------------------

function makeMinimalStore(pids) {
  const players = new Map();
  pids.forEach((pid, i) => {
    players.set(pid, { id: pid, nickname: ['Alice', 'Bob', 'Carol'][i] });
  });
  return { players };
}

function makeRoundInBidding() {
  const pids = ['p0', 'p1', 'p2'];
  const game = { id: 'g1', players: new Set(pids), hostId: pids[0] };
  const store = makeMinimalStore(pids);
  const round = new Round({ game, store });
  round.start();
  round.advanceFromDealingToBidding(); // currentTurnSeat = 1 (Bob)
  return { round, pids, game, store };
}

// ---------------------------------------------------------------------------
// Helpers — ThousandStore integration tests
// ---------------------------------------------------------------------------

function makeWs() {
  const sent = [];
  const ws = {
    readyState: 1,
    isAlive: true,
    _socket: { remoteAddress: '127.0.0.1' },
    send: (d) => sent.push(JSON.parse(d)),
    close: () => {},
    on: (event, handler) => { ws._handlers[event] = handler; },
    ping: () => {},
    _sent: sent,
    _handlers: {},
  };
  return ws;
}

function sendMsg(ws, data) {
  ws._handlers.message?.(Buffer.from(JSON.stringify(data)));
}

function setupInProgressGame() {
  const store = new ThousandStore();
  store._gracePeriodMs = 0; // purge immediately on disconnect for testing
  const cm = new ConnectionManager(store);

  const ws = [makeWs(), makeWs(), makeWs()];
  ws.forEach((w) => {
    cm.handleConnection(w);
    sendMsg(w, { type: 'hello' });
  });

  const pids = ws.map((w) => w._sent.find((m) => m.type === 'connected').playerId);
  pids.forEach((pid, i) => { store.players.get(pid).nickname = ['Alice', 'Bob', 'Carol'][i]; });

  const gameId = 'g1';
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

  ws.forEach((w) => { w._sent.length = 0; });
  store.startRound(gameId);
  store.games.get(gameId).round.advanceFromDealingToBidding();
  ws.forEach((w) => { w._sent.length = 0; });

  return { store, cm, ws, pids, gameId };
}

// ---------------------------------------------------------------------------
// (a) markDisconnected on currentTurnSeat pauses action-acceptance
// ---------------------------------------------------------------------------

describe('Round.disconnect — (a) active-player disconnect pauses round', () => {
  it('markDisconnected(currentTurnSeat) sets pausedByDisconnect = true', () => {
    const { round } = makeRoundInBidding();
    assert.equal(round.currentTurnSeat, 1);
    round.markDisconnected(1);
    assert.equal(round.pausedByDisconnect, true);
  });

  it('submitBid from the active seat is rejected while pausedByDisconnect is true', () => {
    const { round } = makeRoundInBidding();
    round.markDisconnected(1);
    const result = round.submitBid(1, 100);
    assert.equal(result.rejected, true);
    assert.ok(result.reason, 'rejection must carry a reason');
  });

  it('submitPass from the active seat is rejected while pausedByDisconnect is true', () => {
    const { round } = makeRoundInBidding();
    round.markDisconnected(1);
    const result = round.submitPass(1);
    assert.equal(result.rejected, true);
    assert.ok(result.reason);
  });

  it('markReconnected(activePlayer) clears the pause and allows actions again', () => {
    const { round } = makeRoundInBidding();
    round.markDisconnected(1);
    assert.equal(round.pausedByDisconnect, true);
    round.markReconnected(1);
    assert.equal(round.pausedByDisconnect, false);
    const result = round.submitBid(1, 100);
    assert.equal(result.rejected, false);
  });
});

// ---------------------------------------------------------------------------
// (b) markDisconnected on non-active seat does NOT pause the round
// ---------------------------------------------------------------------------

describe('Round.disconnect — (b) non-active-player disconnect does not pause round', () => {
  it('markDisconnected(non-active seat) leaves pausedByDisconnect false', () => {
    const { round } = makeRoundInBidding();
    assert.equal(round.currentTurnSeat, 1);
    round.markDisconnected(0); // seat 0 (Alice/Dealer) is not the active bidder
    assert.equal(round.pausedByDisconnect, false);
  });

  it('active player can still bid after a non-active player disconnects', () => {
    const { round } = makeRoundInBidding();
    round.markDisconnected(0);
    const result = round.submitBid(1, 100);
    assert.equal(result.rejected, false);
  });

  it('disconnectedSeats tracks the non-active disconnected seat', () => {
    const { round } = makeRoundInBidding();
    round.markDisconnected(0);
    assert.ok(round.disconnectedSeats.has(0));
    assert.equal(round.pausedByDisconnect, false);
  });
});

// ---------------------------------------------------------------------------
// (c1) Active-player grace expiry → round_aborted broadcast + game cleanup
// ---------------------------------------------------------------------------

describe('Round.disconnect — (c1) active-player grace expiry aborts round', () => {
  it('grace expiry on active player broadcasts round_aborted with correct fields', async () => {
    const { store, ws, pids, gameId } = setupInProgressGame();
    const round = store.games.get(gameId).round;

    // Disconnect Bob (seat 1 = active bidder)
    store.handlePlayerDisconnect(pids[1], ws[1]);
    assert.equal(round.pausedByDisconnect, true, 'round must be paused after active player disconnect');

    // Wait for the 0ms grace timer to fire
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Game record must be deleted
    assert.equal(store.games.has(gameId), false, 'game must be deleted after grace expiry');

    // Alice (ws[0]) and Carol (ws[2]) must receive round_aborted
    for (const w of [ws[0], ws[2]]) {
      const aborted = w._sent.find((m) => m.type === 'round_aborted');
      assert.ok(aborted, 'remaining player must receive round_aborted');
      assert.equal(aborted.reason, 'player_grace_expired');
      assert.equal(aborted.disconnectedNickname, 'Bob');
      assert.ok(aborted.gameStatus, 'round_aborted must carry gameStatus');
    }
  });
});

// ---------------------------------------------------------------------------
// (c2) Non-active-player grace expiry → round_aborted (symmetric with c1)
// ---------------------------------------------------------------------------

describe('Round.disconnect — (c2) non-active-player grace expiry also aborts round', () => {
  it('grace expiry on non-active player broadcasts round_aborted and cleans up', async () => {
    const { store, ws, pids, gameId } = setupInProgressGame();

    // Disconnect Alice (seat 0 = Dealer, NOT the active bidder)
    store.handlePlayerDisconnect(pids[0], ws[0]);

    const game = store.games.get(gameId);
    assert.equal(game.round.pausedByDisconnect, false, 'round must NOT be paused for non-active disconnect');

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(store.games.has(gameId), false, 'game must be deleted after non-active player grace expiry');

    // Bob (ws[1]) and Carol (ws[2]) must receive round_aborted with Alice's nickname
    for (const w of [ws[1], ws[2]]) {
      const aborted = w._sent.find((m) => m.type === 'round_aborted');
      assert.ok(aborted, 'remaining player must receive round_aborted');
      assert.equal(aborted.reason, 'player_grace_expired');
      assert.equal(aborted.disconnectedNickname, 'Alice');
    }
  });
});

// ---------------------------------------------------------------------------
// (d) hello after cleanup returns restored:true, gameId:null (no snapshot)
// ---------------------------------------------------------------------------

describe('Round.disconnect — (d) hello after cleanup returns restored=true, gameId=null', () => {
  it('a remaining player hello after grace expiry cleanup gets restored:true, gameId:null, no snapshot', async () => {
    const { store, cm, ws, pids, gameId } = setupInProgressGame();

    // Disconnect Bob, let the grace timer purge him and clean up the game
    store.handlePlayerDisconnect(pids[1], ws[1]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Alice's player record still exists with gameId = null
    assert.ok(store.players.has(pids[0]), 'Alice player record must survive cleanup');
    assert.equal(store.players.get(pids[0]).gameId, null, 'Alice gameId must be null after cleanup');

    // Alice reconnects on a fresh WebSocket
    const wsAliceNew = makeWs();
    cm.handleConnection(wsAliceNew);
    sendMsg(wsAliceNew, {
      type: 'hello',
      playerId: pids[0],
      sessionToken: store.players.get(pids[0]).sessionToken,
    });

    const connected = wsAliceNew._sent.find((m) => m.type === 'connected');
    assert.ok(connected, 'connected message must be sent');
    assert.equal(connected.restored, true, 'must be a restored session');
    assert.equal(connected.gameId, null, 'gameId must be null — game is gone');

    // No round_state_snapshot must follow (game record is deleted)
    const snapshot = wsAliceNew._sent.find((m) => m.type === 'round_state_snapshot');
    assert.equal(snapshot, undefined, 'round_state_snapshot must not be sent after cleanup');
  });
});

// ---------------------------------------------------------------------------
// (e) FR-031 × FR-021: paused round rejects non-active player actions to sender only
// ---------------------------------------------------------------------------

describe('Round.disconnect — (e) paused round: action_rejected to sender only, no phase_changed', () => {
  it('bid from non-active player while round is paused produces action_rejected to sender only', async () => {
    const { store, ws, pids, gameId } = setupInProgressGame();
    const game = store.games.get(gameId);

    // Disconnect Bob (seat 1 = active bidder)
    store.handlePlayerDisconnect(pids[1], ws[1]);
    assert.equal(game.round.pausedByDisconnect, true);

    ws.forEach((w) => { w._sent.length = 0; });

    // Carol (seat 2, not her turn) tries to bid while round is paused
    sendMsg(ws[2], { type: 'bid', amount: 100 });

    const rejection = ws[2]._sent.find((m) => m.type === 'action_rejected');
    assert.ok(rejection, 'carol must receive action_rejected');
    assert.ok(rejection.reason);

    // Alice gets nothing
    assert.equal(ws[0]._sent.length, 0, 'alice must receive no messages');

    // No phase_changed sent to anyone
    for (const w of ws) {
      assert.ok(!w._sent.find((m) => m.type === 'phase_changed'), 'no phase_changed must be broadcast');
    }

    // Round state unchanged (captured before the grace timer fires)
    assert.equal(game.round.phase, 'bidding');
    assert.equal(game.round.currentHighBid, null);

    // Drain the 0ms grace timer so it doesn't spill into the next test
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it('active player can bid again after reconnect clears the pause', () => {
    const { store, ws, pids, gameId } = setupInProgressGame();
    // Long grace period prevents the timer from firing during this synchronous test
    store._gracePeriodMs = 60_000;
    const game = store.games.get(gameId);

    store.handlePlayerDisconnect(pids[1], ws[1]);
    assert.equal(game.round.pausedByDisconnect, true);

    // Reconnect Bob
    store.reconnectPlayer(pids[1], ws[1]);
    assert.equal(game.round.pausedByDisconnect, false);

    ws.forEach((w) => { w._sent.length = 0; });

    // Bob bids successfully after reconnect
    sendMsg(ws[1], { type: 'bid', amount: 100 });

    const bidAccepted = ws[0]._sent.find((m) => m.type === 'bid_accepted');
    assert.ok(bidAccepted, 'bid must succeed after reconnect clears the pause');

    // Defuse the long grace timer to avoid interference after test
    clearTimeout(store.players.get(pids[1])?.graceTimer);
  });
});
