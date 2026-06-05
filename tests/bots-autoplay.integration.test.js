'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');

// Seat `count` bots in a fresh waiting-room game and return its id. A bots-only
// table is a test harness (spec Assumptions allow it); it exercises the full
// server-side bot loop end-to-end with no human input.
function seatBots(store, count) {
  const gameId = 'b07a1d';
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
  return gameId;
}

// per FR-006, FR-007, FR-010, SC-001 — bots carry a full round to completion with
// legal actions and valid scores, with zero human input.
describe('bots autoplay integration', () => {
  it('three bots play a full round to a scored round-summary', (t) => {
    t.mock.timers.enable(['setTimeout', 'Date']);
    const store = new ThousandStore();
    const gameId = seatBots(store, 3);

    store.startRound(gameId); // bidding opens; the driver schedules the first bidder

    // Advance the randomized 1–3 s bot timers until a full round has been scored.
    let completed = false;
    for (let i = 0; i < 600 && !completed; i++) {
      t.mock.timers.tick(3000);
      const session = store.games.get(gameId)?.session;
      completed = Boolean(session && session.history && session.history.length >= 1);
    }

    const game = store.games.get(gameId);
    assert.ok(game, 'game still exists (no victory in a single round)');
    assert.ok(completed, 'a full round was scored within the tick budget (no stall)');

    const session = game.session;
    const entry = session.history[0];
    assert.equal(entry.roundNumber, 1);
    // Valid scores: every seat has a finite cumulative integer.
    for (let seat = 0; seat < 3; seat++) {
      const score = session.cumulativeScores[seat];
      assert.ok(Number.isFinite(score), `seat ${seat} score is finite (${score})`);
    }
    // A declarer was determined and the made/missed outcome is recorded.
    assert.ok(typeof entry.declarerSeat === 'number');
  });

  // per FR-011 — bots are supported in both the 3- and 4-player variants.
  it('four bots also complete a round (4-player variant)', (t) => {
    t.mock.timers.enable(['setTimeout', 'Date']);
    const store = new ThousandStore();
    const gameId = seatBots(store, 4);

    store.startRound(gameId);

    let completed = false;
    for (let i = 0; i < 800 && !completed; i++) {
      t.mock.timers.tick(3000);
      const session = store.games.get(gameId)?.session;
      completed = Boolean(session && session.history && session.history.length >= 1);
    }
    assert.ok(completed, 'the 4-player round completed without stalling');
  });
});
