'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/services/Game');
const { FOUR_NINES_BONUS, BARREL_MIN, BARREL_MAX, VICTORY_THRESHOLD } = require('../src/services/GameRules');

function makeGame() {
  return new Game({ gameId: 'fn-test', seatOrder: ['p0', 'p1', 'p2'], dealerSeat: 0 });
}

function makeSummary(perPlayer) {
  return { roundNumber: 1, declarerSeat: 0, declarerNickname: 'P0', bid: 100, perPlayer };
}

// Minimal perPlayer rows; applyRoundEnd only reads trickPoints + marriageBonus
// (for the zero-round penalty) off these.
function perPlayerWith(trickPointsBySeat) {
  const perPlayer = {};
  for (const seat of [0, 1, 2]) {
    perPlayer[seat] = {
      trickPoints: trickPointsBySeat[seat] ?? 10,
      marriageBonus: 0,
      delta: 0,
      cumulativeAfter: 0,
      penalties: [],
    };
  }
  return perPlayer;
}

describe('Game.applyFourNinesBonus — FR-002', () => {
  it('raises the awarded seat cumulative by exactly 100', () => { // per FR-002
    const game = makeGame();
    game.applyFourNinesBonus(1);
    assert.equal(game.cumulativeScores[1], FOUR_NINES_BONUS);
    assert.equal(game.cumulativeScores[0], 0);
    assert.equal(game.cumulativeScores[2], 0);
  });

  it('post-round cumulative = before + 100 + roundDelta (not double-counted)', () => { // per FR-002
    const game = makeGame();
    game.cumulativeScores[1] = 200;       // some prior cumulative
    game.applyFourNinesBonus(1);          // banks +100 at trick-play start
    assert.equal(game.cumulativeScores[1], 300);

    const deltas = { 0: 0, 1: 50, 2: 0 }; // normal round delta applied at round end
    game.applyRoundEnd(deltas, makeSummary(perPlayerWith({ 0: 10, 1: 10, 2: 10 })));

    // 200 (before) + 100 (bonus) + 50 (delta) = 350 — the +100 is added once only
    assert.equal(game.cumulativeScores[1], 350);
  });

  it('records the award on the round-history entry appended at round end', () => { // per FR-009
    const game = makeGame();
    game.applyFourNinesBonus(2);
    game.applyRoundEnd({ 0: 0, 1: 0, 2: 0 }, makeSummary(perPlayerWith({ 0: 10, 1: 10, 2: 10 })));
    const entry = game.history[game.history.length - 1];
    assert.deepEqual(entry.fourNinesAward, { seat: 2, amount: FOUR_NINES_BONUS });
  });

  it('barrel recompute at round end includes the bonus', () => { // per FR-006
    const game = makeGame();
    game.cumulativeScores[1] = 790;
    game.applyFourNinesBonus(1);          // → 890, inside [880, 1000)
    assert.ok(game.cumulativeScores[1] >= BARREL_MIN && game.cumulativeScores[1] < BARREL_MAX);
    game.applyRoundEnd({ 0: 0, 1: 0, 2: 0 }, makeSummary(perPlayerWith({ 0: 10, 1: 10, 2: 10 })));
    assert.equal(game.barrelState[1].onBarrel, true);
  });

  it('the banked bonus is included in the cumulative used for the round-end victory check', () => { // per FR-007
    const game = makeGame();
    game.cumulativeScores[0] = 950;
    game.applyFourNinesBonus(0);          // → 1050
    game.applyRoundEnd({ 0: 0, 1: 0, 2: 0 }, makeSummary(perPlayerWith({ 0: 10, 1: 10, 2: 10 })));
    assert.ok(game.cumulativeScores[0] >= VICTORY_THRESHOLD);
  });
});
