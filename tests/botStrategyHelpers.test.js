'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/services/bots/botStrategyHelpers');
const { trickPoints, cheapestWinner, hasTrumpControl } = H;

const card = (cardId, rank, suit) => ({ cardId, rank, suit });

// per FR-007, FR-008 — pure card-evaluation helpers the strategy is built on.
describe('botStrategyHelpers.rankValue / rankStrength', () => {
  it('values aces and tens highest by points', () => {
    assert.equal(H.rankValue('A'), 11);
    assert.equal(H.rankValue('10'), 10);
    assert.equal(H.rankValue('9'), 0);
    assert.equal(H.rankValue('?'), 0);
  });

  it('ranks Ten above K/Q but Ace highest for winning', () => {
    assert.ok(H.rankStrength('10') > H.rankStrength('K'));
    assert.ok(H.rankStrength('A') > H.rankStrength('10'));
    assert.ok(H.rankStrength('9') > H.rankStrength('8'));
  });
});

describe('botStrategyHelpers.roundDownToStep', () => {
  it('rounds down to the nearest step', () => {
    assert.equal(H.roundDownToStep(127, 5), 125);
    assert.equal(H.roundDownToStep(125, 5), 125);
  });
});

describe('botStrategyHelpers.findMarriages', () => {
  it('finds suits holding both K and Q', () => {
    const cards = [card(0, 'K', 'C'), card(1, 'Q', 'C'), card(2, 'K', 'S'), card(3, 'A', 'S')];
    assert.deepEqual(H.findMarriages(cards), ['C']);
  });
});

describe('botStrategyHelpers.pickCard', () => {
  it('picks the lowest- or highest-value card', () => {
    const cards = [card(0, 'A', 'C'), card(1, 'J', 'S'), card(2, '10', 'H')];
    assert.equal(H.pickCard(cards, { highest: false }).rank, 'J');
    assert.equal(H.pickCard(cards, { highest: true }).rank, 'A');
  });

  it('returns null for an empty pool', () => {
    assert.equal(H.pickCard([], { highest: false }), null);
  });
});

describe('botStrategyHelpers.bestCenterCard / cardBeats', () => {
  it('a trump beats any non-trump on the table', () => {
    const center = [card(0, 'A', 'H'), card(1, '9', 'S')];
    const best = H.bestCenterCard(center, 'S'); // S is trump → the 9♠ wins despite A♥
    assert.equal(best.suit, 'S');
    assert.equal(best.rank, '9');
    // A non-trump A♥ cannot beat the trump 9♠; a higher trump can.
    assert.equal(H.cardBeats(card(2, 'A', 'H'), best, 'S'), false);
    assert.equal(H.cardBeats(card(3, 'J', 'S'), best, 'S'), true);
  });

  it('off-suit non-trump cannot beat the led suit', () => {
    const best = card(0, 'K', 'H'); // led hearts, no trump
    assert.equal(H.cardBeats(card(1, 'A', 'D'), best, null), false);
    assert.equal(H.cardBeats(card(2, 'A', 'H'), best, null), true);
  });

  it('higher trump beats lower trump', () => {
    const best = card(0, '9', 'S');
    assert.equal(H.cardBeats(card(1, 'A', 'S'), best, 'S'), true);
  });
});

describe('botStrategyHelpers.estimateMakeable', () => {
  it('adds complete-marriage bonus on top of the sweep floor', () => {
    const hand = [card(0, 'K', 'C'), card(1, 'Q', 'C'), card(2, 'A', 'S')];
    const est = H.estimateMakeable(hand);
    assert.equal(est.value, 105 + 100); // clubs marriage = 100
    assert.deepEqual(est.complete, ['C']);
  });

  it('caps the half-marriage nudge at 10', () => {
    const hand = [card(0, 'K', 'C'), card(1, 'K', 'S'), card(2, 'K', 'H')]; // 3 half-marriages
    assert.equal(H.estimateMakeable(hand).value, 105 + 10);
  });
});

describe('botNames.pickBotName', () => {
  const { pickBotName, BOT_NAMES } = require('../src/services/bots/botNames');

  it('returns an unused themed name', () => {
    const name = pickBotName(['Robo-Ada']);
    assert.notEqual(name, 'Robo-Ada');
    assert.ok(BOT_NAMES.includes(name));
  });

  it('falls back to a numbered name when the themed pool is exhausted', () => {
    const name = pickBotName(BOT_NAMES);
    assert.equal(name, 'Robo-1');
    // and keeps incrementing past taken fallbacks
    assert.equal(pickBotName([...BOT_NAMES, 'Robo-1']), 'Robo-2');
  });
});

describe('botStrategyHelpers.pickExchangeCard', () => {
  it('never gives away a marriage card or an ace/ten', () => {
    const hand = [card(0, 'K', 'C'), card(1, 'Q', 'C'), card(2, 'A', 'S'), card(3, 'J', 'H'), card(4, '9', 'D')];
    const chosen = H.pickExchangeCard(hand);
    // The 9♦ (value 0) is the weakest non-essential card.
    assert.equal(chosen.cardId, 4);
  });

  it('falls back to a protected card only when nothing else remains', () => {
    const hand = [card(0, 'A', 'S'), card(1, '10', 'H')];
    const chosen = H.pickExchangeCard(hand);
    assert.ok(chosen, 'still returns a card');
    assert.equal(chosen.rank, '10'); // lower point value than the ace
  });
});

describe('trickPoints', () => {
  it('sums the point value of the cards on the table', () => { // per competent-play
    assert.equal(trickPoints([{ rank: 'A', suit: 'H' }, { rank: 'K', suit: 'H' }]), 15); // 11 + 4
    assert.equal(trickPoints([{ rank: '9', suit: 'S' }]), 0);
    assert.equal(trickPoints([]), 0);
  });
});

describe('cheapestWinner', () => {
  const C = (rank, suit) => ({ cardId: 0, rank, suit });
  it('returns the lowest-strength card that beats the current best, trump-aware', () => { // per competent-play
    const legal = [C('A', 'H'), C('K', 'H'), C('J', 'H')];
    const best = { rank: '10', suit: 'H' };
    assert.equal(cheapestWinner(legal, best, null).rank, 'A'); // only A beats 10 in hearts
  });
  it('returns null when nothing beats the best', () => { // per competent-play
    const legal = [{ cardId: 1, rank: '9', suit: 'H' }, { cardId: 2, rank: 'J', suit: 'H' }];
    assert.equal(cheapestWinner(legal, { rank: 'A', suit: 'H' }, null), null);
  });
});

describe('hasTrumpControl', () => {
  const deck = [['A', 'S'], ['10', 'S'], ['K', 'S']].map(([rank, suit], id) => ({ id, rank, suit }));
  it('is true when the bot holds the top remaining trump', () => { // per competent-play
    const hand = [{ cardId: 0, rank: 'A', suit: 'S' }];
    const ctx = { goneCardIds: new Set(), hand, currentTrick: [], deck };
    assert.equal(hasTrumpControl(hand, ctx, 'S'), true);
  });
  it('is false when a higher trump is still unaccounted', () => { // per competent-play
    const hand = [{ cardId: 1, rank: '10', suit: 'S' }];
    const ctx = { goneCardIds: new Set(), hand, currentTrick: [], deck };
    assert.equal(hasTrumpControl(hand, ctx, 'S'), false); // A♠ still out
  });
  it('is false with no trump', () => { // per competent-play
    assert.equal(hasTrumpControl([{ cardId: 0, rank: 'A', suit: 'S' }], { goneCardIds: new Set(), hand: [], currentTrick: [], deck }, null), false);
  });
});

describe('estimateMakeable — trump length + extra aces nudge (FR-competent)', () => {
  const hand = (cards) => cards.map(([rank, suit]) => ({ rank, suit }));

  it('values surplus aces above an otherwise-flat hand', () => { // per competent-play
    const flat = hand([['J', 'H'], ['9', 'S'], ['J', 'D'], ['9', 'C']]); // no aces, no long suit
    const aces = hand([['A', 'C'], ['A', 'S'], ['A', 'H'], ['9', 'D']]); // 3 aces ⇒ +10 nudge
    assert.ok(H.estimateMakeable(aces).value > H.estimateMakeable(flat).value);
  });

  it('values a long suit above a flat hand', () => { // per competent-play
    const flat = hand([['J', 'H'], ['9', 'S'], ['J', 'D'], ['9', 'C']]);
    const long = hand([['J', 'C'], ['9', 'C'], ['Q', 'C'], ['10', 'C'], ['J', 'H']]); // 4-long clubs
    assert.ok(H.estimateMakeable(long).value > H.estimateMakeable(flat).value);
  });

  it('caps the nudge at 20 (never runs away on its own)', () => { // per competent-play
    // 4 aces + a 4-long suit, no complete marriage: nudge maxes at 20, half-marriage ≤ 10.
    const huge = hand([['A', 'C'], ['A', 'S'], ['A', 'H'], ['A', 'D'], ['10', 'C'], ['9', 'C'], ['K', 'C']]);
    assert.ok(H.estimateMakeable(huge).value <= 105 + 10 + 20);
  });
});
