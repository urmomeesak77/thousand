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
  round.advanceFromDealingToBidding();
  return round;
}

describe('Round.bidding — initial state', () => {
  it('currentHighBid starts as null (data-model.md)', () => {
    const round = makeRound();
    assert.equal(round.currentHighBid, null);
  });

  it('P1 (seat 1, clockwise-left of Dealer) is the first bidder per FR-004', () => {
    const round = makeRound();
    assert.equal(round.currentTurnSeat, 1);
  });
});

describe('Round.bidding — first bid validation', () => {
  it('100 is accepted as the first bid (floor when currentHighBid is null)', () => {
    const round = makeRound();
    const r = round.submitBid(1, 100);
    assert.equal(r.rejected, false);
    assert.equal(round.currentHighBid, 100);
  });

  it('105 is accepted as the first bid', () => {
    const round = makeRound();
    assert.equal(round.submitBid(1, 105).rejected, false);
  });

  it('300 is accepted as the first bid (cap)', () => {
    const round = makeRound();
    const r = round.submitBid(1, 300);
    assert.equal(r.rejected, false);
    assert.equal(round.currentHighBid, 300);
  });

  it('99 is rejected (below 100 floor)', () => {
    const round = makeRound();
    const r = round.submitBid(1, 99);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('107 is rejected (not a multiple of 5)', () => {
    const round = makeRound();
    const r = round.submitBid(1, 107);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('305 is rejected (above the 300 cap)', () => {
    const round = makeRound();
    const r = round.submitBid(1, 305);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });
});

describe('Round.bidding — subsequent bid validation', () => {
  it('a repeat bid of 100 after a prior 100 is rejected (smallest legal is now 105)', () => {
    const round = makeRound();
    round.submitBid(1, 100); // seat 1 bids; turn → seat 2
    const r = round.submitBid(2, 100);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('105 is accepted after a prior 100', () => {
    const round = makeRound();
    round.submitBid(1, 100);
    assert.equal(round.submitBid(2, 105).rejected, false);
  });

  it('300 is accepted after a prior 100', () => {
    const round = makeRound();
    round.submitBid(1, 100);
    assert.equal(round.submitBid(2, 300).rejected, false);
  });

  it('once currentHighBid reaches 300, any further bid is rejected', () => {
    const round = makeRound();
    round.submitBid(1, 300); // turn → seat 2
    const r = round.submitBid(2, 300);
    assert.equal(r.rejected, true, 'bid of 300 when currentHighBid=300 must be rejected (needs >300)');
    assert.ok(r.reason);
  });

  it('Pass is accepted when currentHighBid is 300', () => {
    const round = makeRound();
    round.submitBid(1, 300); // turn → seat 2
    const r = round.submitPass(2);
    assert.equal(r.rejected, false);
    assert.ok(round.passedBidders.has(2));
  });
});

describe('Round.bidding — turn rotation with passes', () => {
  it('passing adds the seat to passedBidders', () => {
    const round = makeRound();
    round.submitPass(1);
    assert.ok(round.passedBidders.has(1));
  });

  it('passed bidders are skipped in clockwise rotation', () => {
    const round = makeRound();
    round.submitPass(1); // seat 1 passes; next should be seat 2
    assert.equal(round.currentTurnSeat, 2);
    round.submitPass(2); // seat 2 passes; next should be seat 0
    assert.equal(round.currentTurnSeat, 0);
  });

  it('bidHistory records passes as { seat, amount: null }', () => {
    const round = makeRound();
    round.submitPass(1);
    assert.equal(round.bidHistory.length, 1);
    assert.equal(round.bidHistory[0].amount, null);
    assert.equal(round.bidHistory[0].seat, 1);
  });
});

describe('Round.bidding — all-pass resolution (FR-011)', () => {
  it('dealer becomes declarer at 100 when P1 and P2 both pass (all-pass scenario)', () => {
    // When P1 and P2 pass without bidding, the dealer is the sole remaining player.
    // The remaining.length===1 branch fires immediately; FR-011 requires currentHighBid=100.
    const round = makeRound();
    round.submitPass(1); // P1 passes; turn → seat 2
    round.submitPass(2); // P2 passes; only dealer remains → resolution fires
    assert.equal(round.declarerSeat, 0, 'dealer (seat 0) must be declarer');
    assert.equal(round.currentHighBid, 100, 'currentHighBid must be set to 100 per FR-011');
    assert.equal(round.phase, 'post-bid-decision');
  });
});

describe('Round.bidding — last-bidder-remaining resolution (FR-010)', () => {
  it('sole surviving non-passed bidder becomes declarer at the current high bid', () => {
    const round = makeRound();
    round.submitBid(1, 120); // seat 1 bids 120; turn → seat 2
    round.submitPass(2);     // seat 2 passes; turn → seat 0
    round.submitPass(0);     // seat 0 passes; only seat 1 remains → declarer
    assert.equal(round.declarerSeat, 1);
    assert.equal(round.currentHighBid, 120);
    assert.equal(round.phase, 'post-bid-decision');
  });

  it('sole survivor via submitBid (3 players, 2 already passed)', () => {
    const round = makeRound();
    round.submitPass(1); // seat 1 passes; turn → seat 2
    round.submitPass(2); // seat 2 passes; remaining = [0] → declarer = seat 0
    assert.equal(round.declarerSeat, 0);
    assert.equal(round.phase, 'post-bid-decision');
  });
});
