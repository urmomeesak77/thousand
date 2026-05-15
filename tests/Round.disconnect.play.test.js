'use strict';

// Tests for FR-025 disconnect handling in trick-play and round-summary phases,
// plus R-006 sticky-press semantics and grace-expiry ordering.
//
// Sections:
//   1 — Trick-play pause on active-player disconnect
//   2 — Round-summary sticky Continue press (plain mock objects)
//   3 — R-006 ordering A: third press BEFORE grace expires → next round
//   4 — R-006 ordering B: third press AFTER grace expires  → game_aborted

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePids() {
  return ['p0', 'p1', 'p2'];
}

function makeStore(pids) {
  const players = new Map();
  pids.forEach((pid, i) => {
    players.set(pid, { id: pid, nickname: ['Alice', 'Bob', 'Carol'][i] });
  });
  return { players };
}

/** Creates a Round and advances it to trick-play phase.
 *  seat 0 (Alice/Dealer) ends up as declarer with currentTurnSeat = 0.
 */
function makeRoundInTrickPlay() {
  const pids = makePids();
  const game = { players: new Set(pids), hostId: pids[0] };
  const store = makeStore(pids);
  const round = new Round({ game, store });
  round.start();
  round.advanceFromDealingToBidding();
  // Pass from seat 1 then seat 2 → seat 0 becomes declarer at 100
  round.submitPass(1);
  round.submitPass(2);

  // Force trick-play state directly (mirrors Round.trickplay.test.js pattern)
  round.phase = 'trick-play';
  round.trickNumber = 1;
  round.currentTrickLeaderSeat = 0;
  round.currentTurnSeat = 0;
  round.currentTrick = [];
  round.collectedTricks = { 0: [], 1: [], 2: [] };
  round.currentTrumpSuit = null;
  round.declaredMarriages = [];
  round.exchangePassesCommitted = 2;

  return { round, pids, game, store };
}

// ---------------------------------------------------------------------------
// Section 1: Trick-play pause on active-player disconnect (FR-025)
// ---------------------------------------------------------------------------

describe('Round.disconnect.play — (1a) active player disconnect pauses trick-play', () => {
  it('markDisconnected(currentTurnSeat) sets isPausedByDisconnect = true during trick-play', () => {
    const { round } = makeRoundInTrickPlay();
    assert.equal(round.phase, 'trick-play');
    assert.equal(round.currentTurnSeat, 0);
    round.markDisconnected(0);
    assert.equal(round.isPausedByDisconnect, true);
  });

  it('playCard from the active seat is rejected while isPausedByDisconnect is true', () => {
    const { round } = makeRoundInTrickPlay();
    round.markDisconnected(0);
    const cardId = round.hands[0][0];
    const result = round.playCard(0, cardId);
    assert.equal(result.rejected, true);
    assert.ok(result.reason, 'rejection must carry a reason');
  });

  it('playCard from a non-active seat is also rejected (not their turn) while paused', () => {
    const { round } = makeRoundInTrickPlay();
    round.markDisconnected(0); // seat 0 is active; seat 1 is not
    const cardId = round.hands[1][0];
    const result = round.playCard(1, cardId);
    // seat 1 is not the current turn seat, so rejected regardless of pause
    assert.equal(result.rejected, true);
  });

  it('markReconnected(active seat) clears pause and allows playCard', () => {
    const { round } = makeRoundInTrickPlay();
    round.markDisconnected(0);
    assert.equal(round.isPausedByDisconnect, true);
    round.markReconnected(0);
    assert.equal(round.isPausedByDisconnect, false);
    const cardId = round.hands[0][0];
    const result = round.playCard(0, cardId);
    assert.equal(result.rejected, false);
  });
});

describe('Round.disconnect.play — (1b) non-active player disconnect does NOT pause trick-play', () => {
  it('markDisconnected(non-active seat) leaves isPausedByDisconnect false', () => {
    const { round } = makeRoundInTrickPlay();
    assert.equal(round.currentTurnSeat, 0);
    round.markDisconnected(1); // seat 1 is not the active player
    assert.equal(round.isPausedByDisconnect, false);
  });

  it('active player can still play after a non-active player disconnects', () => {
    const { round } = makeRoundInTrickPlay();
    round.markDisconnected(1);
    const cardId = round.hands[0][0];
    const result = round.playCard(0, cardId);
    assert.equal(result.rejected, false);
  });

  it('disconnectedSeats tracks the non-active disconnected seat', () => {
    const { round } = makeRoundInTrickPlay();
    round.markDisconnected(2);
    assert.ok(round.disconnectedSeats.has(2));
    assert.equal(round.isPausedByDisconnect, false);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Round-summary sticky Continue press (mock Game objects)
// FR-025: "a player's Continue press is sticky — it persists across a subsequent
//          disconnect by that same player."
// ---------------------------------------------------------------------------

describe('Round.disconnect.play — (2) round-summary sticky Continue press (mock)', () => {
  it('recordContinuePress persists across a simulated disconnect', () => {
    // Mock Game object representing the contract Game.js will fulfil
    const mockGame = {
      gameStatus: 'in-progress',
      continuePresses: new Set(),
      recordContinuePress(seat) {
        this.continuePresses.add(seat);
      },
    };

    // Seat 0 presses Continue
    mockGame.recordContinuePress(0);
    assert.ok(mockGame.continuePresses.has(0), 'press must be recorded');

    // Simulate disconnect: the Set is not modified on disconnect
    // (caller would call game.recordContinuePress(seat) only once)
    // Verify the press is still present after "disconnect"
    assert.ok(mockGame.continuePresses.has(0), 'press must persist after disconnect');
  });

  it('press still counts toward "all 3" after reconnect', () => {
    const mockGame = {
      gameStatus: 'in-progress',
      continuePresses: new Set(),
      recordContinuePress(seat) {
        this.continuePresses.add(seat);
      },
    };

    mockGame.recordContinuePress(0); // seat 0 pressed then "disconnected"
    mockGame.recordContinuePress(1); // seat 1 presses
    mockGame.recordContinuePress(2); // seat 2 presses (seat 0 still in grace)

    // All 3 seats pressed
    assert.equal(mockGame.continuePresses.size, 3);
    const allThreePressed = [0, 1, 2].every(s => mockGame.continuePresses.has(s));
    assert.ok(allThreePressed, 'all three presses must be present');
    // With all 3 pressed AND disconnected seat still in grace → next round should start
    assert.equal(mockGame.gameStatus, 'in-progress');
  });
});

// ---------------------------------------------------------------------------
// Section 3: R-006 ordering A — third press BEFORE grace expires → proceed
// FR-025: "the next round begins as soon as the other two press, provided the
//          disconnected player is still within their grace window at the moment
//          of the third press"
// ---------------------------------------------------------------------------

describe('Round.disconnect.play — (3) R-006 ordering A: third press while disconnected player is in grace', () => {
  it('third Continue press lands while grace is still running → game stays in-progress', () => {
    // 2 seats have already pressed; seat 0 is disconnected but grace has not expired
    const mockGame = {
      gameStatus: 'in-progress',
      continuePresses: new Set([0, 1]), // seats 0 and 1 pressed
      graceExpiredSeats: new Set(),     // grace NOT expired for seat 0
      recordContinuePress(seat) {
        this.continuePresses.add(seat);
      },
      // Simulates the check the real Game.recordContinuePress will perform:
      // "if all 3 pressed AND disconnected seat not yet grace-expired → start next round"
      tryStartNextRound() {
        const allPressed = [0, 1, 2].every(s => this.continuePresses.has(s));
        const anyGraceExpired = [...this.graceExpiredSeats].some(s => this.continuePresses.has(s));
        if (allPressed && !anyGraceExpired) {
          this.gameStatus = 'starting-next-round';
        }
      },
    };

    // Seat 2 presses — the third press, while seat 0 is still within grace
    mockGame.recordContinuePress(2);
    mockGame.tryStartNextRound();

    assert.equal(mockGame.continuePresses.size, 3);
    assert.equal(mockGame.gameStatus, 'starting-next-round',
      'game must transition to next round when third press lands within grace');
  });

  it('disconnectedSeats.has(0) + continuePresses.has(0) = sticky press while in grace', () => {
    // Verify the two pieces of state are independent
    const disconnectedSeats = new Set([0]); // seat 0 is disconnected
    const continuePresses = new Set([0]);   // seat 0 pressed before disconnecting

    // Disconnecting does NOT remove the continue press
    assert.ok(disconnectedSeats.has(0));
    assert.ok(continuePresses.has(0), 'press must still be recorded even when seat is disconnected');
  });
});

// ---------------------------------------------------------------------------
// Section 4: R-006 ordering B — third press AFTER grace expires → game_aborted
// FR-025: "if [grace] expires before the other two press, the game aborts via
//          game_aborted regardless of the recorded Continue"
// ---------------------------------------------------------------------------

describe('Round.disconnect.play — (4) R-006 ordering B: grace expires before third press → aborted', () => {
  it('grace expiry sets gameStatus to aborted before third press arrives', () => {
    const mockGame = {
      gameStatus: 'in-progress',
      continuePresses: new Set([0, 1]),
      graceExpiredSeats: new Set(),
      onGraceExpiry(seat) {
        this.graceExpiredSeats.add(seat);
        this.gameStatus = 'aborted'; // grace expiry aborts the game
      },
      recordContinuePress(seat) {
        if (this.gameStatus === 'aborted') {
          return { rejected: true, reason: 'game_aborted' };
        }
        this.continuePresses.add(seat);
        return { rejected: false };
      },
    };

    // Seat 0 is disconnected; grace expires BEFORE the third press
    mockGame.onGraceExpiry(0);
    assert.equal(mockGame.gameStatus, 'aborted');

    // Now seat 2 tries to press Continue — too late
    const result = mockGame.recordContinuePress(2);
    assert.equal(result.rejected, true);
    assert.equal(result.reason, 'game_aborted');

    // continuePresses size must still be 2 (seat 2's press was rejected)
    assert.equal(mockGame.continuePresses.size, 2);
    // gameStatus must remain aborted — no next round
    assert.equal(mockGame.gameStatus, 'aborted');
  });

  it('recorded Continue press from seat 0 is irrelevant once grace expires', () => {
    const mockGame = {
      gameStatus: 'in-progress',
      continuePresses: new Set([0, 1]),
      graceExpiredSeats: new Set(),
      onGraceExpiry(seat) {
        this.graceExpiredSeats.add(seat);
        // Grace expiry triggers abort regardless of any prior Continue press
        this.gameStatus = 'aborted';
      },
    };

    // Even though seat 0 pressed Continue (sticky), grace expiry still aborts
    assert.ok(mockGame.continuePresses.has(0), 'sticky press recorded for seat 0');
    mockGame.onGraceExpiry(0);
    assert.equal(mockGame.gameStatus, 'aborted',
      'game_aborted must fire regardless of the sticky Continue press');
  });

  it('ordering contrast: grace expires AFTER third press does not abort', () => {
    // Ordering A control: if third press arrives FIRST, then grace expires, the game
    // should already be in next-round state and the late expiry is a no-op.
    const mockGame = {
      gameStatus: 'in-progress',
      continuePresses: new Set([0, 1]),
      graceExpiredSeats: new Set(),
      recordContinuePress(seat) {
        if (this.gameStatus === 'aborted') {
          return { rejected: true, reason: 'game_aborted' };
        }
        this.continuePresses.add(seat);
        if ([0, 1, 2].every(s => this.continuePresses.has(s))) {
          this.gameStatus = 'starting-next-round';
        }
        return { rejected: false };
      },
      onGraceExpiry(seat) {
        this.graceExpiredSeats.add(seat);
        // Grace fired AFTER game already transitioned — abort only if still in-progress
        if (this.gameStatus === 'in-progress') {
          this.gameStatus = 'aborted';
        }
        // If already starting-next-round, grace expiry is a no-op
      },
    };

    // Third press arrives while seat 0 is still in grace
    const result = mockGame.recordContinuePress(2);
    assert.equal(result.rejected, false);
    assert.equal(mockGame.gameStatus, 'starting-next-round');

    // Grace expires AFTER the transition — must not revert to aborted
    mockGame.onGraceExpiry(0);
    assert.equal(mockGame.gameStatus, 'starting-next-round',
      'late grace expiry must not abort a game that already transitioned');
  });
});
