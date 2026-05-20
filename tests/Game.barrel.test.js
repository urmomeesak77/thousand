'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/services/Game');
const Round = require('../src/services/Round');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGame({ dealerSeat = 0 } = {}) {
  return new Game({
    gameId: 'barrel-test',
    seatOrder: ['p0', 'p1', 'p2'],
    dealerSeat,
  });
}

/**
 * Build a minimal summaryEntry for applyRoundEnd.
 * perPlayer values are approximations — barrel tests only care about
 * the barrelState and cumulativeScores side-effects.
 */
function makeSummary(roundNumber, declarerSeat, bid, perPlayer) {
  return {
    roundNumber,
    declarerSeat,
    declarerNickname: `Player${declarerSeat}`,
    bid,
    perPlayer,
  };
}

/**
 * Helper: drive a game to a given set of cumulative scores by applying a
 * single artificial round-end so we can start testing from a known state.
 * Returns the game.
 */
function makeGameAtScores(scores) {
  const game = makeGame();
  // scores = { 0: n, 1: n, 2: n }
  const deltas = scores;
  const perPlayer = {};
  for (const seat of [0, 1, 2]) {
    perPlayer[seat] = {
      trickPoints: Math.max(0, scores[seat]),
      marriageBonus: 0,
      delta: scores[seat],
      cumulativeAfter: scores[seat],
      penalties: [],
    };
  }
  game.applyRoundEnd(deltas, makeSummary(1, 0, 100, perPlayer));
  return game;
}

// ---------------------------------------------------------------------------
// Round factory for bidding/selling integration tests.
// game.session is the Game instance (or fake) carrying barrelState.
// ---------------------------------------------------------------------------

function makeRound(gameSession = null) {
  const pids = ['p0', 'p1', 'p2'];
  const game = { players: new Set(pids), session: gameSession };
  const store = {
    players: new Map([
      ['p0', { nickname: 'Dealer' }],
      ['p1', { nickname: 'P1' }],
      ['p2', { nickname: 'P2' }],
    ]),
  };
  const round = new Round({ game, store });
  round.start();
  round.advanceFromDealingToBidding();
  return round;
}

/**
 * Build a fake game session with explicit barrel states.
 * barrelOverrides: { [seat]: { onBarrel, barrelRoundsUsed } }
 */
function fakeSession(barrelOverrides = {}) {
  return {
    barrelState: {
      0: { onBarrel: false, barrelRoundsUsed: 0, ...barrelOverrides[0] },
      1: { onBarrel: false, barrelRoundsUsed: 0, ...barrelOverrides[1] },
      2: { onBarrel: false, barrelRoundsUsed: 0, ...barrelOverrides[2] },
    },
  };
}

// Advance a fresh round to selling-bidding phase with seat 0 as declarer.
// seat 1 and seat 2 both pass → dealer (seat 0) is auto-declarer at 100.
// Then seat 0 starts selling and commits 3 cards.
function makeSellBiddingRound(gameSession = null) {
  const round = makeRound(gameSession);
  round.submitPass(1);
  round.submitPass(2);
  // Now in post-bid-decision, declarer = seat 0
  round.startSelling(0);
  round.commitSellSelection(0, [2, 6, 10]);
  // Now in selling-bidding, currentTurnSeat = seat 1
  return round;
}

// ---------------------------------------------------------------------------
// Suite 1 — Game.applyRoundEnd: barrel entry/exit (FR-021)
// ---------------------------------------------------------------------------

describe('Game.applyRoundEnd — barrel entry/exit (FR-021)', () => {
  it('score crossing into [880,1000) sets onBarrel=true and barrelRoundsUsed stays 0 (fresh entry)', () => {
    // Start from score 800 for seat 0, then add +100 → 900 (inside barrel range).
    const game = makeGameAtScores({ 0: 800, 1: 0, 2: 0 });

    // Confirm not on barrel yet
    assert.equal(game.barrelState[0].onBarrel, false);

    // Round 2: seat 0 gets +100 → cumulative = 900
    const deltas = { 0: 100, 1: 0, 2: 0 };
    const perPlayer = {
      0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 900, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(2, 0, 100, perPlayer));

    assert.equal(game.cumulativeScores[0], 900);
    assert.equal(game.barrelState[0].onBarrel, true, 'seat 0 should be on barrel at 900');
    assert.equal(game.barrelState[0].barrelRoundsUsed, 0, 'fresh barrel entry: barrelRoundsUsed must be 0');
  });

  it('score at exactly 880 sets onBarrel=true', () => {
    const game = makeGameAtScores({ 0: 780, 1: 0, 2: 0 });

    const deltas = { 0: 100, 1: 0, 2: 0 };
    const perPlayer = {
      0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 880, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(2, 0, 100, perPlayer));

    assert.equal(game.cumulativeScores[0], 880);
    assert.equal(game.barrelState[0].onBarrel, true, 'score 880 is the lower bound of barrel range');
  });

  it('score at exactly 999 stays on barrel', () => {
    const game = makeGameAtScores({ 0: 900, 1: 0, 2: 0 });
    // Force onBarrel=true so we start from a barrel state
    game.barrelState[0].onBarrel = true;

    const deltas = { 0: 99, 1: 0, 2: 0 };
    const perPlayer = {
      0: { trickPoints: 99, marriageBonus: 0, delta: 99, cumulativeAfter: 999, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(2, 0, 100, perPlayer));

    assert.equal(game.cumulativeScores[0], 999);
    assert.equal(game.barrelState[0].onBarrel, true, 'score 999 is still inside barrel range');
  });

  it('score dropping below 880 (after missing bid) clears onBarrel=false, resets barrelRoundsUsed=0', () => {
    // Start on barrel at 900
    const game = makeGameAtScores({ 0: 900, 1: 0, 2: 0 });
    game.barrelState[0].onBarrel = true;
    game.barrelState[0].barrelRoundsUsed = 2;

    // Seat 0 misses bid: -100 → cumulative = 800
    const deltas = { 0: -100, 1: 0, 2: 0 };
    const perPlayer = {
      0: { trickPoints: 0, marriageBonus: 0, delta: -100, cumulativeAfter: 800, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(2, 0, 100, perPlayer));

    assert.equal(game.cumulativeScores[0], 800);
    assert.equal(game.barrelState[0].onBarrel, false, 'score 800 is below barrel range');
    assert.equal(game.barrelState[0].barrelRoundsUsed, 0, 'barrelRoundsUsed must be reset on exit');
  });

  it('score reaching 1000+ exits barrel (onBarrel=false)', () => {
    const game = makeGameAtScores({ 0: 950, 1: 0, 2: 0 });
    game.barrelState[0].onBarrel = true;
    game.barrelState[0].barrelRoundsUsed = 1;

    // Seat 0 wins and reaches 1000
    const deltas = { 0: 50, 1: 0, 2: 0 };
    const perPlayer = {
      0: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 1000, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(2, 0, 100, perPlayer));

    assert.equal(game.cumulativeScores[0], 1000);
    assert.equal(game.barrelState[0].onBarrel, false, 'score ≥ 1000 exits barrel (game-over handled externally)');
    assert.equal(game.barrelState[0].barrelRoundsUsed, 0, 'barrelRoundsUsed reset when exiting barrel');
  });

  it('player re-entering barrel after exit restarts barrelRoundsUsed at 0', () => {
    // Start on barrel, exit, then re-enter
    const game = makeGameAtScores({ 0: 900, 1: 0, 2: 0 });
    game.barrelState[0].onBarrel = true;
    game.barrelState[0].barrelRoundsUsed = 2;

    // Exit barrel: -100 → 800
    const exitDeltas = { 0: -100, 1: 0, 2: 0 };
    const exitPerPlayer = {
      0: { trickPoints: 0, marriageBonus: 0, delta: -100, cumulativeAfter: 800, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(exitDeltas, makeSummary(2, 0, 100, exitPerPlayer));

    assert.equal(game.barrelState[0].onBarrel, false);
    assert.equal(game.barrelState[0].barrelRoundsUsed, 0);

    // Re-enter barrel: +100 → 900
    const reEntryDeltas = { 0: 100, 1: 0, 2: 0 };
    const reEntryPerPlayer = {
      0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 900, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(reEntryDeltas, makeSummary(3, 0, 100, reEntryPerPlayer));

    assert.equal(game.barrelState[0].onBarrel, true, 're-entered barrel');
    assert.equal(game.barrelState[0].barrelRoundsUsed, 0, 'barrelRoundsUsed starts at 0 on re-entry');
  });

  it('invariant: barrelState[seat].onBarrel === (score >= 880 && score < 1000) after applyRoundEnd', () => {
    // Test several score values and verify the invariant holds.
    const cases = [
      { score: 0, expected: false },
      { score: 879, expected: false },
      { score: 880, expected: true },
      { score: 940, expected: true },
      { score: 999, expected: true },
      { score: 1000, expected: false },
      { score: 1100, expected: false },
    ];

    for (const { score, expected } of cases) {
      const game = makeGame();
      const deltas = { 0: score, 1: 0, 2: 0 };
      const perPlayer = {
        0: { trickPoints: Math.max(0, score), marriageBonus: 0, delta: score, cumulativeAfter: score, penalties: [] },
        1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
        2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      };
      game.applyRoundEnd(deltas, makeSummary(1, 0, 100, perPlayer));
      assert.equal(
        game.barrelState[0].onBarrel,
        expected,
        `score ${score} → onBarrel should be ${expected}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Game.applyRoundEnd: barrel counter and penalty (FR-023)
// NOTE: These tests WILL FAIL until T086 implements the barrel counter/penalty logic.
// ---------------------------------------------------------------------------

describe('Game.applyRoundEnd — barrel counter and penalty (FR-023)', () => {
  it('round 1 on barrel: barrelRoundsUsed advances from 0 to 1', () => {
    // Seat 1 is on barrel at 900, barrelRoundsUsed = 0. After this round end it should be 1.
    const game = makeGame();
    game.cumulativeScores[1] = 900;
    game.barrelState[1].onBarrel = true;
    game.barrelState[1].barrelRoundsUsed = 0;

    const deltas = { 0: 0, 1: 0, 2: 0 }; // no score change for seat 1
    const perPlayer = {
      0: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 900, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(2, 0, 100, perPlayer));

    assert.equal(game.barrelState[1].onBarrel, true, 'still on barrel');
    assert.equal(game.barrelState[1].barrelRoundsUsed, 1, 'counter must advance from 0 to 1');
  });

  it('round 2 on barrel: barrelRoundsUsed advances from 1 to 2', () => {
    const game = makeGame();
    game.cumulativeScores[1] = 900;
    game.barrelState[1].onBarrel = true;
    game.barrelState[1].barrelRoundsUsed = 1;

    const deltas = { 0: 0, 1: 0, 2: 0 };
    const perPlayer = {
      0: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 900, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(3, 0, 100, perPlayer));

    assert.equal(game.barrelState[1].onBarrel, true, 'still on barrel');
    assert.equal(game.barrelState[1].barrelRoundsUsed, 2, 'counter must advance from 1 to 2');
  });

  it('round 3 on barrel (counter reaches 3) with score still in [880,1000): penalty −120 applied, barrelRoundsUsed resets to 0', () => {
    // Seat 1 at 900, barrelRoundsUsed=2. After this round: counter would reach 3 → penalty fires.
    // 900 + 0 (no delta this round) = 900, then −120 penalty → 780. barrelRoundsUsed resets to 0.
    const game = makeGame();
    game.cumulativeScores[1] = 900;
    game.barrelState[1].onBarrel = true;
    game.barrelState[1].barrelRoundsUsed = 2;

    const deltas = { 0: 0, 1: 0, 2: 0 };
    const perPlayer = {
      0: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 780, penalties: [{ type: 'barrel', amount: -120 }] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(4, 0, 100, perPlayer));

    // Post-penalty score for seat 1 should be 780 (below barrel range)
    assert.equal(game.cumulativeScores[1], 780, 'penalty −120 must be applied: 900 − 120 = 780');
    assert.equal(game.barrelState[1].onBarrel, false, '780 < 880 → no longer on barrel');
    assert.equal(game.barrelState[1].barrelRoundsUsed, 0, 'barrelRoundsUsed must reset after penalty');
  });

  it('round 3 on barrel but score reaches 1000+ on its own this round: no penalty fires, barrel exits normally', () => {
    // Seat 0 at 950, barrelRoundsUsed=2. Gets +50 this round → 1000 ≥ 1000 → exits barrel naturally.
    // Because score leaves barrel range (≥ 1000), no penalty is applied.
    const game = makeGame();
    game.cumulativeScores[0] = 950;
    game.barrelState[0].onBarrel = true;
    game.barrelState[0].barrelRoundsUsed = 2;

    const deltas = { 0: 50, 1: 0, 2: 0 };
    const perPlayer = {
      0: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 1000, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(4, 0, 100, perPlayer));

    assert.equal(game.cumulativeScores[0], 1000, 'no penalty: score reached 1000 naturally');
    assert.equal(game.barrelState[0].onBarrel, false, 'score ≥ 1000 exits barrel');
    // barrelRoundsUsed should be 0 after exit (existing exit logic resets it)
    assert.equal(game.barrelState[0].barrelRoundsUsed, 0);
  });

  it('after barrel penalty: score 920 − 120 = 800 exits barrel and resets counter', () => {
    // With a −120 penalty, any score in [880, 999] drops to [760, 879] — below barrel range.
    // (Post-penalty ≥ 880 is unreachable because that would require pre-penalty ≥ 1000, which is already game-over.)
    // This test confirms the expected exit behavior when the penalty fires.
    const game = makeGame();
    game.cumulativeScores[2] = 920;
    game.barrelState[2].onBarrel = true;
    game.barrelState[2].barrelRoundsUsed = 2;

    // Delta = 0, counter reaches 3, penalty: 920 − 120 = 800 < 880 → exits barrel
    const deltas = { 0: 0, 1: 0, 2: 0 };
    const perPlayer = {
      0: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 800, penalties: [{ type: 'barrel', amount: -120 }] },
    };
    game.applyRoundEnd(deltas, makeSummary(4, 0, 100, perPlayer));

    assert.equal(game.cumulativeScores[2], 800, 'penalty −120 applied: 920 − 120 = 800');
    assert.equal(game.barrelState[2].onBarrel, false, '800 < 880 → exits barrel');
    assert.equal(game.barrelState[2].barrelRoundsUsed, 0, 'counter reset after penalty');
  });

  it('two players on barrel simultaneously: each has an independent counter', () => {
    // Seat 0 and seat 1 both on barrel; seat 0 is barrelRoundsUsed=1, seat 1 is barrelRoundsUsed=0.
    // After this round both should advance independently.
    const game = makeGame();
    game.cumulativeScores[0] = 900;
    game.cumulativeScores[1] = 890;
    game.barrelState[0].onBarrel = true;
    game.barrelState[0].barrelRoundsUsed = 1;
    game.barrelState[1].onBarrel = true;
    game.barrelState[1].barrelRoundsUsed = 0;

    const deltas = { 0: 0, 1: 0, 2: 0 };
    const perPlayer = {
      0: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 900, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 890, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(3, 0, 100, perPlayer));

    assert.equal(game.barrelState[0].onBarrel, true, 'seat 0 still on barrel');
    assert.equal(game.barrelState[0].barrelRoundsUsed, 2, 'seat 0 counter: 1 → 2');
    assert.equal(game.barrelState[1].onBarrel, true, 'seat 1 still on barrel');
    assert.equal(game.barrelState[1].barrelRoundsUsed, 1, 'seat 1 counter: 0 → 1');
    // seat 2 untouched
    assert.equal(game.barrelState[2].onBarrel, false);
    assert.equal(game.barrelState[2].barrelRoundsUsed, 0);
  });

  it('counter does NOT advance for a player not on barrel', () => {
    // Seat 2 is not on barrel. barrelRoundsUsed should remain 0 after round end.
    const game = makeGame();
    game.cumulativeScores[2] = 500;
    game.barrelState[2].onBarrel = false;
    game.barrelState[2].barrelRoundsUsed = 0;

    const deltas = { 0: 0, 1: 0, 2: 50 };
    const perPlayer = {
      0: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 550, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(2, 0, 100, perPlayer));

    assert.equal(game.barrelState[2].onBarrel, false, 'not on barrel');
    assert.equal(game.barrelState[2].barrelRoundsUsed, 0, 'counter must not advance for non-barrel players');
  });

  it('penalty fires before history is appended (cumulativeAfter in history reflects post-penalty score)', () => {
    // This is a structural test: the summaryEntry's cumulativeAfter must equal the score
    // AFTER the penalty has been deducted, not before.
    // We set up seat 0 with barrelRoundsUsed=2 at score 880.
    // After this round (delta 0), counter → 3, penalty −120 → 760.
    // The summaryEntry.perPlayer[0].cumulativeAfter should be 760 in the history.
    const game = makeGame();
    game.cumulativeScores[0] = 880;
    game.barrelState[0].onBarrel = true;
    game.barrelState[0].barrelRoundsUsed = 2;

    const deltas = { 0: 0, 1: 0, 2: 0 };
    // cumulativeAfter is pre-set to 760 (post-penalty). The implementation must apply the −120
    // penalty to cumulativeScores BEFORE appending to history, so the history entry
    // reflects the post-penalty score.
    const perPlayer = {
      0: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 760, penalties: [{ type: 'barrel', amount: -120 }] },
      1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
    };
    game.applyRoundEnd(deltas, makeSummary(3, 0, 100, perPlayer));

    assert.equal(game.cumulativeScores[0], 760, 'penalty −120 applied before history append');
    // History is appended after penalty: cumulativeAfter in the history entry should be 760
    assert.equal(game.history.length, 1);
    assert.equal(
      game.history[0].perPlayer[0].cumulativeAfter,
      760,
      'history entry cumulativeAfter must equal post-penalty score'
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Round.submitBid: barrel bid-floor (FR-022)
// NOTE: These tests WILL FAIL until T087 implements the barrel bid-floor in Round.submitBid.
// ---------------------------------------------------------------------------

describe('Round.submitBid — barrel bid-floor (FR-022)', () => {
  it('barrel player (seat 1, onBarrel=true): bid of 100 is REJECTED with reason mentioning 120', () => {
    const session = fakeSession({ 1: { onBarrel: true, barrelRoundsUsed: 1 } });
    const round = makeRound(session);

    const result = round.submitBid(1, 100);
    assert.equal(result.rejected, true, 'barrel player bid of 100 must be rejected');
    assert.ok(result.reason, 'rejection must include a reason');
    assert.ok(
      result.reason.includes('120'),
      `reason must mention 120; got: "${result.reason}"`
    );
  });

  it('barrel player (seat 1, onBarrel=true): bid of 115 is REJECTED', () => {
    const session = fakeSession({ 1: { onBarrel: true, barrelRoundsUsed: 0 } });
    const round = makeRound(session);

    const result = round.submitBid(1, 115);
    assert.equal(result.rejected, true, 'barrel player bid of 115 must be rejected');
    assert.ok(result.reason.includes('120'), `reason must mention 120; got: "${result.reason}"`);
  });

  it('barrel player (seat 1, onBarrel=true): bid of 120 is ACCEPTED', () => {
    const session = fakeSession({ 1: { onBarrel: true, barrelRoundsUsed: 0 } });
    const round = makeRound(session);

    const result = round.submitBid(1, 120);
    assert.equal(result.rejected, false, 'barrel player bid of 120 must be accepted');
    assert.equal(round.currentHighBid, 120);
  });

  it('barrel player (seat 1, onBarrel=true): bid of 125 is ACCEPTED', () => {
    const session = fakeSession({ 1: { onBarrel: true, barrelRoundsUsed: 0 } });
    const round = makeRound(session);

    const result = round.submitBid(1, 125);
    assert.equal(result.rejected, false, 'barrel player bid of 125 must be accepted');
    assert.equal(round.currentHighBid, 125);
  });

  it('non-barrel player (seat 1, onBarrel=false): bid of 100 is ACCEPTED (normal floor still applies)', () => {
    const session = fakeSession({ 1: { onBarrel: false, barrelRoundsUsed: 0 } });
    const round = makeRound(session);

    const result = round.submitBid(1, 100);
    assert.equal(result.rejected, false, 'non-barrel player bid of 100 is accepted at normal floor');
    assert.equal(round.currentHighBid, 100);
  });

  it('barrel player (seat 1, onBarrel=true): submitPass is ACCEPTED (pass is always legal)', () => {
    const session = fakeSession({ 1: { onBarrel: true, barrelRoundsUsed: 2 } });
    const round = makeRound(session);

    const result = round.submitPass(1);
    assert.equal(result.rejected, false, 'barrel player can always pass');
    assert.ok(round.passedBidders.has(1), 'seat 1 should be in passedBidders');
  });

  it('barrel player (seat 1): bid of 120 accepted even when a prior non-barrel bid of 100 exists', () => {
    // seat 1 is on barrel; seat 2 bid 100 before seat 1's turn via turn manipulation.
    // Actually in normal turn order seat 1 goes first. Let's test after seat 2 bids 100
    // on a later turn. We need seat 1 to be barrel and have turn come around.
    // Simplest: seat 1 is barrel, bids 120 as first bidder (their turn).
    // Already covered above. Let's test: someone else bids 100, barrel player must bid >= 120.
    // But seat 1 goes first, so no prior bid. Let's test seat 0 as barrel player.
    // Seat 1 bids 100 (non-barrel). Then seat 2's turn... not barrel either.
    // Instead: set seat 0 as barrel, seat 1 bids 100, seat 2 bids 105, seat 0 must bid >= 120.
    const session = fakeSession({ 0: { onBarrel: true, barrelRoundsUsed: 0 } });
    const round = makeRound(session);

    // seat 1 (not barrel) bids 100, seat 2 (not barrel) bids 105, now seat 0's turn
    round.submitBid(1, 100); // currentHighBid = 100, turn → seat 2
    round.submitBid(2, 105); // currentHighBid = 105, turn → seat 0

    // barrel seat 0 must bid at least 120 (barrel floor overrides the "currentHighBid + 5 = 110" floor)
    const result110 = round.submitBid(0, 110);
    assert.equal(result110.rejected, true, 'barrel player bid of 110 rejected even though 110 > currentHighBid+5');

    const result120 = round.submitBid(0, 120);
    assert.equal(result120.rejected, false, 'barrel player bid of 120 accepted');
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Round.submitSellBid: barrel bid-floor (FR-022)
// NOTE: These tests WILL FAIL until T088 implements barrel floor in Round.submitSellBid.
// ---------------------------------------------------------------------------

describe('Round.submitSellBid — barrel bid-floor (FR-022)', () => {
  it('barrel player bidding in sell auction: bid of 105 (above normal floor, below barrel floor) is REJECTED with reason mentioning 120', () => {
    // seat 1 is on barrel; seat 1 is the first sell-bidder (clockwise-left of declarer seat 0).
    // makeSellBiddingRound uses all-pass scenario: currentHighBid = 100.
    // Normal floor for sell bid = currentHighBid + 5 = 105. Barrel floor = 120.
    // A bid of 105 is above the normal floor but below the barrel floor → must be rejected
    // specifically because of the barrel rule (not the normal floor).
    const session = fakeSession({ 1: { onBarrel: true, barrelRoundsUsed: 0 } });
    const round = makeSellBiddingRound(session);

    // currentTurnSeat should be 1 (clockwise-left of declarer 0)
    assert.equal(round.currentTurnSeat, 1);

    const result = round.submitSellBid(1, 105);
    assert.equal(result.rejected, true, 'barrel player sell-bid of 105 must be rejected (barrel floor is 120)');
    assert.ok(result.reason, 'rejection must include a reason');
    assert.ok(
      result.reason.includes('120'),
      `reason must mention 120; got: "${result.reason}"`
    );
  });

  it('barrel player in sell auction: bid of 120 is ACCEPTED', () => {
    const session = fakeSession({ 1: { onBarrel: true, barrelRoundsUsed: 0 } });
    const round = makeSellBiddingRound(session);

    const result = round.submitSellBid(1, 120);
    assert.equal(result.rejected, false, 'barrel player sell-bid of 120 must be accepted');
  });

  it('non-barrel player in sell auction: bid at normal floor (105) is ACCEPTED (barrel floor does not apply)', () => {
    // makeSellBiddingRound uses the all-pass scenario: currentHighBid = 100.
    // The normal sell-bid floor is currentHighBid + 5 = 105.
    // A non-barrel player bidding 105 is accepted; barrel floor (120) does not apply to them.
    const session = fakeSession({ 1: { onBarrel: false, barrelRoundsUsed: 0 } });
    const round = makeSellBiddingRound(session);

    const result = round.submitSellBid(1, 105);
    assert.equal(result.rejected, false, 'non-barrel player sell-bid of 105 is accepted (barrel floor does not apply)');
  });

  it('barrel player in sell auction: bid of 115 is REJECTED', () => {
    const session = fakeSession({ 1: { onBarrel: true, barrelRoundsUsed: 1 } });
    const round = makeSellBiddingRound(session);

    const result = round.submitSellBid(1, 115);
    assert.equal(result.rejected, true, 'barrel player sell-bid of 115 must be rejected');
    assert.ok(result.reason.includes('120'), `reason must mention 120; got: "${result.reason}"`);
  });

  it('barrel player in sell auction: bid of 125 is ACCEPTED', () => {
    const session = fakeSession({ 1: { onBarrel: true, barrelRoundsUsed: 0 } });
    const round = makeSellBiddingRound(session);

    const result = round.submitSellBid(1, 125);
    assert.equal(result.rejected, false, 'barrel player sell-bid of 125 must be accepted');
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Auto-declarer with barrel dealer (FR-022d)
// NOTE: These tests WILL FAIL until T089 implements the barrel 120 override in submitPass.
// ---------------------------------------------------------------------------

describe('Round.submitPass — auto-declarer barrel override (FR-022d)', () => {
  it('all 3 pass; dealer (seat 0) is on barrel → auto-declarer bid = 120 (not 100)', () => {
    const session = fakeSession({ 0: { onBarrel: true, barrelRoundsUsed: 1 } });
    const round = makeRound(session);

    // All 3 players pass in order: seat 1, seat 2, seat 0
    round.submitPass(1); // P1 passes; turn → seat 2
    round.submitPass(2); // P2 passes; remaining = [0] → resolution fires

    // Dealer (seat 0) is the last remaining player and is on barrel.
    // FR-022d: auto-declared bid must be 120 instead of 100.
    assert.equal(round.declarerSeat, 0, 'dealer (seat 0) must be the declarer');
    assert.equal(round.currentHighBid, 120, 'barrel dealer auto-declares at 120 (not 100)');
    assert.equal(round.phase, 'post-bid-decision');
  });

  it('all 3 pass; dealer (seat 0) is NOT on barrel → auto-declarer bid = 100', () => {
    const session = fakeSession({ 0: { onBarrel: false, barrelRoundsUsed: 0 } });
    const round = makeRound(session);

    round.submitPass(1);
    round.submitPass(2);

    assert.equal(round.declarerSeat, 0, 'dealer (seat 0) must be the declarer');
    assert.equal(round.currentHighBid, 100, 'non-barrel dealer auto-declares at 100');
    assert.equal(round.phase, 'post-bid-decision');
  });

  it('all 3 pass; dealer (seat 0) is on barrel with barrelRoundsUsed=0 → auto-bid = 120', () => {
    const session = fakeSession({ 0: { onBarrel: true, barrelRoundsUsed: 0 } });
    const round = makeRound(session);

    round.submitPass(1);
    round.submitPass(2);

    assert.equal(round.currentHighBid, 120, 'barrel dealer (fresh entry) auto-declares at 120');
  });

  it('all 3 pass; no game session attached → auto-declarer bid = 100 (graceful fallback)', () => {
    // When round has no session (no barrel info), normal behavior must apply.
    const round = makeRound(null);

    round.submitPass(1);
    round.submitPass(2);

    assert.equal(round.declarerSeat, 0);
    assert.equal(round.currentHighBid, 100, 'without session context, auto-declares at 100');
    assert.equal(round.phase, 'post-bid-decision');
  });

  it('P1 and P2 pass, dealer (seat 0) is on barrel, but P1 had already bid 120 before passing → declarerSeat is P1 or P2, not affected by barrel rule', () => {
    // P1 bids 120 (seat 1), P2 passes, seat 0 passes → seat 1 is declarer at 120.
    // Barrel rule only fires when currentHighBid is null (all-pass without any bid).
    const session = fakeSession({ 0: { onBarrel: true, barrelRoundsUsed: 0 } });
    const round = makeRound(session);

    round.submitBid(1, 120); // seat 1 bids 120; turn → seat 2
    round.submitPass(2);     // seat 2 passes; turn → seat 0
    round.submitPass(0);     // seat 0 passes; remaining = [1] → seat 1 is declarer

    assert.equal(round.declarerSeat, 1, 'seat 1 won the bid');
    assert.equal(round.currentHighBid, 120, 'bid remains 120 from P1');
    // Barrel override does NOT apply here because currentHighBid was already set
    assert.equal(round.phase, 'post-bid-decision');
  });
});
