'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/services/Game');

function makeGame() {
  return new Game({ gameId: 'g4', seatOrder: ['p0', 'p1', 'p2', 'p3'], dealerSeat: 0, playerCount: 4 });
}

describe('Game — 4-seat session state (FR-012, FR-015)', () => {
  it('initializes cumulative/barrel/zero maps over four seats', () => { // per FR-015
    const game = makeGame();
    assert.equal(game.playerCount, 4);
    for (const s of [0, 1, 2, 3]) {
      assert.equal(game.cumulativeScores[s], 0, `cumulative seat ${s}`);
      assert.equal(game.consecutiveZeros[s], 0, `zeros seat ${s}`);
      assert.deepEqual(game.barrelState[s], { onBarrel: false, barrelRoundsUsed: 0 });
    }
  });

  it('barrelState seats are independent objects (no shared reference)', () => { // per FR-015
    const game = makeGame();
    game.barrelState[0].onBarrel = true;
    assert.equal(game.barrelState[1].onBarrel, false);
  });

  it('dealer rotates modulo 4 (seat 3 → seat 0)', () => { // per FR-012
    const game = new Game({ gameId: 'g', seatOrder: ['p0', 'p1', 'p2', 'p3'], dealerSeat: 3, playerCount: 4 });
    game.startNextRound();
    assert.equal(game.dealerSeat, 0);
    assert.equal(game.currentRoundNumber, 2);
  });

  it('applyRoundEnd accumulates deltas across all four seats', () => { // per FR-015
    const game = makeGame();
    const summary = {
      roundNumber: 1,
      perPlayer: {
        0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 100 },
        1: { trickPoints: 10, marriageBonus: 0, delta: 10, cumulativeAfter: 10 },
        2: { trickPoints: 5, marriageBonus: 0, delta: 5, cumulativeAfter: 5 },
        3: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0 },
      },
    };
    game.applyRoundEnd({ 0: 100, 1: 10, 2: 5, 3: 0 }, summary);
    assert.deepEqual(game.cumulativeScores, { 0: 100, 1: 10, 2: 5, 3: 0 });
  });
});
