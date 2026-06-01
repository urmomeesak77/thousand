'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Scoring = require('../src/services/Scoring');
const { makeDeck } = require('../src/services/Deck');

describe('Scoring — 4-player extended deck points & rank order (FR-007, FR-008)', () => {
  it('7 and 8 are worth 0 trick points', () => { // per FR-007
    assert.equal(Scoring.CARD_POINT_VALUE['7'], 0);
    assert.equal(Scoring.CARD_POINT_VALUE['8'], 0);
  });

  it('the full 32-card deck totals 120 trick points (7/8 contribute nothing)', () => { // per FR-007
    const total = makeDeck(4).reduce((sum, c) => sum + Scoring.CARD_POINT_VALUE[c.rank], 0);
    assert.equal(total, 120);
  });

  it('7 and 8 rank below the 9, and a 7 or 8 never outranks a 9+ of the same suit', () => { // per FR-008
    const R = Scoring.RANK_ORDER;
    assert.ok(R['7'] < R['8'], '7 < 8');
    assert.ok(R['8'] < R['9'], '8 < 9');
    // Every 9+ rank outranks both the 7 and the 8 (same-suit winner picks max RANK_ORDER).
    for (const higher of ['9', 'J', 'Q', 'K', '10', 'A']) {
      assert.ok(R['7'] < R[higher], `7 < ${higher}`);
      assert.ok(R['8'] < R[higher], `8 < ${higher}`);
    }
    // 9→A relative order preserved (Ten outranks K and Q; Ace highest)
    assert.ok(R['9'] < R['J'] && R['J'] < R['Q'] && R['Q'] < R['K'] && R['K'] < R['10'] && R['10'] < R['A']);
  });
});

describe('Scoring — 4-seat round scoring (FR-015)', () => {
  function makeRoundLike(cardsBySeat, marriages = []) {
    const deck = [];
    const collectedTricks = { 0: [], 1: [], 2: [], 3: [] };
    for (const seat of [0, 1, 2, 3]) {
      for (const card of cardsBySeat[seat]) {
        const id = deck.length;
        deck.push({ id, ...card });
        collectedTricks[seat].push(id);
      }
    }
    return { playerCount: 4, deck, collectedTricks, declaredMarriages: marriages };
  }

  it('roundScores sums card points across all four seats', () => { // per FR-015
    const round = makeRoundLike({
      0: [{ rank: 'A', suit: '♣' }, { rank: '10', suit: '♣' }], // 21
      1: [{ rank: 'K', suit: '♠' }, { rank: 'Q', suit: '♠' }], // 7
      2: [{ rank: 'J', suit: '♥' }, { rank: '9', suit: '♥' }], // 2
      3: [{ rank: '7', suit: '♦' }, { rank: '8', suit: '♦' }], // 0
    });
    assert.deepEqual(Scoring.roundScores(round), { 0: 21, 1: 7, 2: 2, 3: 0 });
  });

  it('roundDeltas covers four seats: declarer made bid +bid, opponents +their points', () => { // per FR-015
    const deltas = Scoring.roundDeltas({ 0: 100, 1: 10, 2: 5, 3: 5 }, 0, 100, 4);
    assert.deepEqual(deltas, { 0: 100, 1: 10, 2: 5, 3: 5 });
  });

  it('roundDeltas: declarer missing the bid loses the bid across a 4-seat map', () => { // per FR-015
    const deltas = Scoring.roundDeltas({ 0: 80, 1: 20, 2: 10, 3: 10 }, 0, 120, 4);
    assert.equal(deltas[0], -120);
    assert.equal(deltas[3], 10);
  });
});

describe('Scoring — 4-player winner & tiebreak (FR-016)', () => {
  function makeGame({ cumulativeScores, declarerSeat, dealerSeat = 0 }) {
    return {
      playerCount: 4,
      cumulativeScores,
      dealerSeat,
      nicknames: { 0: 'A', 1: 'B', 2: 'C', 3: 'D' },
      history: [{ roundNumber: 1, declarerSeat, bid: 100 }],
    };
  }

  it('single max over four seats wins outright', () => { // per FR-016
    const game = makeGame({ cumulativeScores: { 0: 1100, 1: 500, 2: 300, 3: 900 }, declarerSeat: 3 });
    assert.equal(Scoring.determineWinner(game).winnerSeat, 0);
  });

  it('tie at max: the most recent declarer among the tied set wins', () => { // per FR-016
    const game = makeGame({ cumulativeScores: { 0: 1000, 1: 300, 2: 1000, 3: 1000 }, declarerSeat: 2 });
    assert.equal(Scoring.determineWinner(game).winnerSeat, 2);
  });

  it('tie at max, declarer not tied: clockwise P1→P2→P3→Dealer order', () => { // per FR-016
    // dealer 0 → priority [P1=1, P2=2, P3=3, Dealer=0]; tied {2,3}; declarer 0 not tied → P2=seat 2
    const game = makeGame({ cumulativeScores: { 0: 300, 1: 300, 2: 1000, 3: 1000 }, declarerSeat: 0 });
    assert.equal(Scoring.determineWinner(game).winnerSeat, 2);
  });

  it('tie at max, dealer rotation respected (dealer 2): P1=3 wins over Dealer=2', () => { // per FR-016
    // dealer 2 → priority [P1=3, P2=0, P3=1, Dealer=2]; tied {2,3}; declarer 0 not tied → P1=seat 3
    const game = makeGame({ cumulativeScores: { 0: 300, 1: 300, 2: 1000, 3: 1000 }, declarerSeat: 0, dealerSeat: 2 });
    assert.equal(Scoring.determineWinner(game).winnerSeat, 3);
  });

  it('buildFinalResults ranks all four seats descending', () => { // per FR-016
    const game = makeGame({ cumulativeScores: { 0: 1020, 1: 650, 2: 330, 3: 900 }, declarerSeat: 0 });
    const result = Scoring.buildFinalResults(game);
    assert.equal(result.finalRanking.length, 4);
    assert.deepEqual(result.finalRanking.map((r) => r.seat), [0, 3, 1, 2]);
  });
});
