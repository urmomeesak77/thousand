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

describe('trickPlanner.chooseLead (FR-competent)', () => {
  const base = (deck, ids, extra) => ({
    legal: obj(deck, ids), hand: obj(deck, ids), trump: null, deck,
    goneCardIds: new Set(), currentTrick: [], playerCount: 3, trickNumber: 1,
    isDeclarer: true, declaredMarriages: [], ...extra,
  });

  it('cashes the highest-point boss card on the lead', () => { // per competent-play
    const deck = buildDeck([['A', 'D'], ['9', 'H']]); // A♦ has nothing above it -> boss
    const d = trickPlanner.chooseLead(base(deck, [0, 1]));
    assert.equal(d.cardId, 0); // A♦
  });

  it('draws the top trump when it has trump control', () => { // per competent-play
    const deck = buildDeck([['A', 'S'], ['K', 'S'], ['9', 'H']]);
    const d = trickPlanner.chooseLead(base(deck, [0, 1, 2], { trump: 'S' }));
    assert.equal(d.cardId, 0); // A♠ (top trump, also the boss)
  });

  it('leads a low side card, keeping aces/tens, when it has no boss or trump control', () => { // per competent-play
    // Full-ish deck so the hand holds no boss: K♥ (A♥,10♥ out), 9♦/J♦ (A♦,10♦,K♦,Q♦ out).
    const deck = buildDeck([
      ['K', 'H'], ['9', 'D'], ['J', 'D'],
      ['A', 'H'], ['10', 'H'],
      ['A', 'D'], ['10', 'D'], ['K', 'D'], ['Q', 'D'],
    ]);
    const d = trickPlanner.chooseLead(base(deck, [0, 1, 2]));
    assert.equal(d.cardId, 1); // 9♦ — lowest of the long ♦ side suit
  });
});

describe('trickPlanner.chooseLead — draw trumps with control (FR-competent)', () => {
  it('draws the top trump (a 9) when it has control but no boss point card', () => { // per competent-play
    // Trump ♠; the bot holds only 9♠ in trump but every higher spade is gone, so 9♠ is the
    // top remaining trump (control). It has no boss point card (A♥/10♥ keep K♥ live), so it
    // falls through the boss step into the draw-trumps branch and leads 9♠.
    const deck = buildDeck([
      ['A', 'S'], ['10', 'S'], ['K', 'S'], ['Q', 'S'], ['J', 'S'], ['9', 'S'],
      ['K', 'H'], ['9', 'D'], ['A', 'H'], ['10', 'H'],
    ]);
    const ctx = {
      legal: obj(deck, [5, 6, 7]), hand: obj(deck, [5, 6, 7]), trump: 'S', deck,
      goneCardIds: new Set([0, 1, 2, 3, 4]), currentTrick: [], playerCount: 3,
      trickNumber: 1, isDeclarer: true, declaredMarriages: [],
    };
    assert.equal(trickPlanner.chooseLead(ctx).cardId, 5); // 9♠
  });
});
