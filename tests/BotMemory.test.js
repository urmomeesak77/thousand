'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const BotMemory = require('../src/services/bots/BotMemory');

const MAX_AGE = 7;

describe('BotMemory.recallKernel — low-pass impulse response (FR-004, FR-005, FR-006)', () => {
  it('kernel[0] === 1 for every skill (a just-played card is always recalled)', () => { // per FR-005
    for (const skill of [0, 0.25, 0.5, 0.75, 1]) {
      const kernel = BotMemory.recallKernel(skill, MAX_AGE);
      assert.equal(kernel[0], 1, `skill=${skill}`);
    }
  });

  it('is monotonically non-increasing in age for every skill', () => { // per FR-006
    for (const skill of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const kernel = BotMemory.recallKernel(skill, MAX_AGE);
      assert.equal(kernel.length, MAX_AGE + 1);
      for (let a = 1; a <= MAX_AGE; a++) {
        assert.ok(kernel[a] <= kernel[a - 1], `skill=${skill} kernel[${a}]=${kernel[a]} <= ${kernel[a - 1]}`);
        assert.ok(kernel[a] >= 0 && kernel[a] <= 1, `skill=${skill} kernel[${a}] in [0,1]`);
      }
    }
  });

  it('matches the Fourier model envelope e^(-ω_c·age) within quadrature tolerance', () => { // per FR-004
    // ω_c = (1 - skill) · 0.6 (the module mapping); the discrete inverse transform must
    // reproduce the analytic inverse-FT of the Lorentzian frequency response.
    const skill = 0.5;
    const omega = (1 - skill) * 0.6;
    const kernel = BotMemory.recallKernel(skill, MAX_AGE);
    for (let a = 0; a <= MAX_AGE; a++) {
      assert.ok(Math.abs(kernel[a] - Math.exp(-omega * a)) < 0.02, `age ${a}: ${kernel[a]} ≈ ${Math.exp(-omega * a)}`);
    }
  });

  it('max skill recalls perfectly (kernel all 1); min skill decays well below 1', () => { // per FR-005
    const perfect = BotMemory.recallKernel(1, MAX_AGE);
    assert.ok(perfect.every((v) => v === 1));
    const worst = BotMemory.recallKernel(0, MAX_AGE);
    assert.ok(worst[MAX_AGE] < 0.1);
  });
});

describe('BotMemory.recallDraw — deterministic uniform draw (FR-008)', () => {
  it('returns a value in [0,1)', () => { // per FR-008
    for (let cardId = 0; cardId < 24; cardId++) {
      const d = BotMemory.recallDraw(12345, 1, cardId);
      assert.ok(d >= 0 && d < 1, `cardId ${cardId} draw=${d}`);
    }
  });

  it('is stable across calls for the same (seed, roundKey, cardId)', () => { // per FR-008
    assert.equal(BotMemory.recallDraw(999, 3, 7), BotMemory.recallDraw(999, 3, 7));
  });

  it('spreads across cards and varies with seed and roundKey', () => { // per FR-008
    const a = BotMemory.recallDraw(1, 1, 5);
    assert.notEqual(a, BotMemory.recallDraw(2, 1, 5)); // different seed
    assert.notEqual(a, BotMemory.recallDraw(1, 2, 5)); // different round
    assert.notEqual(a, BotMemory.recallDraw(1, 1, 6)); // different card
  });
});

describe('BotMemory.recalledGoneCardIds (C1, C2, C5)', () => {
  it('returns an empty Set for an empty play log (C5)', () => { // per FR-001
    const m = new BotMemory(0.5, 42);
    assert.equal(m.recalledGoneCardIds([], 3, 0).size, 0);
  });

  it('never returns age-0 cards — those are on the table (C2)', () => { // per FR-001
    const m = new BotMemory(1, 42); // perfect memory: recalls every past card
    const log = [
      { cardId: 5, trickNumber: 3 }, // age 0 (current trick) — excluded
      { cardId: 6, trickNumber: 2 }, // age 1
      { cardId: 7, trickNumber: 1 }, // age 2
    ];
    const recalled = m.recalledGoneCardIds(log, 3, 0);
    assert.equal(recalled.has(5), false);
    assert.equal(recalled.has(6), true);
    assert.equal(recalled.has(7), true);
  });

  it('is pure: identical args ⇒ identical Set (C1, FR-008)', () => { // per FR-008
    const log = [
      { cardId: 1, trickNumber: 1 }, { cardId: 2, trickNumber: 1 }, { cardId: 3, trickNumber: 2 },
    ];
    const first = new BotMemory(0.4, 77).recalledGoneCardIds(log, 4, 9);
    const second = new BotMemory(0.4, 77).recalledGoneCardIds(log, 4, 9);
    assert.deepEqual([...first].sort((a, b) => a - b), [...second].sort((a, b) => a - b));
  });
});
