'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal store with three players for Round construction.
 */
function makeStore() {
  return {
    players: new Map([
      ['p0', { nickname: 'Dealer' }],
      ['p1', { nickname: 'P1' }],
      ['p2', { nickname: 'P2' }],
    ]),
  };
}

/**
 * Build a minimal game-like session object for injection into round._game.session.
 * @param {object} opts
 * @param {object} opts.barrelState  { 0: { onBarrel, barrelRoundsUsed }, ... }
 * @param {object} opts.consecutiveZeros  { 0: n, 1: n, 2: n }
 * @param {object} opts.cumulativeScores  { 0: n, 1: n, 2: n }
 */
function makeSession({ barrelState, consecutiveZeros, cumulativeScores } = {}) {
  return {
    barrelState: barrelState ?? {
      0: { onBarrel: false, barrelRoundsUsed: 0 },
      1: { onBarrel: false, barrelRoundsUsed: 0 },
      2: { onBarrel: false, barrelRoundsUsed: 0 },
    },
    consecutiveZeros: consecutiveZeros ?? { 0: 0, 1: 0, 2: 0 },
    cumulativeScores: cumulativeScores ?? { 0: 0, 1: 0, 2: 0 },
  };
}

/**
 * Build a Round wired with a session, then inject roundScores, roundDeltas,
 * and declarerSeat directly so buildSummary can run without a real game loop.
 */
function makeRoundForBuildSummary({ session, roundScores, roundDeltas, declarerSeat = 0 }) {
  const pids = ['p0', 'p1', 'p2'];
  const game = { players: new Set(pids), session };
  const store = makeStore();
  const round = new Round({ game, store });

  // Inject the fields buildSummary reads from directly.
  round.declarerSeat = declarerSeat;
  round.currentHighBid = 100;
  round.roundScores = roundScores;
  round.roundDeltas = roundDeltas;
  // declaredMarriages is already [] from the constructor; no marriages needed.

  return round;
}

// ---------------------------------------------------------------------------
// Suite — Round.buildSummary penalty pre-computation (FR-023 / FR-024)
// ---------------------------------------------------------------------------

describe('Round.buildSummary — barrel penalty pre-computation (FR-023)', () => {
  it('A) barrel penalty fires: seat on barrel, barrelRoundsUsed=2, score stays in barrel range after delta', () => {
    // per FR-023: when barrelRoundsUsed + 1 === BARREL_ROUND_LIMIT (i.e. = 3) AND
    // scoreAfterDelta is in [880, 1000), fire −120 penalty.
    // cumulativeScores[0]=920, delta=10 → 930 (stays in range) → penalty fires.
    const session = makeSession({
      barrelState: {
        0: { onBarrel: true, barrelRoundsUsed: 2 },
        1: { onBarrel: false, barrelRoundsUsed: 0 },
        2: { onBarrel: false, barrelRoundsUsed: 0 },
      },
      consecutiveZeros: { 0: 0, 1: 0, 2: 0 },
      cumulativeScores: { 0: 920, 1: 0, 2: 0 },
    });
    const round = makeRoundForBuildSummary({
      session,
      roundScores: { 0: 10, 1: 0, 2: 0 },
      roundDeltas: { 0: 10, 1: 0, 2: 0 },
    });

    const summary = round.buildSummary();

    // per FR-023: penalty tag present and delta reduced by 120
    assert.ok(
      summary.perPlayer[0].penalties.includes('barrel'),
      'penalties must include "barrel"'
    ); // per FR-023
    assert.equal(summary.perPlayer[0].delta, 10 - 120, 'delta must be reduced by 120 (barrel penalty)'); // per FR-023
  });

  it('B) barrel penalty NOT fired: seat on barrel, barrelRoundsUsed=2, but score exits barrel range', () => {
    // cumulativeScores[0]=920, delta=80 → 1000 (>= BARREL_MAX) → penalty does NOT fire.
    const session = makeSession({
      barrelState: {
        0: { onBarrel: true, barrelRoundsUsed: 2 },
        1: { onBarrel: false, barrelRoundsUsed: 0 },
        2: { onBarrel: false, barrelRoundsUsed: 0 },
      },
      consecutiveZeros: { 0: 0, 1: 0, 2: 0 },
      cumulativeScores: { 0: 920, 1: 0, 2: 0 },
    });
    const round = makeRoundForBuildSummary({
      session,
      roundScores: { 0: 80, 1: 0, 2: 0 },
      roundDeltas: { 0: 80, 1: 0, 2: 0 },
    });

    const summary = round.buildSummary();

    // per FR-023: score exits barrel range (920+80=1000 >= 1000), no barrel penalty
    assert.equal(summary.perPlayer[0].penalties.length, 0, 'no penalties when score exits barrel range'); // per FR-023
    assert.equal(summary.perPlayer[0].delta, 80, 'delta unchanged (no penalty applied)'); // per FR-023
  });

  it('C) zero-round penalty fires: consecutiveZeros=2, this round score = 0', () => {
    // per FR-024: when newZeroCount === ZERO_ROUND_LIMIT (3), fire −120 penalty.
    // consecutiveZeros[0]=2, roundScore=0 → newZeroCount=3 → penalty fires.
    const session = makeSession({
      barrelState: {
        0: { onBarrel: false, barrelRoundsUsed: 0 },
        1: { onBarrel: false, barrelRoundsUsed: 0 },
        2: { onBarrel: false, barrelRoundsUsed: 0 },
      },
      consecutiveZeros: { 0: 2, 1: 0, 2: 0 },
      cumulativeScores: { 0: 500, 1: 0, 2: 0 },
    });
    const round = makeRoundForBuildSummary({
      session,
      roundScores: { 0: 0, 1: 0, 2: 0 },
      roundDeltas: { 0: -100, 1: 0, 2: 0 },
    });

    const summary = round.buildSummary();

    // per FR-024: three-zeros penalty tag present, delta reduced by further 120
    assert.ok(
      summary.perPlayer[0].penalties.includes('three-zeros'),
      'penalties must include "three-zeros"'
    ); // per FR-024
    assert.equal(summary.perPlayer[0].delta, -100 - 120, 'delta reduced by 120 (zero-round penalty)'); // per FR-024
  });

  it('D) both barrel and zero-round penalties fire simultaneously', () => {
    // Set up so both conditions are true:
    //   Barrel: onBarrel=true, barrelRoundsUsed=2, cumulativeScores[0]=900, delta=0 → 900+0=900 in [880,1000)
    //   Zeros:  consecutiveZeros[0]=2, roundScore=0 → newZeroCount=3
    // Expected delta: 0 − 120 (barrel) − 120 (zeros) = −240
    const session = makeSession({
      barrelState: {
        0: { onBarrel: true, barrelRoundsUsed: 2 },
        1: { onBarrel: false, barrelRoundsUsed: 0 },
        2: { onBarrel: false, barrelRoundsUsed: 0 },
      },
      consecutiveZeros: { 0: 2, 1: 0, 2: 0 },
      cumulativeScores: { 0: 900, 1: 0, 2: 0 },
    });
    const round = makeRoundForBuildSummary({
      session,
      roundScores: { 0: 0, 1: 0, 2: 0 },
      roundDeltas: { 0: 0, 1: 0, 2: 0 },
    });

    const summary = round.buildSummary();

    // per FR-023 and FR-024: both penalty tags present
    assert.ok(
      summary.perPlayer[0].penalties.includes('barrel'),
      'penalties must include "barrel"'
    ); // per FR-023
    assert.ok(
      summary.perPlayer[0].penalties.includes('three-zeros'),
      'penalties must include "three-zeros"'
    ); // per FR-024
    assert.equal(summary.perPlayer[0].delta, -240, 'delta reduced by 240 (both penalties applied)'); // per FR-023, FR-024
  });
});
