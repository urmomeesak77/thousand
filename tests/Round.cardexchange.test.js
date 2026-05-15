'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');

// Reaches post-bid-decision with seat 0 as declarer (P1 and P2 both pass).
// After absorption: hands[0] = 10 cards, hands[1] = 7 cards, hands[2] = 7 cards.
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
  round.advanceFromDealingToBidding();
  round.submitPass(1); // P1 passes → seat 2 is next
  round.submitPass(2); // P2 passes → remaining=[0], dealer becomes declarer at 100
  return round;
}

// Reaches card-exchange phase with declarerSeat=0 and 10 cards in hand.
// Calls startGame then forces card-exchange phase since startGame currently sets
// 'play-phase-ready'; once the implementation lands it will transition to 'card-exchange'.
function makeCardExchangeRound() {
  const round = makeRound();
  // Force the phase and exchange state that the implementation will produce.
  // Tests call submitExchangePass directly; the method does not exist yet → tests fail.
  round.phase = 'card-exchange';
  round.exchangePassesCommitted = 0;
  round.usedExchangeDestSeats = new Set();
  return round;
}

// ---------------------------------------------------------------------------
// FR-002 / FR-003 — card exchange validation
// ---------------------------------------------------------------------------

describe('Round.cardexchange — declarer can pass a card to each non-declarer seat (FR-002)', () => {
  it('first pass to seat 1 is accepted', () => {
    const round = makeCardExchangeRound();
    const cardId = round.hands[0][0];
    const r = round.submitExchangePass(0, cardId, 1);
    assert.equal(r.rejected, false);
  });

  it('first pass to seat 2 is accepted', () => {
    const round = makeCardExchangeRound();
    const cardId = round.hands[0][0];
    const r = round.submitExchangePass(0, cardId, 2);
    assert.equal(r.rejected, false);
  });
});

describe('Round.cardexchange — non-declarer cannot submit a pass (FR-003)', () => {
  it('seat 1 (non-declarer) pass attempt is rejected', () => {
    const round = makeCardExchangeRound();
    const cardId = round.hands[1][0];
    const r = round.submitExchangePass(1, cardId, 2);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('seat 2 (non-declarer) pass attempt is rejected', () => {
    const round = makeCardExchangeRound();
    const cardId = round.hands[2][0];
    const r = round.submitExchangePass(2, cardId, 0);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });
});

describe('Round.cardexchange — card must be in declarer\'s hand (FR-002)', () => {
  it('card not in declarer hand is rejected', () => {
    const round = makeCardExchangeRound();
    // seat 1's first card is not in seat 0's hand
    const cardNotInHand = round.hands[1][0];
    const r = round.submitExchangePass(0, cardNotInHand, 1);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });
});

describe('Round.cardexchange — destSeat must be a non-declarer seat (FR-002)', () => {
  it('passing to own seat (declarerSeat) is rejected', () => {
    const round = makeCardExchangeRound();
    const cardId = round.hands[0][0];
    const r = round.submitExchangePass(0, cardId, 0); // destSeat === declarerSeat
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });
});

describe('Round.cardexchange — same destSeat cannot be used twice (FR-003)', () => {
  it('using the same destSeat twice in one round is rejected', () => {
    const round = makeCardExchangeRound();
    const cardId1 = round.hands[0][0];
    const cardId2 = round.hands[0][1];
    round.submitExchangePass(0, cardId1, 1); // first pass to seat 1
    const r = round.submitExchangePass(0, cardId2, 1); // second pass to seat 1 again
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });
});

describe('Round.cardexchange — second pass completes exchange and transitions phase (FR-003)', () => {
  it('after two passes exchangePassesCommitted === 2', () => {
    const round = makeCardExchangeRound();
    const cardId1 = round.hands[0][0];
    const cardId2 = round.hands[0][1];
    round.submitExchangePass(0, cardId1, 1);
    round.submitExchangePass(0, cardId2, 2);
    assert.equal(round.exchangePassesCommitted, 2);
  });

  it('after two passes phase transitions to "trick-play"', () => {
    const round = makeCardExchangeRound();
    const cardId1 = round.hands[0][0];
    const cardId2 = round.hands[0][1];
    round.submitExchangePass(0, cardId1, 1);
    round.submitExchangePass(0, cardId2, 2);
    assert.equal(round.phase, 'trick-play');
  });

  it('after two passes trickNumber is 1', () => {
    const round = makeCardExchangeRound();
    const cardId1 = round.hands[0][0];
    const cardId2 = round.hands[0][1];
    round.submitExchangePass(0, cardId1, 1);
    round.submitExchangePass(0, cardId2, 2);
    assert.equal(round.trickNumber, 1);
  });

  it('after two passes currentTrickLeaderSeat is the declarerSeat', () => {
    const round = makeCardExchangeRound();
    const cardId1 = round.hands[0][0];
    const cardId2 = round.hands[0][1];
    round.submitExchangePass(0, cardId1, 1);
    round.submitExchangePass(0, cardId2, 2);
    assert.equal(round.currentTrickLeaderSeat, round.declarerSeat);
  });

  it('after two passes currentTurnSeat is the declarerSeat', () => {
    const round = makeCardExchangeRound();
    const cardId1 = round.hands[0][0];
    const cardId2 = round.hands[0][1];
    round.submitExchangePass(0, cardId1, 1);
    round.submitExchangePass(0, cardId2, 2);
    assert.equal(round.currentTurnSeat, round.declarerSeat);
  });

  it('first pass does not yet transition phase (still card-exchange)', () => {
    const round = makeCardExchangeRound();
    const cardId = round.hands[0][0];
    round.submitExchangePass(0, cardId, 1);
    assert.equal(round.phase, 'card-exchange');
  });
});

describe('Round.cardexchange — second pass is restricted to the remaining opponent (FR-003)', () => {
  it('after passing to seat 1, passing to seat 1 again is rejected; seat 2 succeeds', () => {
    const round = makeCardExchangeRound();
    const cardId1 = round.hands[0][0];
    const cardId2 = round.hands[0][1];
    round.submitExchangePass(0, cardId1, 1);
    const rejected = round.submitExchangePass(0, cardId2, 1); // same dest
    assert.equal(rejected.rejected, true);
    const cardId3 = round.hands[0][1]; // next card in hand after first pass removed it
    const accepted = round.submitExchangePass(0, cardId3, 2);
    assert.equal(accepted.rejected, false);
  });
});

describe('Round.cardexchange — card moves from declarer hand to recipient hand (FR-002)', () => {
  it('passed card is removed from declarer hand and added to recipient hand', () => {
    const round = makeCardExchangeRound();
    const cardId = round.hands[0][0];
    round.submitExchangePass(0, cardId, 1);
    assert.ok(!round.hands[0].includes(cardId), 'card must leave declarer hand');
    assert.ok(round.hands[1].includes(cardId), 'card must arrive in recipient hand');
  });
});
