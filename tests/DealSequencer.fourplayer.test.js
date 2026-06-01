'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { stepDest, buildDealDistribution } = require('../src/services/DealSequencer');

describe('DealSequencer — 4-player cadence (FR-009)', () => {
  it('buildDealDistribution(4): 7 per seat, 4 talon, 32 cards total', () => { // per FR-009
    const { hands, talon } = buildDealDistribution(4);
    for (const s of [0, 1, 2, 3]) {
      assert.equal(hands[s].length, 7, `seat ${s} hand size`);
    }
    assert.equal(talon.length, 4, 'talon size');
    const all = [...hands[0], ...hands[1], ...hands[2], ...hands[3], ...talon];
    assert.equal(all.length, 32, 'total card count');
    const unique = new Set(all);
    assert.equal(unique.size, 32, 'all ids unique');
    for (let i = 0; i < 32; i++) {
      assert.ok(unique.has(i), `id ${i} must be present`);
    }
  });

  it('buildDealDistribution(4) is deterministic', () => { // per FR-009
    assert.deepEqual(buildDealDistribution(4), buildDealDistribution(4));
  });

  it('stepDest(_, 4) routes exactly 4 cards to the talon and the rest to seats 0–3', () => { // per FR-009
    let talonCount = 0;
    for (let i = 0; i < 32; i++) {
      const to = stepDest(i, 4);
      if (to === 'talon') {
        talonCount++;
      } else {
        assert.ok(['seat0', 'seat1', 'seat2', 'seat3'].includes(to), `step ${i} → ${to}`);
      }
    }
    assert.equal(talonCount, 4);
  });

  it('3-player path is unchanged: 7 per seat + 3 talon = 24, default arg = 3', () => { // per FR-009
    const { hands, talon } = buildDealDistribution(3);
    for (const s of [0, 1, 2]) {
      assert.equal(hands[s].length, 7);
    }
    assert.equal(talon.length, 3);
    assert.equal(buildDealDistribution().talon.length, 3);
    // Canonical 3-player step pattern is preserved
    assert.equal(stepDest(0), 'seat1');
    assert.equal(stepDest(3), 'talon');
    assert.equal(stepDest(12), 'seat1');
  });
});
