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

  it('accepts a string roundKey (per the contract) deterministically', () => { // per FR-008
    const d = BotMemory.recallDraw(1, 'game-7:round-3', 5);
    assert.ok(d >= 0 && d < 1);
    assert.equal(d, BotMemory.recallDraw(1, 'game-7:round-3', 5));
    assert.notEqual(d, BotMemory.recallDraw(1, 'game-7:round-4', 5));
  });
});

describe('BotMemory — constructor clamps memorySkill to [0,1]', () => {
  it('treats out-of-range or non-finite skill as the clamped extreme', () => { // per FR-009
    assert.equal(new BotMemory(1.5, 0).memorySkill, 1);
    assert.equal(new BotMemory(-0.5, 0).memorySkill, 0);
    assert.equal(new BotMemory(NaN, 0).memorySkill, 0);
  });
});

describe('BotMemory.recalledGoneCardIds (C1, C2, C5)', () => {
  it('returns an empty Set for an empty play log (C5)', () => { // per FR-001
    const m = new BotMemory(0.5, 42);
    assert.equal(m.recalledGoneCardIds([], 3, 0).size, 0);
  });

  it('memory is per-round: a fresh round (empty log) recalls nothing despite prior rounds', () => { // per FR-002
    const memory = new BotMemory(1, 5);
    memory.recalledGoneCardIds(spreadLog(16), 8, 0); // round 1 — recalls plenty
    // Round 2 begins with an empty playedLog; nothing carries over (no stored state).
    assert.equal(memory.recalledGoneCardIds([], 1, 1).size, 0);
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

// Fraction of distinct cardIds recalled at a given age for a given skill — a Monte-Carlo
// read of the recall probability (each card gets its own deterministic draw).
function recallFractionAtAge(skill, age, cardCount = 200) {
  const played = age >= 1 ? 1 : 1;
  const currentTrickNumber = played + age;
  let recalled = 0;
  for (let cardId = 0; cardId < cardCount; cardId++) {
    const log = [{ cardId, trickNumber: played }];
    if (new BotMemory(skill, 4242).recalledGoneCardIds(log, currentTrickNumber, 0).has(cardId)) {
      recalled += 1;
    }
  }
  return recalled / cardCount;
}

describe('BotMemory — forgetting fidelity (FR-006, FR-007; SC-002)', () => {
  it('a recent card (age 1) is recalled 100% at max skill', () => { // per FR-007
    assert.equal(recallFractionAtAge(1, 1), 1);
  });

  it('a low-skill bot recalls a card aged ≥ 4 less than half the time', () => { // per FR-007, SC-002
    assert.ok(BotMemory.recallKernel(0.3, MAX_AGE)[4] < 0.5);
    assert.ok(recallFractionAtAge(0.3, 4) < 0.5, 'recall fraction at age 4, skill 0.3');
    assert.ok(recallFractionAtAge(0.3, 5) < 0.5);
  });

  it('has non-zero forgetting for every skill below max (never omniscient)', () => { // per FR-007
    for (const skill of [0, 0.3, 0.6, 0.9, 0.99]) {
      const kernel = BotMemory.recallKernel(skill, MAX_AGE);
      assert.ok(kernel.some((v) => v < 1), `skill=${skill} should forget at some age`);
    }
  });

  it('forgetting is monotonic — once a card is forgotten it never returns (C3)', () => { // per FR-006
    const memory = new BotMemory(0.4, 31);
    const log = [{ cardId: 9, trickNumber: 1 }];
    let everForgotten = false;
    for (let currentTrickNumber = 2; currentTrickNumber <= 8; currentTrickNumber++) {
      const recalled = memory.recalledGoneCardIds(log, currentTrickNumber, 5).has(9);
      if (!recalled) { everForgotten = true; }
      if (everForgotten) { assert.equal(recalled, false, `age ${currentTrickNumber - 1} must stay forgotten`); }
    }
  });
});

// A play log of `count` cards spread across past tricks (ages 1..7).
function spreadLog(count) {
  return Array.from({ length: count }, (_, cardId) => ({ cardId, trickNumber: 1 + (cardId % 7) }));
}

describe('BotMemory — per-bot skill parameterises the same formula (FR-010, FR-011; SC-003, SC-005)', () => {
  it('higher skill recall ⊇ lower skill recall at the same seed (C4)', () => { // per FR-011
    const log = spreadLog(32);
    const seed = 12345;
    const lo = new BotMemory(0.2, seed).recalledGoneCardIds(log, 8, 0);
    const hi = new BotMemory(0.8, seed).recalledGoneCardIds(log, 8, 0);
    for (const id of lo) { assert.ok(hi.has(id), `card ${id} recalled at low skill must persist at high skill`); }
    assert.ok(hi.size > lo.size, `high skill should recall more (${hi.size} > ${lo.size})`);
  });

  it('recall-set size is non-decreasing in memorySkill (SC-005)', () => { // per FR-010, FR-011
    const log = spreadLog(32);
    const sizes = [0, 0.25, 0.5, 0.75, 1].map(
      (skill) => new BotMemory(skill, 999).recalledGoneCardIds(log, 8, 0).size,
    );
    for (let i = 1; i < sizes.length; i++) {
      assert.ok(sizes[i] >= sizes[i - 1], `size at skill step ${i} (${sizes[i]}) ≥ ${sizes[i - 1]}`);
    }
    assert.ok(sizes[sizes.length - 1] > sizes[0], 'max skill recalls strictly more than min');
  });

  it('two bots with different skills on one history recall different sets (SC-003)', () => { // per FR-010
    const log = spreadLog(32);
    const sharp = new BotMemory(0.9, 555).recalledGoneCardIds(log, 8, 0);
    const hazy = new BotMemory(0.2, 555).recalledGoneCardIds(log, 8, 0);
    assert.notDeepEqual([...sharp].sort((a, b) => a - b), [...hazy].sort((a, b) => a - b));
  });

  it('each bot\'s memory is independent — no shared state across instances', () => { // per FR-010
    const log = spreadLog(16);
    const a = new BotMemory(0.3, 1);
    const b = new BotMemory(0.7, 2);
    const aBefore = a.recalledGoneCardIds(log, 8, 0);
    b.recalledGoneCardIds(log, 8, 0); // exercising b must not perturb a
    const aAfter = a.recalledGoneCardIds(log, 8, 0);
    assert.deepEqual([...aBefore].sort((x, y) => x - y), [...aAfter].sort((x, y) => x - y));
  });
});

describe('BotMemory — performance (SC-006)', () => {
  it('computes recall for a full 32-card log well under 50 ms per decision', () => { // per FR-015, SC-006
    const log = spreadLog(32);
    const memory = new BotMemory(0.5, 8675309);
    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) { memory.recalledGoneCardIds(log, 8, i); }
    const msPerDecision = Number(process.hrtime.bigint() - start) / 1e6 / 100;
    assert.ok(msPerDecision < 50, `recall took ${msPerDecision.toFixed(3)} ms/decision (budget 50 ms)`);
  });
});
