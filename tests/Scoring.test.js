'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Scoring = require('../src/services/Scoring');

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
      declaredMarriages: [{ playerSeat: 0, suit: '♣' }],
    });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[0], 100);
  });

  it('declaredMarriage in ♥ adds 60 bonus to the declaring seat', () => {
    const round = makeRoundStub({
      collectedBySeats: { 0: [], 1: [], 2: [] },
      declaredMarriages: [{ playerSeat: 1, suit: '♥' }],
    });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[1], 60);
  });

  it('declaredMarriage in ♠ adds 80 bonus to the declaring seat', () => {
    const round = makeRoundStub({
      collectedBySeats: { 0: [], 1: [], 2: [] },
      declaredMarriages: [{ playerSeat: 0, suit: '♠' }],
    });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[0], 80);
  });

  it('multiple marriages on different seats accumulate independently', () => {
    const round = makeRoundStub({
      collectedBySeats: { 0: [], 1: [], 2: [] },
      declaredMarriages: [
        { playerSeat: 0, suit: '♣' },  // +100
        { playerSeat: 2, suit: '♦' },  // +40
      ],
    });
    const scores = Scoring.roundScores(round);
    assert.equal(scores[0], 100);
    assert.equal(scores[1], 0);
    assert.equal(scores[2], 40);
  });
});

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

describe('Scoring.determineWinner — FR-017', () => {
  function makeGameStub({ cumulativeScores, declarerSeat, dealerSeat = 0 }) {
    return {
      cumulativeScores,
      seatOrder: [0, 1, 2], // identity mapping for simplicity
      dealerSeat,
      history: [
        {
          round: 1,
          declarerSeat,
          bid: 100,
        },
      ],
    };
  }

  it('single winner: seat 0 with 1100 beats 500 and 300', () => {
    const game = makeGameStub({
      cumulativeScores: { 0: 1100, 1: 500, 2: 300 },
      declarerSeat: 0,
    });
    const result = Scoring.determineWinner(game);
    assert.equal(result.winnerSeat, 0);
  });

  it('single winner: seat 2 with 1050 beats 300 and 450', () => {
    const game = makeGameStub({
      cumulativeScores: { 0: 300, 1: 450, 2: 1050 },
      declarerSeat: 2,
    });
    const result = Scoring.determineWinner(game);
    assert.equal(result.winnerSeat, 2);
  });

  it('tie at top: declarer (seat 1) among tied (0:1000, 1:1000, 2:300) wins', () => {
    const game = makeGameStub({
      cumulativeScores: { 0: 1000, 1: 1000, 2: 300 },
      declarerSeat: 1,
    });
    const result = Scoring.determineWinner(game);
    assert.equal(result.winnerSeat, 1);
  });

  it('tie at top: declarer NOT among tied, seat-order fallback (dealerSeat=0, P1=1 beats P2=2)', () => {
    // dealerSeat=0 → P1=(0+1)%3=1, P2=(0+2)%3=2, Dealer=0
    // declarerSeat=0 is NOT tied (only seats 1 and 2 tied at 1000)
    // Among tied: P1=seat1 > P2=seat2
    const game = makeGameStub({
      cumulativeScores: { 0: 300, 1: 1000, 2: 1000 },
      declarerSeat: 0,
      dealerSeat: 0,
    });
    const result = Scoring.determineWinner(game);
    assert.equal(result.winnerSeat, 1); // P1 wins over P2
  });

  it('three-way tie (all 1000): declarer (seat 2) among tied wins', () => {
    const game = makeGameStub({
      cumulativeScores: { 0: 1000, 1: 1000, 2: 1000 },
      declarerSeat: 2,
    });
    const result = Scoring.determineWinner(game);
    assert.equal(result.winnerSeat, 2);
  });

  it('tie at top: declarer NOT among tied, seat-order fallback (dealerSeat=2, P1=0 loses, P2=1 wins over Dealer=2)', () => {
    // dealerSeat=2 → P1=(2+1)%3=0, P2=(2+2)%3=1, Dealer=2
    // declarerSeat=0 (P1) is NOT tied
    // Tied: seats 1 (P2) and 2 (Dealer)
    // P2 > Dealer → seat 1 wins
    const game = makeGameStub({
      cumulativeScores: { 0: 300, 1: 1050, 2: 1050 },
      declarerSeat: 0,
      dealerSeat: 2,
    });
    const result = Scoring.determineWinner(game);
    assert.equal(result.winnerSeat, 1); // P2 beats Dealer
  });

  it('tie at top: declarer (dealer=seat 0) NOT among tied, Dealer loses to P2 (dealerSeat=0, P1=1, P2=2, declarer=0)', () => {
    // dealerSeat=0 → P1=1, P2=2, Dealer=0
    // declarerSeat=0 (Dealer) is NOT tied (seats 1 and 2 tied)
    // Among tied: P1=seat1 > P2=seat2
    // seat 1 wins
    const game = makeGameStub({
      cumulativeScores: { 0: 500, 1: 1000, 2: 1000 },
      declarerSeat: 0,
      dealerSeat: 0,
    });
    const result = Scoring.determineWinner(game);
    assert.equal(result.winnerSeat, 1); // P1 wins (dealer loses to P1)
  });
});

describe('Scoring.buildFinalResults — FR-017', () => {
  function makeGameStubWithNicknames({ cumulativeScores, nicknames, declarerSeat, dealerSeat = 0 }) {
    return {
      cumulativeScores,
      nicknames,
      seatOrder: [0, 1, 2],
      dealerSeat,
      history: [
        {
          round: 1,
          declarerSeat,
          bid: 100,
        },
      ],
    };
  }

  it('builds finalRanking with all 3 seats sorted descending by score', () => {
    const game = makeGameStubWithNicknames({
      cumulativeScores: { 0: 1020, 1: 650, 2: 330 },
      nicknames: { 0: 'Alice', 1: 'Bob', 2: 'Carol' },
      declarerSeat: 0,
      dealerSeat: 0,
    });
    const result = Scoring.buildFinalResults(game);
    assert.equal(result.finalRanking.length, 3);
    assert.equal(result.finalRanking[0].seat, 0);
    assert.equal(result.finalRanking[0].cumulativeScore, 1020);
    assert.equal(result.finalRanking[1].seat, 1);
    assert.equal(result.finalRanking[1].cumulativeScore, 650);
    assert.equal(result.finalRanking[2].seat, 2);
    assert.equal(result.finalRanking[2].cumulativeScore, 330);
  });

  it('marks the winner with isWinner: true', () => {
    const game = makeGameStubWithNicknames({
      cumulativeScores: { 0: 1020, 1: 650, 2: 330 },
      nicknames: { 0: 'Alice', 1: 'Bob', 2: 'Carol' },
      declarerSeat: 0,
      dealerSeat: 0,
    });
    const result = Scoring.buildFinalResults(game);
    assert.equal(result.finalRanking[0].isWinner, true);
    assert.equal(result.finalRanking[1].isWinner, false);
    assert.equal(result.finalRanking[2].isWinner, false);
  });

  it('returns winnerSeat and winnerNickname from determineWinner', () => {
    const game = makeGameStubWithNicknames({
      cumulativeScores: { 0: 1020, 1: 650, 2: 330 },
      nicknames: { 0: 'Alice', 1: 'Bob', 2: 'Carol' },
      declarerSeat: 0,
      dealerSeat: 0,
    });
    const result = Scoring.buildFinalResults(game);
    assert.equal(result.winnerSeat, 0);
    assert.equal(result.winnerNickname, 'Alice');
  });

  it('includes history pass-through from game', () => {
    const mockHistory = [
      { round: 1, declarerSeat: 0, bid: 100 },
      { round: 2, declarerSeat: 1, bid: 120 },
    ];
    const game = makeGameStubWithNicknames({
      cumulativeScores: { 0: 1020, 1: 650, 2: 330 },
      nicknames: { 0: 'Alice', 1: 'Bob', 2: 'Carol' },
      declarerSeat: 1,
      dealerSeat: 0,
    });
    game.history = mockHistory;
    const result = Scoring.buildFinalResults(game);
    assert.deepEqual(result.history, mockHistory);
  });
});
