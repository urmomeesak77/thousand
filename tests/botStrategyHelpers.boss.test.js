'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isBossCard } = require('../src/services/bots/botStrategyHelpers');

// Deck indexed by cardId. Higher hearts than K♥ are A♥(0) and 10♥(1); spades are a
// separate suit used to probe trump-awareness.
const DECK = [
  { rank: 'A', suit: 'H' },  // 0
  { rank: '10', suit: 'H' }, // 1
  { rank: 'K', suit: 'H' },  // 2  ← the candidate
  { rank: 'Q', suit: 'H' },  // 3
  { rank: 'A', suit: 'S' },  // 4
  { rank: '9', suit: 'S' },  // 5
];
const KING_HEARTS = { cardId: 2, rank: 'K', suit: 'H' };

function ctx({ goneCardIds = [], hand = [], currentTrick = [] }) {
  return { goneCardIds: new Set(goneCardIds), hand, currentTrick, deck: DECK };
}

describe('isBossCard — accounting for higher cards (H1, FR-013)', () => {
  it('is a boss when every higher card of its suit is recalled gone', () => { // per FR-013
    assert.equal(isBossCard(KING_HEARTS, ctx({ goneCardIds: [0, 1], hand: [KING_HEARTS] }), null), true);
  });

  it('is NOT a boss when a higher card is forgotten (absent from goneCardIds) — H3', () => { // per FR-013
    // A♥(0) recalled gone but 10♥(1) forgotten ⇒ an unaccounted card can still beat it.
    assert.equal(isBossCard(KING_HEARTS, ctx({ goneCardIds: [0], hand: [KING_HEARTS] }), null), false);
  });

  it('counts higher cards held in the bot\'s own hand as accounted', () => { // per FR-013
    const hand = [KING_HEARTS, { cardId: 0, rank: 'A', suit: 'H' }, { cardId: 1, rank: '10', suit: 'H' }];
    assert.equal(isBossCard(KING_HEARTS, ctx({ hand }), null), true);
  });

  it('counts higher cards already on the table as accounted', () => { // per FR-013
    const currentTrick = [{ seat: 1, cardId: 0 }, { seat: 2, cardId: 1 }];
    assert.equal(isBossCard(KING_HEARTS, ctx({ hand: [KING_HEARTS], currentTrick }), null), true);
  });
});

describe('isBossCard — trump awareness (H2, FR-013)', () => {
  it('is NOT a boss while live trumps could ruff it', () => { // per FR-013
    // Hearts all accounted, but spades are trump and A♠/9♠ are unaccounted ⇒ ruffable.
    assert.equal(isBossCard(KING_HEARTS, ctx({ goneCardIds: [0, 1], hand: [KING_HEARTS] }), 'S'), false);
  });

  it('becomes a boss once every higher card AND every trump is accounted', () => { // per FR-013
    assert.equal(isBossCard(KING_HEARTS, ctx({ goneCardIds: [0, 1, 4, 5], hand: [KING_HEARTS] }), 'S'), true);
  });

  it('a trump card is a boss when only lower trumps remain', () => { // per FR-013
    const aceSpades = { cardId: 4, rank: 'A', suit: 'S' };
    // A♠ is the top trump; nothing can beat it regardless of the hearts.
    assert.equal(isBossCard(aceSpades, ctx({ hand: [aceSpades] }), 'S'), true);
  });
});
