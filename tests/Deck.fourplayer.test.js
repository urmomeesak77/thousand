'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { makeDeck } = require('../src/services/Deck');

describe('Deck — 4-player extended deck (FR-005, FR-006)', () => {
  it('makeDeck(4) returns 32 cards covering 7–A in all four suits', () => { // per FR-005
    const deck = makeDeck(4);
    assert.equal(deck.length, 32);
    const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const suits = ['♣', '♠', '♥', '♦'];
    const keys = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    assert.equal(keys.size, 32, 'all 32 rank×suit combos must be distinct');
    for (const suit of suits) {
      for (const rank of ranks) {
        assert.ok(keys.has(`${rank}${suit}`), `deck must contain ${rank}${suit}`);
      }
    }
  });

  it('makeDeck(4) includes four 7s and four 8s (one per suit)', () => { // per FR-005
    const deck = makeDeck(4);
    assert.equal(deck.filter((c) => c.rank === '7').length, 4);
    assert.equal(deck.filter((c) => c.rank === '8').length, 4);
  });

  it('makeDeck(3) is unchanged: 24 cards, no 7 or 8', () => { // per FR-006
    const deck = makeDeck(3);
    assert.equal(deck.length, 24);
    assert.equal(deck.filter((c) => c.rank === '7' || c.rank === '8').length, 0);
  });

  it('makeDeck() defaults to the 24-card 3-player deck', () => { // per FR-006
    assert.equal(makeDeck().length, 24);
  });
});
