'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Scoring = require('../src/services/Scoring');

// Build a deck of { id, rank, suit } where the four aces live at ids 0..3 (one
// per suit) and the rest are filler cards that are never aces. Mirrors the shape
// produced by Round.start() (deck = shuffled.map((c, i) => ({ id: i, ... }))).
function makeTestDeck() {
  const suits = ['♣', '♠', '♥', '♦'];
  const deck = [];
  // ids 0..3 — the four aces
  for (const suit of suits) {
    deck.push({ id: deck.length, rank: 'A', suit });
  }
  // ids 4..23 — non-ace filler (5 ranks × 4 suits = 20 cards)
  for (const suit of suits) {
    for (const rank of ['10', 'J', 'Q', 'K', '9']) {
      deck.push({ id: deck.length, rank, suit });
    }
  }
  return deck;
}

const ACE_IDS = [0, 1, 2, 3]; // ace of ♣, ♠, ♥, ♦ respectively

describe('Scoring.handHasAce — FR-001', () => {
  it('returns true when the hand holds an ace of any suit', () => { // per FR-001
    const deck = makeTestDeck();
    for (const aceId of ACE_IDS) {
      const hand = [aceId, 4, 5, 6, 7, 8, 9, 10];
      assert.equal(Scoring.handHasAce(hand, deck), true, `ace id ${aceId} should be detected`);
    }
  });

  it('returns false for an ace-less hand', () => { // per FR-001
    const deck = makeTestDeck();
    const hand = [4, 5, 6, 7, 8, 9, 10, 11]; // eight non-ace cards
    assert.equal(Scoring.handHasAce(hand, deck), false);
  });

  it('returns false for an empty hand', () => { // per FR-001
    const deck = makeTestDeck();
    assert.equal(Scoring.handHasAce([], deck), false);
  });

  it('detects an ace in a full 8-card post-exchange hand', () => { // per FR-001
    const deck = makeTestDeck();
    const hand = [4, 5, 6, 7, 8, 9, 10, 2]; // seven filler + ace♥ (id 2)
    assert.equal(Scoring.handHasAce(hand, deck), true);
  });
});
