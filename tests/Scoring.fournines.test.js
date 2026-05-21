'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Scoring = require('../src/services/Scoring');

// Build a deck of { id, rank, suit } where the four 9s live at ids 0..3 (one
// per suit) and the rest are filler cards that are never 9s. Mirrors the shape
// produced by Round.start() (deck = shuffled.map((c, i) => ({ id: i, ... }))).
function makeTestDeck() {
  const suits = ['♣', '♠', '♥', '♦'];
  const deck = [];
  // ids 0..3 — the four 9s
  for (const suit of suits) {
    deck.push({ id: deck.length, rank: '9', suit });
  }
  // ids 4..23 — non-nine filler (5 ranks × 4 suits = 20 cards)
  for (const suit of suits) {
    for (const rank of ['10', 'J', 'Q', 'K', 'A']) {
      deck.push({ id: deck.length, rank, suit });
    }
  }
  return deck;
}

const NINE_IDS = [0, 1, 2, 3];
const FILLER = [4, 5, 6, 7, 8]; // five non-nine card ids

describe('Scoring.findFourNinesSeat — FR-001', () => {
  it('returns the seat whose 8-card hand holds all four 9s', () => { // per FR-001
    const deck = makeTestDeck();
    const hands = {
      0: [...FILLER, 9, 10, 11],
      1: [...NINE_IDS, 12, 13, 14, 15], // all four 9s + 4 filler = 8 cards
      2: [16, 17, 18, 19, 20, 21, 22, 23],
    };
    assert.equal(Scoring.findFourNinesSeat(hands, deck), 1);
  });

  it('returns null when the four 9s are split across hands', () => { // per FR-001
    const deck = makeTestDeck();
    const hands = {
      0: [0, 1, 4, 5, 6, 7, 8, 9],   // two 9s
      1: [2, 10, 11, 12, 13, 14, 15, 16], // one 9
      2: [3, 17, 18, 19, 20, 21, 22, 23], // one 9
    };
    assert.equal(Scoring.findFourNinesSeat(hands, deck), null);
  });

  it('returns null when one 9 is left in the talon (not in any hand)', () => { // per FR-001
    const deck = makeTestDeck();
    // only three of the four 9s are dealt into hands; id 3 sits in the talon
    const hands = {
      0: [0, 1, 2, 4, 5, 6, 7],
      1: [8, 9, 10, 11, 12, 13, 14],
      2: [15, 16, 17, 18, 19, 20, 21],
    };
    assert.equal(Scoring.findFourNinesSeat(hands, deck), null);
  });

  it('returns the declarer seat after the exchange leaves all four 9s in one hand', () => { // per FR-001
    const deck = makeTestDeck();
    // Declarer (seat 0) gained the fourth 9 from the talon pickup → 8-card hand
    const hands = {
      0: [...NINE_IDS, 4, 5, 6, 7],
      1: [8, 9, 10, 11, 12, 13, 14, 15],
      2: [16, 17, 18, 19, 20, 21, 22],
    };
    assert.equal(Scoring.findFourNinesSeat(hands, deck), 0);
  });

  it('returns null when a fourth 9 was passed away in the exchange', () => { // per FR-001
    const deck = makeTestDeck();
    // Declarer (seat 0) held all four but passed 9♦ (id 3) to seat 1
    const hands = {
      0: [0, 1, 2, 4, 5, 6, 7, 8],
      1: [3, 9, 10, 11, 12, 13, 14, 15],
      2: [16, 17, 18, 19, 20, 21, 22, 23],
    };
    assert.equal(Scoring.findFourNinesSeat(hands, deck), null);
  });
});
