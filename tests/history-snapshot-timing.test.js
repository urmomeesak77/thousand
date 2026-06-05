'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const RoundActionHandler = require('../src/controllers/RoundActionHandler');

// Build a started 3-player game with three seated human players, plus a handler
// whose rate limiter is disabled. Returns everything needed to drive the auction.
function startedGame() {
  const store = new ThousandStore();
  const pids = ['p0', 'p1', 'p2'];
  pids.forEach((pid, i) => {
    store.players.set(pid, { id: pid, nickname: ['A', 'B', 'C'][i], gameId: 'g' });
  });
  store.games.set('g', {
    id: 'g', players: new Set(pids), hostId: 'p0', type: 'public',
    status: 'waiting', requiredPlayers: 3, createdAt: Date.now(),
    inviteCode: null, round: null, waitingRoomTimer: null,
  });
  store.startRound('g');
  const handler = new RoundActionHandler({ store });
  handler._rateLimiter.isAllowed = () => true;
  const game = store.games.get('g');
  return { store, handler, round: game.round };
}

// Capture every message the store sends to players during `fn`.
function captureSends(store, fn) {
  const sent = [];
  const original = store.sendToPlayer.bind(store);
  store.sendToPlayer = (pid, msg) => { sent.push({ pid, msg }); return original(pid, msg); };
  try {
    fn();
  } finally {
    store.sendToPlayer = original;
  }
  return sent;
}

describe('auction history appears in the resolving action\'s own snapshot (FR-018)', () => {
  it('the forced last bidder\'s winning bid is in the snapshot broadcast for that bid', () => {
    const { store, handler, round } = startedGame();

    // First two seats pass; the third is the forced last bidder.
    const seatToPid = (seat) => round.seatOrder[seat];
    handler.handlePass(seatToPid(round.currentTurnSeat));
    handler.handlePass(seatToPid(round.currentTurnSeat));

    const winnerPid = seatToPid(round.currentTurnSeat);
    const winnerSeat = round.currentTurnSeat;

    // The resolving bid: capture exactly what is broadcast while it is handled.
    const sent = captureSends(store, () => handler.handleBid(winnerPid, 100));

    // Any snapshot broadcast during the resolving bid must already contain the bid.
    const snapshots = sent
      .map((s) => s.msg.gameStatus)
      .filter((gs) => gs && Array.isArray(gs.actionHistory));
    assert.ok(snapshots.length > 0, 'the resolving bid broadcast at least one snapshot');

    for (const gs of snapshots) {
      const hasWinningBid = gs.actionHistory.some(
        (e) => e.kind === 'bid' && e.seat === winnerSeat && e.data.amount === 100,
      );
      assert.ok(hasWinningBid,
        'the winning bid must be in the snapshot for the action that placed it (not a later one)');
    }
  });
});
