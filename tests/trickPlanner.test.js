'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const trickPlanner = require('../src/services/bots/trickPlanner');

// deck indexed by cardId; helper to build hand/legal objects.
function buildDeck(cards) { return cards.map(([rank, suit], id) => ({ id, rank, suit })); }
const obj = (deck, ids) => ids.map((id) => ({ cardId: id, rank: deck[id].rank, suit: deck[id].suit }));

describe('trickPlanner.chooseFollow (FR-competent)', () => {
  it('wins a point-rich trick with the cheapest winner', () => { // per competent-play
    const deck = buildDeck([['A', 'H'], ['J', 'H'], ['K', 'H']]);
    const hand = obj(deck, [0, 1]);
    const ctx = {
      legal: hand, hand, trump: null, deck, goneCardIds: new Set(),
      currentTrick: [{ seat: 1, cardId: 2 }], playerCount: 3, trickNumber: 3,
    };
    assert.equal(trickPlanner.chooseFollow(ctx).cardId, 0); // A♥
  });

  it('ducks a worthless trick to save the high card', () => { // per competent-play
    const deck = buildDeck([['A', 'H'], ['9', 'H'], ['9', 'D']]);
    const hand = obj(deck, [0, 1]);
    const ctx = {
      legal: obj(deck, [0, 1]), hand, trump: null, deck, goneCardIds: new Set(),
      currentTrick: [{ seat: 1, cardId: 2 }], playerCount: 3, trickNumber: 3,
    };
    assert.equal(trickPlanner.chooseFollow(ctx).cardId, 1); // 9♥, not the ace
  });

  it('does not commit a high card mid-trick unless it is a sure winner', () => { // per competent-play
    const deck = buildDeck([['K', 'H'], ['9', 'H'], ['A', 'H'], ['10', 'H']]);
    const hand = obj(deck, [0, 1]); // K♥, 9♥
    const ctx = {
      legal: hand, hand, trump: null, deck, goneCardIds: new Set(),
      currentTrick: [{ seat: 2, cardId: 3 }], // led 10♥ (10 pts)
      playerCount: 3, trickNumber: 3,
    };
    assert.equal(trickPlanner.chooseFollow(ctx).cardId, 1); // 9♥
  });
});
