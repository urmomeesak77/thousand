'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const GameHistory = require('../src/services/GameHistory');

describe('GameHistory', () => {
  it('starts empty with toView() returning []', () => {
    const h = new GameHistory();
    assert.deepEqual(h.toView(), []);
  });

  it('assigns 0-based, strictly +1 monotonic seq that is never reused', () => {
    const h = new GameHistory();
    h.recordBid(0, 110, 1);
    h.recordPass(1, 1);
    h.recordTrick(2, 1, 1);
    const seqs = h.toView().map((e) => e.seq);
    assert.deepEqual(seqs, [0, 1, 2]);
  });

  it('appends in call order (uncapped retention)', () => {
    const h = new GameHistory();
    for (let i = 0; i < 50; i += 1) { h.recordPass(0, 1); }
    assert.equal(h.toView().length, 50);
    assert.equal(h.toView()[49].seq, 49);
  });

  it('toView() returns a clone — mutating it does not affect the log', () => {
    const h = new GameHistory();
    h.recordBid(0, 100, 1);
    const view = h.toView();
    view.push({ bogus: true });
    view[0].seq = 999;
    assert.equal(h.toView().length, 1, 'pushed entry must not leak back');
    assert.equal(h.toView()[0].seq, 0, 'entry must not be mutated through the view');
  });

  it('recordBid shape', () => {
    const h = new GameHistory();
    h.recordBid(2, 120, 3);
    assert.deepEqual(h.toView()[0], {
      seq: 0, kind: 'bid', roundNumber: 3, seat: 2, data: { amount: 120 },
    });
  });

  it('recordPass shape', () => {
    const h = new GameHistory();
    h.recordPass(1, 2);
    assert.deepEqual(h.toView()[0], {
      seq: 0, kind: 'pass', roundNumber: 2, seat: 1, data: {},
    });
  });

  it('recordMarriage shape', () => {
    const h = new GameHistory();
    h.recordMarriage(0, '♥', 100, 4);
    assert.deepEqual(h.toView()[0], {
      seq: 0, kind: 'marriage', roundNumber: 4, seat: 0, data: { suit: '♥', bonus: 100 },
    });
  });

  it('recordTrick shape (seat is the winner)', () => {
    const h = new GameHistory();
    h.recordTrick(2, 3, 1);
    assert.deepEqual(h.toView()[0], {
      seq: 0, kind: 'trick', roundNumber: 1, seat: 2, data: { trickNumber: 3 },
    });
  });

  it('recordRoundScore shape (seat null, per-seat deltas)', () => {
    const h = new GameHistory();
    const perSeat = { 0: 120, 1: -60, 2: 0 };
    h.recordRoundScore(4, perSeat, 0, 110);
    const entry = h.toView()[0];
    assert.deepEqual(entry, {
      seq: 0, kind: 'round-score', roundNumber: 4, seat: null,
      data: { perSeat: { 0: 120, 1: -60, 2: 0 }, declarerSeat: 0, bid: 110 },
    });
    // perSeat must be cloned, not aliased.
    perSeat[0] = 999;
    assert.equal(h.toView()[0].data.perSeat[0], 120);
  });

  it('recordSellStart shape (declarer puts the contract up for sale)', () => {
    const h = new GameHistory();
    h.recordSellStart(0, 2);
    assert.deepEqual(h.toView()[0], {
      seq: 0, kind: 'sell-start', roundNumber: 2, seat: 0, data: {},
    });
  });

  it('recordSellBid shape (opponent buy-bid)', () => {
    const h = new GameHistory();
    h.recordSellBid(1, 110, 3);
    assert.deepEqual(h.toView()[0], {
      seq: 0, kind: 'sell-bid', roundNumber: 3, seat: 1, data: { amount: 110 },
    });
  });

  it('recordSellPass shape (opponent declines to buy)', () => {
    const h = new GameHistory();
    h.recordSellPass(2, 1);
    assert.deepEqual(h.toView()[0], {
      seq: 0, kind: 'sell-pass', roundNumber: 1, seat: 2, data: {},
    });
  });

  it('recordSellSold shape (seat is the buyer)', () => {
    const h = new GameHistory();
    h.recordSellSold(1, 120, 4);
    assert.deepEqual(h.toView()[0], {
      seq: 0, kind: 'sell-sold', roundNumber: 4, seat: 1, data: { amount: 120 },
    });
  });

  it('recordSellReturned shape (seat is the original declarer)', () => {
    const h = new GameHistory();
    h.recordSellReturned(0, 5);
    assert.deepEqual(h.toView()[0], {
      seq: 0, kind: 'sell-returned', roundNumber: 5, seat: 0, data: {},
    });
  });

  it('recordSpecial shape for four-nines / barrel / zeros', () => {
    const h = new GameHistory();
    h.recordSpecial('four-nines', 0, 100, 2);
    h.recordSpecial('barrel', 1, -120, 5);
    h.recordSpecial('zeros', 2, -120, 6);
    assert.deepEqual(h.toView()[0], {
      seq: 0, kind: 'four-nines', roundNumber: 2, seat: 0, data: { amount: 100 },
    });
    assert.deepEqual(h.toView()[1], {
      seq: 1, kind: 'barrel', roundNumber: 5, seat: 1, data: { amount: -120 },
    });
    assert.deepEqual(h.toView()[2], {
      seq: 2, kind: 'zeros', roundNumber: 6, seat: 2, data: { amount: -120 },
    });
  });
});
