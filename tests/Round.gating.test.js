'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');

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
  return round;
}

describe('Round.gating — wrong-turn rejection', () => {
  it('submitBid from a non-currentTurnSeat returns rejected with a reason', () => {
    const round = makeRound();
    round.advanceFromDealingToBidding(); // currentTurnSeat = 1
    const r = round.submitBid(0, 100); // seat 0 is not the current turn
    assert.equal(r.rejected, true);
    assert.ok(r.reason, 'rejection reason must be provided');
  });

  it('submitPass from a non-currentTurnSeat is rejected', () => {
    const round = makeRound();
    round.advanceFromDealingToBidding(); // currentTurnSeat = 1
    const r = round.submitPass(2); // seat 2 is not the current turn
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });
});

describe('Round.gating — dealing phase', () => {
  it('submitBid during dealing phase is rejected', () => {
    const round = makeRound();
    assert.equal(round.phase, 'dealing');
    const r = round.submitBid(1, 100);
    assert.equal(r.rejected, true);
  });

  it('submitPass during dealing phase is rejected', () => {
    const round = makeRound();
    assert.equal(round.phase, 'dealing');
    const r = round.submitPass(1);
    assert.equal(r.rejected, true);
  });

  it('submitBid succeeds after advanceFromDealingToBidding', () => {
    const round = makeRound();
    round.advanceFromDealingToBidding();
    assert.equal(round.phase, 'bidding');
    assert.equal(round.submitBid(1, 100).rejected, false);
  });

  it('advanceFromDealingToBidding is idempotent — calling twice does not reset turn', () => {
    const round = makeRound();
    round.advanceFromDealingToBidding();
    round.submitBid(1, 100); // now it's seat 2's turn
    round.advanceFromDealingToBidding(); // second call — should be a no-op
    assert.equal(round.currentTurnSeat, 2, 'currentTurnSeat must not be reset by second advance');
  });
});

describe('Round.gating — post-resolution', () => {
  it('submitBid is rejected after the round resolves to a declarer', () => {
    const round = makeRound();
    round.advanceFromDealingToBidding();
    // P1 bids; P2 and Dealer pass → P1 becomes declarer
    round.submitBid(1, 120);
    round.submitPass(2);
    round.submitPass(0);
    assert.equal(round.phase, 'post-bid-decision');
    const r = round.submitBid(1, 130);
    assert.equal(r.rejected, true);
  });

  it('submitPass is rejected after the round resolves', () => {
    const round = makeRound();
    round.advanceFromDealingToBidding();
    round.submitPass(1);
    round.submitPass(2);
    round.submitPass(0);
    assert.equal(round.phase, 'post-bid-decision');
    const r = round.submitPass(0);
    assert.equal(r.rejected, true);
  });
});
