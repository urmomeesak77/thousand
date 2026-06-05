'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sellEvaluator = require('../src/services/bots/sellEvaluator');

const hand = (cards) => cards.map(([rank, suit], cardId) => ({ cardId, rank, suit }));

describe('sellEvaluator.takeOrSell (FR-competent)', () => {
  it('takes when the hand can make the bid', () => { // per competent-play
    const strong = hand([['K', 'C'], ['Q', 'C'], ['A', 'S'], ['A', 'H']]);
    assert.equal(sellEvaluator.takeOrSell(strong, 120, 0.5, 1).kind, 'startGame');
  });
  it('sells a hopeless hand', () => { // per competent-play
    const weak = hand([['9', 'D'], ['J', 'D'], ['9', 'S'], ['J', 'H']]);
    assert.equal(sellEvaluator.takeOrSell(weak, 200, 0.5, 1).kind, 'sellStart');
  });
  it('is forced to take when no sell attempts remain', () => { // per competent-play
    const weak = hand([['9', 'D'], ['J', 'D']]);
    assert.equal(sellEvaluator.takeOrSell(weak, 200, 0.5, 0).kind, 'startGame');
  });
  it('sells when the talon did not lift the hand to the bid', () => { // per competent-play
    const starved = hand([['A', 'S'], ['10', 'S'], ['J', 'H'], ['9', 'D']]); // ~21 expected
    assert.equal(sellEvaluator.takeOrSell(starved, 200, 0.5, 1).kind, 'sellStart');
  });
  it('a bolder bot takes a thinner hand than a cautious one', () => { // per competent-play
    const marginal = hand([['K', 'S'], ['Q', 'S'], ['9', 'D'], ['J', 'H']]);
    const cautious = sellEvaluator.takeOrSell(marginal, 130, 0, 1).kind;
    const bold = sellEvaluator.takeOrSell(marginal, 130, 1, 1).kind;
    assert.ok(!(cautious === 'startGame' && bold === 'sellStart'));
  });
});

describe('sellEvaluator.buyOrPass (FR-competent)', () => {
  it('buys when the exposed cards make the contract clearly profitable', () => { // per competent-play
    const own = hand([['K', 'C'], ['Q', 'C']]);
    const exposed = [{ rank: 'A', suit: 'S' }, { rank: 'A', suit: 'H' }, { rank: '10', suit: 'C' }];
    const d = sellEvaluator.buyOrPass(own, exposed, 100, 0.5, null);
    assert.equal(d.kind, 'sellBid');
    assert.ok(d.amount >= 100);
  });
  it('passes when the merged hand cannot beat the bid', () => { // per competent-play
    const own = hand([['9', 'D'], ['J', 'D']]);
    const exposed = [{ rank: '9', suit: 'S' }, { rank: 'J', suit: 'H' }, { rank: 'Q', suit: 'D' }];
    assert.equal(sellEvaluator.buyOrPass(own, exposed, 200, 0.5, null).kind, 'sellPass');
  });
});

describe('sellEvaluator.chooseSellExposure (FR-competent)', () => {
  it('exposes the strongest `count` cards to entice a buyer', () => { // per competent-play
    const h = [['A', 'S'], ['9', 'D'], ['K', 'C'], ['J', 'H'], ['10', 'C']]
      .map(([rank, suit], cardId) => ({ cardId, rank, suit }));
    const ids = sellEvaluator.chooseSellExposure(h, 3);
    assert.equal(ids.length, 3);
    assert.ok(ids.includes(0)); // A♠ (11)
    assert.ok(ids.includes(4)); // 10♣ (10)
    assert.ok(ids.includes(2)); // K♣ (4)
    assert.ok(!ids.includes(1)); // not the 9♦ (0)
  });
  it('exposes a K/Q ahead of a high-point ten to bait a marriage', () => { // per competent-play
    const h = [['A', 'S'], ['10', 'H'], ['10', 'C'], ['Q', 'D']]
      .map(([rank, suit], cardId) => ({ cardId, rank, suit }));
    const ids = sellEvaluator.chooseSellExposure(h, 3);
    assert.ok(ids.includes(3), 'Q♦ exposed as marriage bait');   // the queen
    assert.ok(!ids.includes(2), '10♣ dropped to make room for the queen');
  });
  it('exposes at most one K/Q so it never reveals an all-marriage hand', () => { // per competent-play
    const h = [['K', 'C'], ['Q', 'S'], ['K', 'H'], ['A', 'D'], ['A', 'C']]
      .map(([rank, suit], cardId) => ({ cardId, rank, suit }));
    const exposed = sellEvaluator.chooseSellExposure(h, 3).map((id) => h.find((c) => c.cardId === id));
    const kq = exposed.filter((c) => c.rank === 'K' || c.rank === 'Q').length;
    assert.ok(kq <= 1, `exposed ${kq} K/Q cards, want at most 1`);
    assert.ok(exposed.some((c) => c.rank === 'A'), 'fills with strong point cards (an ace)');
  });
  it('never baits with a K/Q from a marriage the declarer holds complete', () => { // per competent-play
    // K♣+Q♣ is a complete marriage; its partner stays with the declarer, so a buyer
    // can never complete it — exposing either half only reveals/breaks the marriage.
    const h = [['K', 'C'], ['Q', 'C'], ['A', 'S'], ['A', 'H'], ['10', 'D']]
      .map(([rank, suit], cardId) => ({ cardId, rank, suit }));
    const exposed = sellEvaluator.chooseSellExposure(h, 3).map((id) => h.find((c) => c.cardId === id));
    assert.ok(
      !exposed.some((c) => c.suit === 'C' && (c.rank === 'K' || c.rank === 'Q')),
      'a complete-marriage K/Q is held back, not exposed as bait',
    );
  });
  it('varies the exposed set on a retry so it differs from a prior attempt (FR-016)', () => { // per competent-play
    const h = [['A', 'S'], ['A', 'H'], ['10', 'D'], ['K', 'C'], ['9', 'S'], ['J', 'H']]
      .map(([rank, suit], cardId) => ({ cardId, rank, suit }));
    const first = sellEvaluator.chooseSellExposure(h, 3);
    const second = sellEvaluator.chooseSellExposure(h, 3, [first]);
    const key = (ids) => [...ids].sort((a, b) => a - b).join(',');
    assert.notEqual(key(second), key(first), 'a second attempt exposes a different set');
  });
});
