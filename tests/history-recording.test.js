'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');

// Seat `count` bots and drive a full round to a scored summary, then return the
// game so we can inspect its server-authoritative action history. Mirrors the
// harness in bots-autoplay.integration.test.js (a bots-only table is a valid
// test harness per the spec Assumptions) so the recording sites are exercised
// end-to-end with no human input.
function seatBots(store, count) {
  const gameId = 'hist01';
  const players = new Set();
  for (let i = 0; i < count; i++) {
    const { playerId } = store._registry.createBot(`Robo-${i}`);
    store.players.get(playerId).gameId = gameId;
    players.add(playerId);
  }
  store.games.set(gameId, {
    id: gameId, type: 'public', hostId: [...players][0],
    players, requiredPlayers: count, status: 'waiting', inviteCode: null,
    createdAt: Date.now(), round: null, session: null,
  });
  store._botDriver._handler._rateLimiter.isAllowed = () => true;
  return gameId;
}

function playOneRound(t, store, gameId, maxTicks) {
  store.startRound(gameId);
  let completed = false;
  for (let i = 0; i < maxTicks && !completed; i++) {
    t.mock.timers.tick(3000);
    const session = store.games.get(gameId)?.session;
    completed = Boolean(session && session.history && session.history.length >= 1);
  }
  assert.ok(completed, 'a full round was scored within the tick budget');
  return store.games.get(gameId).session;
}

function assertMonotonicSeq(entries) {
  entries.forEach((e, i) => {
    assert.equal(e.seq, i, `entry ${i} must have seq ${i} (strictly +1, never reused)`);
  });
}

function runRecordingChecks(t, playerCount, maxTicks) {
  t.mock.timers.enable(['setTimeout']);
  const store = new ThousandStore();
  const gameId = seatBots(store, playerCount);
  const session = playOneRound(t, store, gameId, maxTicks);
  const entries = session.actionHistory.toView();

  assert.ok(entries.length > 0, 'the round produced history entries');
  assertMonotonicSeq(entries);

  // Every entry belongs to round 1; every non-null seat is a valid seat (FR-017).
  for (const e of entries) {
    assert.equal(e.roundNumber, 1);
    if (e.seat !== null) {
      assert.ok(e.seat >= 0 && e.seat < playerCount, `seat ${e.seat} within range`);
    }
  }

  // Exactly one round-score entry, and it is the last entry (resolution order).
  const roundScores = entries.filter((e) => e.kind === 'round-score');
  assert.equal(roundScores.length, 1, 'exactly one round-score per scored round');
  assert.equal(entries[entries.length - 1].kind, 'round-score', 'round-score is recorded last');
  const rs = roundScores[0];
  assert.equal(rs.seat, null);
  assert.equal(Object.keys(rs.data.perSeat).length, playerCount,
    'round-score perSeat covers every active seat (FR-017)');
  assert.equal(typeof rs.data.declarerSeat, 'number');

  // Trick entries: one per trick, numbered 1..N with no gaps or duplicates.
  const trickNos = entries.filter((e) => e.kind === 'trick').map((e) => e.data.trickNumber);
  assert.ok(trickNos.length > 0, 'at least one trick was recorded');
  const sortedTricks = [...trickNos].sort((a, b) => a - b);
  sortedTricks.forEach((n, i) => {
    assert.equal(n, i + 1, 'trick numbers are sequential 1..N with no duplicates');
  });

  // At least one auction event (bid or pass) was recorded.
  const auction = entries.filter((e) => e.kind === 'bid' || e.kind === 'pass');
  assert.ok(auction.length > 0, 'the auction recorded at least one bid/pass');
}

describe('history recording at resolution sites', () => {
  it('records bids/passes/tricks/round-score in order for a 3-player game (FR-017)', (t) => {
    runRecordingChecks(t, 3, 600);
  });

  it('records bids/passes/tricks/round-score in order for a 4-player game (FR-017)', (t) => {
    runRecordingChecks(t, 4, 800);
  });
});
