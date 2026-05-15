'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Scoring = require('../src/services/Scoring');

// FR-013: card point values — constants already exported
describe('Scoring — CARD_POINT_VALUE constants (FR-013)', () => {
  it('A is worth 11', () => {
    assert.equal(Scoring.CARD_POINT_VALUE['A'], 11);
  });

  it('10 is worth 10', () => {
    assert.equal(Scoring.CARD_POINT_VALUE['10'], 10);
  });

  it('K is worth 4', () => {
    assert.equal(Scoring.CARD_POINT_VALUE['K'], 4);
  });

  it('Q is worth 3', () => {
    assert.equal(Scoring.CARD_POINT_VALUE['Q'], 3);
  });

  it('J is worth 2', () => {
    assert.equal(Scoring.CARD_POINT_VALUE['J'], 2);
  });

  it('9 is worth 0', () => {
    assert.equal(Scoring.CARD_POINT_VALUE['9'], 0);
  });
});

// FR-013: cardPoints(cards) sums point values for an array of { rank, suit } objects
describe('Scoring.cardPoints — FR-013', () => {
  it('empty array returns 0', () => {
    assert.equal(Scoring.cardPoints([]), 0);
  });

  it('single Ace returns 11', () => {
    assert.equal(Scoring.cardPoints([{ rank: 'A', suit: '♣' }]), 11);
  });

  it('single Ten returns 10', () => {
    assert.equal(Scoring.cardPoints([{ rank: '10', suit: '♣' }]), 10);
  });

  it('single 9 returns 0', () => {
    assert.equal(Scoring.cardPoints([{ rank: '9', suit: '♣' }]), 0);
  });

  it('A + K + Q + J + 10 + 9 sums to 30', () => {
    const cards = [
      { rank: 'A', suit: '♣' },
      { rank: 'K', suit: '♣' },
      { rank: 'Q', suit: '♣' },
      { rank: 'J', suit: '♣' },
      { rank: '10', suit: '♣' },
      { rank: '9', suit: '♣' },
    ];
    assert.equal(Scoring.cardPoints(cards), 30);
  });

  it('all 24 cards sum to 120 (4 suits × 30)', () => {
    const suits = ['♣', '♠', '♥', '♦'];
    const ranks = ['9', '10', 'J', 'Q', 'K', 'A'];
    const cards = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        cards.push({ rank, suit });
      }
    }
    assert.equal(Scoring.cardPoints(cards), 120);
  });
});

// FR-013: roundScores(round) computes per-seat totals from collectedTricks + deck + declaredMarriages
describe('Scoring.roundScores — FR-013', () => {
  // Build a minimal round-like object with deck, collectedTricks, and declaredMarriages.
  // deck[id] = { id, rank, suit } — mirrors Round.deck layout after round.start().
  function makeRoundStub({ collectedBySeats, declaredMarriages = [] }) {
    // Build a deck of 24 cards: suits=['♣','♠','♥','♦'] x ranks=['9','10','J','Q','K','A']
    const suits = ['♣', '♠', '♥', '♦'];
    const ranks = ['9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ id: deck.length, rank, suit });
      }
    }
    return {
      deck,
      collectedTricks: collectedBySeats,
      declaredMarriages,
    };
  }

  it('returns 0 for all seats when collectedTricks are empty and no marriages', () => {
    const round = makeRoundStub({ collectedBySeats: { 0: [], 1: [], 2: [] } });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[0], 0);
    assert.equal(scores[1], 0);
    assert.equal(scores[2], 0);
  });

  it('seat with an Ace (id 5) scores 11', () => {
    // deck[5] = Ace of ♣ (suit-index 0, rank-index 5 → A♣)
    const round = makeRoundStub({ collectedBySeats: { 0: [5], 1: [], 2: [] } });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[0], 11);
    assert.equal(scores[1], 0);
    assert.equal(scores[2], 0);
  });

  it('seat with a Ten (id 1) scores 10', () => {
    // deck[1] = 10 of ♣ (rank-index 1 in ♣ suit)
    const round = makeRoundStub({ collectedBySeats: { 0: [], 1: [1], 2: [] } });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[1], 10);
  });

  it('all 24 card ids summed across all seats equals 120', () => {
    // Distribute cards: seat 0 gets ids 0–7, seat 1 gets 8–15, seat 2 gets 16–23
    const collectedBySeats = {
      0: [0, 1, 2, 3, 4, 5, 6, 7],
      1: [8, 9, 10, 11, 12, 13, 14, 15],
      2: [16, 17, 18, 19, 20, 21, 22, 23],
    };
    const round = makeRoundStub({ collectedBySeats });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[0] + scores[1] + scores[2], 120);
  });

  it('declaredMarriage in ♣ adds 100 bonus to the declaring seat', () => {
    const round = makeRoundStub({
      collectedBySeats: { 0: [], 1: [], 2: [] },
      declaredMarriages: [{ seat: 0, suit: '♣' }],
    });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[0], 100);
  });

  it('declaredMarriage in ♥ adds 60 bonus to the declaring seat', () => {
    const round = makeRoundStub({
      collectedBySeats: { 0: [], 1: [], 2: [] },
      declaredMarriages: [{ seat: 1, suit: '♥' }],
    });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[1], 60);
  });

  it('multiple marriages on different seats accumulate independently', () => {
    const round = makeRoundStub({
      collectedBySeats: { 0: [], 1: [], 2: [] },
      declaredMarriages: [
        { seat: 0, suit: '♣' },  // +100
        { seat: 2, suit: '♦' },  // +40
      ],
    });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[0], 100);
    assert.equal(scores[1], 0);
    assert.equal(scores[2], 40);
  });
});

// FR-014: roundDeltas(roundScores, declarerSeat, bid, penalties=[])
describe('Scoring.roundDeltas — FR-014', () => {
  it('declarer receives +bid when roundScore meets the bid', () => {
    // declarerSeat=0, bid=100, declarer has exactly 100 points
    const scores = { 0: 100, 1: 10, 2: 10 };
    const deltas = Scoring.roundDeltas(scores, 0, 100);
    assert.equal(deltas[0], 100);
  });

  it('declarer receives +bid when roundScore exceeds the bid', () => {
    const scores = { 0: 110, 1: 5, 2: 5 };
    const deltas = Scoring.roundDeltas(scores, 0, 100);
    assert.equal(deltas[0], 100);
  });

  it('declarer receives -bid when roundScore is below the bid', () => {
    const scores = { 0: 80, 1: 20, 2: 20 };
    const deltas = Scoring.roundDeltas(scores, 0, 100);
    assert.equal(deltas[0], -100);
  });

  it('each opponent receives their own roundScore as delta', () => {
    const scores = { 0: 110, 1: 5, 2: 5 };
    const deltas = Scoring.roundDeltas(scores, 0, 100);
    assert.equal(deltas[1], 5);
    assert.equal(deltas[2], 5);
  });

  it('opponent delta equals their card-point total (not bid amount)', () => {
    const scores = { 0: 80, 1: 30, 2: 10 };
    const deltas = Scoring.roundDeltas(scores, 1, 120);
    // seat 1 is declarer with 80 points vs bid of 120 → -120
    assert.equal(deltas[1], -120);
    // seat 0 and seat 2 are opponents
    assert.equal(deltas[0], 80);
    assert.equal(deltas[2], 10);
  });

  it('empty penalties array does not change the result', () => {
    const scores = { 0: 100, 1: 10, 2: 10 };
    const withEmpty = Scoring.roundDeltas(scores, 0, 100, []);
    const withoutPenalties = Scoring.roundDeltas(scores, 0, 100);
    assert.deepEqual(withEmpty, withoutPenalties);
  });

  it('declarerSeat=2 correctly identifies seat 2 as declarer and seats 0,1 as opponents', () => {
    const scores = { 0: 40, 1: 50, 2: 30 };
    const deltas = Scoring.roundDeltas(scores, 2, 100);
    // seat 2: 30 < 100 → -100
    assert.equal(deltas[2], -100);
    assert.equal(deltas[0], 40);
    assert.equal(deltas[1], 50);
  });
});
