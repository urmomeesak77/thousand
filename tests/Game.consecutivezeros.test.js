'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/services/Game');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGame() {
  return new Game({ gameId: 'g1', seatOrder: ['p0', 'p1', 'p2'], dealerSeat: 0 });
}

/**
 * Build a minimal summaryEntry for applyRoundEnd.
 * The round score for a seat = trickPoints + marriageBonus.
 * The zero-counter checks this value, NOT delta.
 */
function makeSummary({ roundNumber = 1, declarerSeat = 0, bid = 100, perPlayer } = {}) {
  return {
    roundNumber,
    declarerSeat,
    declarerNickname: 'Player0',
    bid,
    perPlayer: perPlayer ?? {
      0: { trickPoints: 50, marriageBonus: 0, delta: 100, cumulativeAfter: 100, penalties: [] },
      1: { trickPoints: 20, marriageBonus: 0, delta: 20,  cumulativeAfter: 20,  penalties: [] },
      2: { trickPoints: 30, marriageBonus: 0, delta: 30,  cumulativeAfter: 30,  penalties: [] },
    },
  };
}

// ---------------------------------------------------------------------------
// Suite 1: consecutiveZeros — counter advancement (FR-024)
// ---------------------------------------------------------------------------

describe('Game.applyRoundEnd — consecutiveZeros counter advancement (FR-024)', () => {
  it('round score > 0 for all seats: all counters stay at 0', () => {
    const game = makeGame();

    const deltas = { 0: 100, 1: 20, 2: 30 };
    const summary = makeSummary({
      perPlayer: {
        0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 100, penalties: [] },
        1: { trickPoints: 20,  marriageBonus: 0, delta: 20,  cumulativeAfter: 20,  penalties: [] },
        2: { trickPoints: 30,  marriageBonus: 0, delta: 30,  cumulativeAfter: 30,  penalties: [] },
      },
    });

    game.applyRoundEnd(deltas, summary);

    assert.equal(game.consecutiveZeros[0], 0, 'seat 0 counter stays at 0');
    assert.equal(game.consecutiveZeros[1], 0, 'seat 1 counter stays at 0');
    assert.equal(game.consecutiveZeros[2], 0, 'seat 2 counter stays at 0');
  });

  it('round score = 0 for seat 1, > 0 for others: only seat 1 counter advances to 1', () => {
    const game = makeGame();

    const deltas = { 0: 80, 1: 0, 2: 50 };
    const summary = makeSummary({
      perPlayer: {
        0: { trickPoints: 80, marriageBonus: 0, delta: 80, cumulativeAfter: 80,  penalties: [] },
        1: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 0,   penalties: [] },
        2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50,  penalties: [] },
      },
    });

    game.applyRoundEnd(deltas, summary);

    assert.equal(game.consecutiveZeros[0], 0, 'seat 0 counter stays at 0 (score > 0)');
    assert.equal(game.consecutiveZeros[1], 1, 'seat 1 counter advances to 1 (score = 0)');
    assert.equal(game.consecutiveZeros[2], 0, 'seat 2 counter stays at 0 (score > 0)');
  });

  it('round score = 0 for all three seats: all counters advance to 1', () => {
    const game = makeGame();

    const deltas = { 0: 0, 1: 0, 2: 0 };
    const summary = makeSummary({
      perPlayer: {
        0: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
        1: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
        2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      },
    });

    game.applyRoundEnd(deltas, summary);

    assert.equal(game.consecutiveZeros[0], 1, 'seat 0 counter advances to 1');
    assert.equal(game.consecutiveZeros[1], 1, 'seat 1 counter advances to 1');
    assert.equal(game.consecutiveZeros[2], 1, 'seat 2 counter advances to 1');
  });

  it('three consecutive zero rounds for seat 2: counter goes 0 → 1 → 2 → penalty fires (counter resets to 0)', () => {
    const game = makeGame();

    const zeroPerPlayer = (roundN, cumulative2) => ({
      0: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50 * roundN, penalties: [] },
      1: { trickPoints: 30, marriageBonus: 0, delta: 30, cumulativeAfter: 30 * roundN, penalties: [] },
      2: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: cumulative2,  penalties: [] },
    });

    // Round 1: seat 2 score = 0 → counter = 1
    game.applyRoundEnd(
      { 0: 50, 1: 30, 2: 0 },
      makeSummary({ roundNumber: 1, perPlayer: zeroPerPlayer(1, 0) })
    );
    assert.equal(game.consecutiveZeros[2], 1, 'after round 1: seat 2 counter = 1');

    // Round 2: seat 2 score = 0 → counter = 2
    game.applyRoundEnd(
      { 0: 50, 1: 30, 2: 0 },
      makeSummary({ roundNumber: 2, perPlayer: zeroPerPlayer(2, 0) })
    );
    assert.equal(game.consecutiveZeros[2], 2, 'after round 2: seat 2 counter = 2');

    // Round 3: seat 2 score = 0 → counter reaches 3 → penalty fires, counter resets to 0
    game.applyRoundEnd(
      { 0: 50, 1: 30, 2: 0 },
      makeSummary({
        roundNumber: 3,
        perPlayer: {
          0: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 150, penalties: [] },
          1: { trickPoints: 30, marriageBonus: 0, delta: 30, cumulativeAfter: 90,  penalties: [] },
          2: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: -120, penalties: [{ type: 'consecutiveZeros', amount: -120 }] },
        },
      })
    );
    assert.equal(game.consecutiveZeros[2], 0, 'after 3rd consecutive zero: counter resets to 0');
  });

  it('round score > 0 resets the counter: after two zeros for seat 0, a positive round resets to 0; next zero restarts at 1', () => {
    const game = makeGame();

    // Round 1: seat 0 score = 0 → counter = 1
    game.applyRoundEnd(
      { 0: 0, 1: 50, 2: 50 },
      makeSummary({
        roundNumber: 1,
        perPlayer: {
          0: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 0,  penalties: [] },
          1: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
          2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
        },
      })
    );
    assert.equal(game.consecutiveZeros[0], 1, 'after round 1: seat 0 counter = 1');

    // Round 2: seat 0 score = 0 → counter = 2
    game.applyRoundEnd(
      { 0: 0, 1: 50, 2: 50 },
      makeSummary({
        roundNumber: 2,
        perPlayer: {
          0: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 0,  penalties: [] },
          1: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 100, penalties: [] },
          2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 100, penalties: [] },
        },
      })
    );
    assert.equal(game.consecutiveZeros[0], 2, 'after round 2: seat 0 counter = 2');

    // Round 3: seat 0 score > 0 → counter RESETS to 0
    game.applyRoundEnd(
      { 0: 60, 1: 30, 2: 40 },
      makeSummary({
        roundNumber: 3,
        perPlayer: {
          0: { trickPoints: 60, marriageBonus: 0, delta: 60, cumulativeAfter: 60,  penalties: [] },
          1: { trickPoints: 30, marriageBonus: 0, delta: 30, cumulativeAfter: 130, penalties: [] },
          2: { trickPoints: 40, marriageBonus: 0, delta: 40, cumulativeAfter: 140, penalties: [] },
        },
      })
    );
    assert.equal(game.consecutiveZeros[0], 0, 'after positive round: seat 0 counter resets to 0');

    // Round 4: seat 0 score = 0 again → counter restarts at 1
    game.applyRoundEnd(
      { 0: 0, 1: 50, 2: 50 },
      makeSummary({
        roundNumber: 4,
        perPlayer: {
          0: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 60,  penalties: [] },
          1: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 180, penalties: [] },
          2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 190, penalties: [] },
        },
      })
    );
    assert.equal(game.consecutiveZeros[0], 1, 'after next zero: seat 0 counter restarts at 1');
  });

  it('marriage bonus counts as "not zero": trickPoints=0 but marriageBonus=60 → counter resets (round score = 60)', () => {
    // Seat 1 had counter at 1 from previous round. Now they have no tricks but a 60-point
    // marriage bonus. Round score = 0 + 60 = 60 ≠ 0 → counter must reset to 0.
    const game = makeGame();
    game.consecutiveZeros[1] = 1; // simulate prior zero round

    game.applyRoundEnd(
      { 0: 80, 1: 60, 2: 40 },
      makeSummary({
        roundNumber: 2,
        perPlayer: {
          0: { trickPoints: 80, marriageBonus: 0,  delta: 80, cumulativeAfter: 80,  penalties: [] },
          1: { trickPoints: 0,  marriageBonus: 60, delta: 60, cumulativeAfter: 60,  penalties: [] },
          2: { trickPoints: 40, marriageBonus: 0,  delta: 40, cumulativeAfter: 40,  penalties: [] },
        },
      })
    );

    assert.equal(
      game.consecutiveZeros[1],
      0,
      'marriageBonus=60 gives round score=60 ≠ 0 → counter must reset to 0'
    );
  });

  it('declarer who misses bid but has round score 0 (no tricks, no marriages): counter still advances', () => {
    // Seat 0 is the declarer. They scored 0 trick points and 0 marriage bonuses.
    // Their delta is -bid (they missed). But the zero-counter looks at round score
    // (trickPoints + marriageBonus = 0), NOT at delta. Counter must advance.
    const game = makeGame();

    game.applyRoundEnd(
      { 0: -100, 1: 60, 2: 40 },
      makeSummary({
        roundNumber: 1,
        declarerSeat: 0,
        bid: 100,
        perPlayer: {
          0: { trickPoints: 0,  marriageBonus: 0, delta: -100, cumulativeAfter: -100, penalties: [] },
          1: { trickPoints: 60, marriageBonus: 0, delta: 60,   cumulativeAfter: 60,   penalties: [] },
          2: { trickPoints: 40, marriageBonus: 0, delta: 40,   cumulativeAfter: 40,   penalties: [] },
        },
      })
    );

    assert.equal(
      game.consecutiveZeros[0],
      1,
      'declarer with round score 0 (no tricks, no marriages) advances counter even though delta = -bid'
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 2: consecutiveZeros — penalty application (FR-024)
// ---------------------------------------------------------------------------

describe('Game.applyRoundEnd — consecutiveZeros penalty application (FR-024)', () => {
  it('on the 3rd consecutive zero: cumulative score drops by exactly 120', () => {
    const game = makeGame();
    // Pre-set state: seat 0 had two consecutive zeros already
    game.consecutiveZeros[0] = 2;
    game.cumulativeScores[0] = 200; // arbitrary prior cumulative

    // This round: seat 0 score = 0 → triggers penalty
    game.applyRoundEnd(
      { 0: 0, 1: 50, 2: 50 },
      makeSummary({
        roundNumber: 3,
        perPlayer: {
          0: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 80,  penalties: [{ type: 'consecutiveZeros', amount: -120 }] },
          1: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50,  penalties: [] },
          2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50,  penalties: [] },
        },
      })
    );

    // 200 + 0 (delta) - 120 (penalty) = 80
    assert.equal(
      game.cumulativeScores[0],
      80,
      'cumulative score must drop by exactly 120 on the 3rd consecutive zero'
    );
  });

  it('counter resets to 0 after the penalty fires', () => {
    const game = makeGame();
    game.consecutiveZeros[0] = 2;
    game.cumulativeScores[0] = 150;

    game.applyRoundEnd(
      { 0: 0, 1: 50, 2: 50 },
      makeSummary({
        roundNumber: 3,
        perPlayer: {
          0: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 30,  penalties: [{ type: 'consecutiveZeros', amount: -120 }] },
          1: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50,  penalties: [] },
          2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50,  penalties: [] },
        },
      })
    );

    assert.equal(game.consecutiveZeros[0], 0, 'counter must reset to 0 after penalty fires');
  });

  it('penalty fires independently for each affected seat in the same round', () => {
    // Both seat 0 and seat 1 have consecutiveZeros = 2 going into this round.
    // Both score 0 this round → both penalties fire independently.
    const game = makeGame();
    game.consecutiveZeros[0] = 2;
    game.consecutiveZeros[1] = 2;
    game.cumulativeScores[0] = 300;
    game.cumulativeScores[1] = 250;
    game.cumulativeScores[2] = 100;

    game.applyRoundEnd(
      { 0: 0, 1: 0, 2: 80 },
      makeSummary({
        roundNumber: 3,
        perPlayer: {
          0: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 180, penalties: [{ type: 'consecutiveZeros', amount: -120 }] },
          1: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 130, penalties: [{ type: 'consecutiveZeros', amount: -120 }] },
          2: { trickPoints: 80, marriageBonus: 0, delta: 80, cumulativeAfter: 180, penalties: [] },
        },
      })
    );

    // 300 + 0 - 120 = 180
    assert.equal(game.cumulativeScores[0], 180, 'seat 0 cumulative: 300 − 120 = 180');
    // 250 + 0 - 120 = 130
    assert.equal(game.cumulativeScores[1], 130, 'seat 1 cumulative: 250 − 120 = 130');
    // seat 2 unaffected
    assert.equal(game.cumulativeScores[2], 180, 'seat 2 cumulative unaffected: 100 + 80 = 180');

    assert.equal(game.consecutiveZeros[0], 0, 'seat 0 counter resets to 0');
    assert.equal(game.consecutiveZeros[1], 0, 'seat 1 counter resets to 0');
  });

  it('after penalty: cumulative score may go negative (counter is at 0 regardless)', () => {
    // Seat 2 has only 50 points but gets −120 penalty → drops to −70.
    const game = makeGame();
    game.consecutiveZeros[2] = 2;
    game.cumulativeScores[2] = 50;

    game.applyRoundEnd(
      { 0: 60, 1: 40, 2: 0 },
      makeSummary({
        roundNumber: 3,
        declarerSeat: 0,
        perPlayer: {
          0: { trickPoints: 60, marriageBonus: 0, delta: 60, cumulativeAfter: 60,  penalties: [] },
          1: { trickPoints: 40, marriageBonus: 0, delta: 40, cumulativeAfter: 40,  penalties: [] },
          2: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: -70, penalties: [{ type: 'consecutiveZeros', amount: -120 }] },
        },
      })
    );

    // 50 + 0 - 120 = -70
    assert.equal(game.cumulativeScores[2], -70, 'cumulative score allowed to go negative');
    assert.equal(game.consecutiveZeros[2], 0,   'counter resets to 0 even with negative cumulative');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Simultaneous barrel + three-zeros (FR-024 spec edge case)
// ---------------------------------------------------------------------------

describe('Game.applyRoundEnd — simultaneous barrel penalty + three-zeros penalty (FR-024 edge case)', () => {
  it('both barrel 3rd-round penalty and three-zeros penalty fire for the same player: total −240', () => {
    // Set up seat 0:
    //   - on barrel (barrelRoundsUsed = 2, score = 900)
    //   - consecutiveZeros counter = 2
    // This round: score = 0 tricks, 0 marriages (round score = 0).
    //   - barrel counter hits 3 → barrel penalty −120
    //   - zeros counter hits 3 → zeros penalty −120
    //   - total deduction = −240
    // post-delta cumulative: 900 + 0 = 900
    // after barrel penalty:  900 − 120 = 780
    // after zeros penalty:   780 − 120 = 660
    const game = makeGame();
    game.cumulativeScores[0] = 900;
    game.barrelState[0].onBarrel = true;
    game.barrelState[0].barrelRoundsUsed = 2;
    game.consecutiveZeros[0] = 2;

    game.applyRoundEnd(
      { 0: 0, 1: 60, 2: 40 },
      makeSummary({
        roundNumber: 3,
        declarerSeat: 1,
        bid: 120,
        perPlayer: {
          0: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 660, penalties: [{ type: 'barrel', amount: -120 }, { type: 'consecutiveZeros', amount: -120 }] },
          1: { trickPoints: 60, marriageBonus: 0, delta: 60, cumulativeAfter: 60,  penalties: [] },
          2: { trickPoints: 40, marriageBonus: 0, delta: 40, cumulativeAfter: 40,  penalties: [] },
        },
      })
    );

    // 900 + 0 − 120 (barrel) − 120 (zeros) = 660
    assert.equal(
      game.cumulativeScores[0],
      660,
      'both barrel and zeros penalties fire: 900 − 120 − 120 = 660 (total −240)'
    );
  });

  it('both barrel and zeros penalties fire: consecutiveZeros counter resets AND barrelRoundsUsed resets', () => {
    const game = makeGame();
    game.cumulativeScores[0] = 900;
    game.barrelState[0].onBarrel = true;
    game.barrelState[0].barrelRoundsUsed = 2;
    game.consecutiveZeros[0] = 2;

    game.applyRoundEnd(
      { 0: 0, 1: 60, 2: 40 },
      makeSummary({
        roundNumber: 3,
        declarerSeat: 1,
        bid: 120,
        perPlayer: {
          0: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 660, penalties: [{ type: 'barrel', amount: -120 }, { type: 'consecutiveZeros', amount: -120 }] },
          1: { trickPoints: 60, marriageBonus: 0, delta: 60, cumulativeAfter: 60,  penalties: [] },
          2: { trickPoints: 40, marriageBonus: 0, delta: 40, cumulativeAfter: 40,  penalties: [] },
        },
      })
    );

    assert.equal(game.consecutiveZeros[0], 0, 'consecutiveZeros counter resets to 0 after penalty');
    assert.equal(game.barrelState[0].barrelRoundsUsed, 0, 'barrelRoundsUsed resets to 0 after barrel penalty');
  });

  it('simultaneous penalties for seat 0 do not affect seats 1 and 2', () => {
    const game = makeGame();
    game.cumulativeScores[0] = 900;
    game.cumulativeScores[1] = 200;
    game.cumulativeScores[2] = 150;
    game.barrelState[0].onBarrel = true;
    game.barrelState[0].barrelRoundsUsed = 2;
    game.consecutiveZeros[0] = 2;

    game.applyRoundEnd(
      { 0: 0, 1: 60, 2: 40 },
      makeSummary({
        roundNumber: 3,
        declarerSeat: 1,
        bid: 120,
        perPlayer: {
          0: { trickPoints: 0,  marriageBonus: 0, delta: 0,  cumulativeAfter: 660, penalties: [{ type: 'barrel', amount: -120 }, { type: 'consecutiveZeros', amount: -120 }] },
          1: { trickPoints: 60, marriageBonus: 0, delta: 60, cumulativeAfter: 260, penalties: [] },
          2: { trickPoints: 40, marriageBonus: 0, delta: 40, cumulativeAfter: 190, penalties: [] },
        },
      })
    );

    // Seat 0 penalized: 900 − 240 = 660
    assert.equal(game.cumulativeScores[0], 660, 'seat 0: 900 − 240 = 660');
    // Seat 1 unaffected: 200 + 60 = 260
    assert.equal(game.cumulativeScores[1], 260, 'seat 1: 200 + 60 = 260 (unaffected)');
    // Seat 2 unaffected: 150 + 40 = 190
    assert.equal(game.cumulativeScores[2], 190, 'seat 2: 150 + 40 = 190 (unaffected)');

    // Other seats' counters also unaffected
    assert.equal(game.consecutiveZeros[1], 0, 'seat 1 zeros counter unaffected');
    assert.equal(game.consecutiveZeros[2], 0, 'seat 2 zeros counter unaffected');
    assert.equal(game.barrelState[1].barrelRoundsUsed, 0, 'seat 1 barrel counter unaffected');
    assert.equal(game.barrelState[2].barrelRoundsUsed, 0, 'seat 2 barrel counter unaffected');
  });
});
