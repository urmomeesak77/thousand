'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');
const { stepDest } = require('../src/services/DealSequencer');

function makeRound() {
  const pids = ['p0', 'p1', 'p2'];
  const game = { players: new Set(pids) };
  const store = {
    players: new Map([
      ['p0', { nickname: 'Dealer' }],
      ['p1', { nickname: 'P1' }],
      ['p2', { nickname: 'P2' }],
    ]),
  };
  const round = new Round({ game, store });
  round.start();
  return round;
}

describe('Round.deal — deck contents', () => {
  it('deck has exactly 24 cards covering all rank×suit combinations', () => {
    const round = makeRound();
    assert.equal(round.deck.length, 24);

    const ranks = ['9', '10', 'J', 'Q', 'K', 'A'];
    const suits = ['♣', '♠', '♥', '♦'];
    const keys = new Set(round.deck.map((c) => `${c.rank}${c.suit}`));
    assert.equal(keys.size, 24, 'all 24 rank×suit combos must be distinct');
    for (const suit of suits) {
      for (const rank of ranks) {
        assert.ok(keys.has(`${rank}${suit}`), `deck must contain ${rank}${suit}`);
      }
    }
  });

  it('each card has a unique numeric id equal to its deck index (0–23)', () => {
    const round = makeRound();
    for (let i = 0; i < 24; i++) {
      assert.equal(round.deck[i].id, i, `deck[${i}].id must equal ${i}`);
    }
    const ids = new Set(round.deck.map((c) => c.id));
    assert.equal(ids.size, 24, 'all ids must be unique');
  });
});

describe('Round.deal — hand and talon sizes', () => {
  it('each player gets exactly 7 cards and the talon gets exactly 3', () => {
    const round = makeRound();
    assert.equal(round.hands[0].length, 7, 'seat 0 hand size');
    assert.equal(round.hands[1].length, 7, 'seat 1 hand size');
    assert.equal(round.hands[2].length, 7, 'seat 2 hand size');
    assert.equal(round.talon.length, 3, 'talon size');
  });

  it('all 24 card ids appear exactly once across hands and talon', () => {
    const round = makeRound();
    const all = [
      ...round.hands[0],
      ...round.hands[1],
      ...round.hands[2],
      ...round.talon,
    ];
    assert.equal(all.length, 24, 'total card count must be 24');
    const unique = new Set(all);
    assert.equal(unique.size, 24, 'all ids must be unique across hands + talon');
    for (let i = 0; i < 24; i++) {
      assert.ok(unique.has(i), `id ${i} must be present`);
    }
  });
});

describe('Round.deal — FR-002 deal sequence (24-step interleaved pattern)', () => {
  it('steps 0–11: seat1 → seat2 → seat0 → talon (4-step repeat)', () => {
    const round = makeRound();
    const expected = ['seat1', 'seat2', 'seat0', 'talon'];
    for (let i = 0; i < 12; i++) {
      assert.equal(stepDest(i), expected[i % 4], `step ${i} destination`);
    }
  });

  it('steps 12–23: seat1 → seat2 → seat0 (3-step repeat, no talon)', () => {
    const round = makeRound();
    const expected = ['seat1', 'seat2', 'seat0'];
    for (let i = 12; i < 24; i++) {
      assert.equal(stepDest(i), expected[(i - 12) % 3], `step ${i} destination`);
    }
  });

  it('talon receives exactly 3 cards at steps 3, 7, 11', () => {
    const round = makeRound();
    const talonSteps = new Set([3, 7, 11]);
    for (let i = 0; i < 24; i++) {
      if (talonSteps.has(i)) {
        assert.equal(stepDest(i), 'talon', `step ${i} must go to talon`);
      } else {
        assert.notEqual(stepDest(i), 'talon', `step ${i} must NOT go to talon`);
      }
    }
  });

  it('talon card ids match the ids delivered at steps 3, 7, 11', () => {
    const round = makeRound();
    const talonIds = new Set(round.talon);
    // Steps 3, 7, 11 are the talon destinations; the card id equals the step index.
    assert.ok(talonIds.has(3), 'id 3 must be in talon');
    assert.ok(talonIds.has(7), 'id 7 must be in talon');
    assert.ok(talonIds.has(11), 'id 11 must be in talon');
  });
});
