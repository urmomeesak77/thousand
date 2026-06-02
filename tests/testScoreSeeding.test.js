'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { seededScoresForTest, applySeededScores } = require('../src/services/testScoreSeeding');
const Game = require('../src/services/Game');

// The seam reads process.env.THOUSAND_SEED_SCORES; save/restore around each test
// so cases don't leak into one another (or into the rest of the suite).
let savedEnv;
beforeEach(() => { savedEnv = process.env.THOUSAND_SEED_SCORES; });
afterEach(() => {
  if (savedEnv === undefined) { delete process.env.THOUSAND_SEED_SCORES; }
  else { process.env.THOUSAND_SEED_SCORES = savedEnv; }
});

function makeGame(playerCount = 3) {
  return new Game({
    gameId: 'seed-test',
    seatOrder: Array.from({ length: playerCount }, (_, i) => `p${i}`),
    dealerSeat: 0,
    playerCount,
  });
}

describe('testScoreSeeding seam — parsing', () => {
  it('returns null when the env var is unset (inert in production)', () => {
    delete process.env.THOUSAND_SEED_SCORES;
    assert.equal(seededScoresForTest(3), null);
  });

  it('parses a comma-separated score per seat', () => {
    process.env.THOUSAND_SEED_SCORES = '700,710,720';
    assert.deepEqual(seededScoresForTest(3), { 0: 700, 1: 710, 2: 720 });
  });

  it('tolerates surrounding whitespace', () => {
    process.env.THOUSAND_SEED_SCORES = ' 700 , 710 , 720 ';
    assert.deepEqual(seededScoresForTest(3), { 0: 700, 1: 710, 2: 720 });
  });

  it('parses 4 values for the 4-player variant', () => {
    process.env.THOUSAND_SEED_SCORES = '700,700,700,700';
    assert.deepEqual(seededScoresForTest(4), { 0: 700, 1: 700, 2: 700, 3: 700 });
  });

  it('stays inert when the value count does not match playerCount', () => {
    process.env.THOUSAND_SEED_SCORES = '700,700,700';
    assert.equal(seededScoresForTest(4), null);
  });

  it('stays inert when a value is non-numeric', () => {
    process.env.THOUSAND_SEED_SCORES = '700,abc,700';
    assert.equal(seededScoresForTest(3), null);
  });

  it('stays inert in production even when the env var is set', () => {
    const savedNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.THOUSAND_SEED_SCORES = '700,700,700';
    try {
      assert.equal(seededScoresForTest(3), null);
    } finally {
      if (savedNodeEnv === undefined) { delete process.env.NODE_ENV; }
      else { process.env.NODE_ENV = savedNodeEnv; }
    }
  });
});

describe('testScoreSeeding seam — applySeededScores', () => {
  it('does nothing and returns false when the env var is unset', () => {
    delete process.env.THOUSAND_SEED_SCORES;
    const game = makeGame(3);
    assert.equal(applySeededScores(game), false);
    assert.deepEqual(game.cumulativeScores, { 0: 0, 1: 0, 2: 0 });
  });

  it('writes the seeded cumulative scores onto the session', () => {
    process.env.THOUSAND_SEED_SCORES = '700,700,700';
    const game = makeGame(3);
    assert.equal(applySeededScores(game), true);
    assert.deepEqual(game.cumulativeScores, { 0: 700, 1: 700, 2: 700 });
  });

  it('derives onBarrel for a seat seeded inside the barrel band [880, 1000)', () => {
    process.env.THOUSAND_SEED_SCORES = '900,820,760';
    const game = makeGame(3);
    applySeededScores(game);
    assert.equal(game.barrelState[0].onBarrel, true);
    assert.equal(game.barrelState[1].onBarrel, false);
    assert.equal(game.barrelState[2].onBarrel, false);
  });

  it('does not flag onBarrel at or above the victory threshold (>= 1000)', () => {
    process.env.THOUSAND_SEED_SCORES = '1000,880,879';
    const game = makeGame(3);
    applySeededScores(game);
    assert.equal(game.barrelState[0].onBarrel, false); // 1000 — victory, not barrel
    assert.equal(game.barrelState[1].onBarrel, true);  // 880 — lower band edge
    assert.equal(game.barrelState[2].onBarrel, false); // 879 — just below
  });
});
