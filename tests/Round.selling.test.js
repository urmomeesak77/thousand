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

// Reaches post-bid-decision with seat 0 as declarer (P1 and P2 both pass).
// Deal sequence assigns deterministic ids:
//   hands[0] (Dealer) = [2, 6, 10, 14, 17, 20, 23] + talon [3, 7, 11] → 10 total after absorption
//   hands[1] (P1)     = [0, 4, 8, 12, 15, 18, 21]
//   hands[2] (P2)     = [1, 5, 9, 13, 16, 19, 22]
function makeSellingRound() {
  const round = makeRound();
  round.submitPass(1); // P1 passes → seat 2 is next
  round.submitPass(2); // P2 passes → remaining=[0], dealer becomes declarer at 100
  return round;
}

// Advances to selling-bidding with exposed ids [2, 6, 10].
function makeSellBiddingRound() {
  const round = makeSellingRound();
  round.startSelling(0);
  round.commitSellSelection(0, [2, 6, 10]);
  return round;
}

// ---------------------------------------------------------------------------
// commitSellSelection — FR-029 validation
// ---------------------------------------------------------------------------

describe('Round.selling — commitSellSelection validation (FR-029)', () => {
  it('rejects when fewer than 3 cards are provided', () => {
    const round = makeSellingRound();
    round.startSelling(0);
    const r = round.commitSellSelection(0, [2, 6]);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('rejects when more than 3 cards are provided', () => {
    const round = makeSellingRound();
    round.startSelling(0);
    const r = round.commitSellSelection(0, [2, 6, 10, 14]);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('rejects when the selection contains duplicate card ids', () => {
    const round = makeSellingRound();
    round.startSelling(0);
    const r = round.commitSellSelection(0, [2, 2, 6]);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('rejects when a card id is not in the declarer\'s hand', () => {
    const round = makeSellingRound();
    round.startSelling(0);
    // id 0 belongs to seat 1's hand, not seat 0's
    const r = round.commitSellSelection(0, [0, 6, 10]);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('accepts exactly 3 distinct in-hand cards and transitions to selling-bidding', () => {
    const round = makeSellingRound();
    round.startSelling(0);
    const r = round.commitSellSelection(0, [2, 6, 10]);
    assert.equal(r.rejected, false);
    assert.equal(round.phase, 'selling-bidding');
    assert.deepEqual(round.exposedSellCards, [2, 6, 10]);
    assert.equal(round.hands[0].length, 7, 'declarer hand drops to 7 after exposing 3');
  });
});

// ---------------------------------------------------------------------------
// commitSellSelection — duplicate-attempt guard (FR-016)
// ---------------------------------------------------------------------------

describe('Round.selling — duplicate-attempt guard (FR-016)', () => {
  it('rejects a selection set that was already exposed in a prior attempt', () => {
    const round = makeSellingRound();

    // First attempt: expose [2, 6, 10], both opponents pass → returned
    round.startSelling(0);
    round.commitSellSelection(0, [2, 6, 10]);
    round.submitSellPass(1);
    round.submitSellPass(2);
    assert.equal(round.attemptCount, 1, 'precondition: first attempt recorded');

    // Second attempt with the same set must be rejected
    round.startSelling(0);
    const r = round.commitSellSelection(0, [2, 6, 10]);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('accepts a different selection set on a second attempt', () => {
    const round = makeSellingRound();
    round.startSelling(0);
    round.commitSellSelection(0, [2, 6, 10]);
    round.submitSellPass(1);
    round.submitSellPass(2);

    round.startSelling(0);
    const r = round.commitSellSelection(0, [14, 17, 20]); // different set
    assert.equal(r.rejected, false);
  });
});

// ---------------------------------------------------------------------------
// submitSellBid — FR-015 restrictions
// ---------------------------------------------------------------------------

describe('Round.selling — submitSellBid restrictions (FR-015)', () => {
  it('rejects a sell bid from the declarer', () => {
    const round = makeSellBiddingRound();
    const r = round.submitSellBid(0, 105); // seat 0 is declarerSeat
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('opponent rotation starts clockwise-left of the declarer (FR-015)', () => {
    const round = makeSellBiddingRound();
    // declarerSeat=0 → clockwise-left is seat 1 (parallels FR-004)
    assert.equal(round.currentTurnSeat, 1);
  });

  it('accepts a valid bid from the first opponent', () => {
    const round = makeSellBiddingRound();
    const r = round.submitSellBid(1, 105); // currentHighBid was 100 → 105 is valid
    assert.equal(r.rejected, false);
    assert.equal(round.currentHighBid, 105);
  });

  it('turn advances to the next opponent after a bid', () => {
    const round = makeSellBiddingRound();
    round.submitSellBid(1, 105); // seat 1 bids → next is seat 2
    assert.equal(round.currentTurnSeat, 2);
  });
});

// ---------------------------------------------------------------------------
// Both opponents pass → outcome 'returned' (FR-016)
// ---------------------------------------------------------------------------

describe('Round.selling — returned outcome (FR-016)', () => {
  it('cards return to declarer and attemptCount increments when both opponents pass', () => {
    const round = makeSellBiddingRound();
    round.submitSellPass(1); // seat 1 passes; seat 2 is next
    const r = round.submitSellPass(2); // seat 2 passes → no bids → returned
    assert.equal(r.rejected, false);
    assert.equal(r.outcome, 'returned');
    assert.equal(round.attemptCount, 1);
    assert.equal(round.phase, 'post-bid-decision');
    assert.equal(round.hands[0].length, 10, 'exposed cards must be returned to declarer');
    assert.equal(round.exposedSellCards.length, 0, 'exposedSellCards must be empty after return');
  });

  it('attemptHistory records the returned entry with the exposed card ids', () => {
    const round = makeSellBiddingRound();
    round.submitSellPass(1);
    round.submitSellPass(2);
    assert.equal(round.attemptHistory.length, 1);
    assert.equal(round.attemptHistory[0].outcome, 'returned');
    assert.deepEqual(
      [...round.attemptHistory[0].exposedIds].sort((a, b) => a - b),
      [2, 6, 10]
    );
  });

  it('currentTurnSeat is restored to the declarerSeat after a return', () => {
    const round = makeSellBiddingRound();
    round.submitSellPass(1);
    round.submitSellPass(2);
    assert.equal(round.currentTurnSeat, 0, 'turn returns to declarer after cards return');
  });
});

// ---------------------------------------------------------------------------
// One opponent bids, the other passes → outcome 'sold' (FR-017)
// ---------------------------------------------------------------------------

describe('Round.selling — sold outcome (FR-017)', () => {
  it('buyer (seat 1) becomes new declarer with 10 cards; old declarer keeps 7', () => {
    const round = makeSellBiddingRound(); // hands[0]=7, hands[1]=7, exposed=[2,6,10]
    round.submitSellBid(1, 105); // seat 1 bids → turn → seat 2
    const r = round.submitSellPass(2); // seat 2 passes → seat 1 wins
    assert.equal(r.outcome, 'sold');
    assert.equal(round.declarerSeat, 1, 'buyer must become new declarerSeat');
    assert.equal(round.hands[1].length, 10, 'new declarer hand must be 10');
    assert.equal(round.hands[0].length, 7, 'old declarer hand must be 7');
    assert.equal(round.currentHighBid, 105);
    assert.equal(round.phase, 'post-bid-decision');
  });

  it('exposedSellCards is cleared after a sale', () => {
    const round = makeSellBiddingRound();
    round.submitSellBid(1, 105);
    round.submitSellPass(2);
    assert.equal(round.exposedSellCards.length, 0);
  });

  it('attemptHistory records the sold entry', () => {
    const round = makeSellBiddingRound();
    round.submitSellBid(1, 105);
    round.submitSellPass(2);
    assert.equal(round.attemptHistory.length, 1);
    assert.equal(round.attemptHistory[0].outcome, 'sold');
  });

  it('sold outcome via first-passing second-bidding path: seat 1 passes then seat 2 bids', () => {
    const round = makeSellBiddingRound();
    round.submitSellPass(1); // seat 1 passes; remaining=[2], no bid yet → continue
    round.submitSellBid(2, 105); // seat 2 bids → only opponent left, resolves immediately
    assert.equal(round.declarerSeat, 2);
    assert.equal(round.hands[2].length, 10);
  });
});

// ---------------------------------------------------------------------------
// 3-attempt exhaustion (FR-018)
// ---------------------------------------------------------------------------

describe('Round.selling — 3-attempt exhaustion (FR-018)', () => {
  it('startSelling is rejected after 3 failed (returned) attempts', () => {
    const round = makeSellingRound();

    // Three distinct sets to avoid the FR-016 duplicate guard
    const attempts = [[2, 6, 10], [14, 17, 20], [23, 3, 7]];
    for (const cards of attempts) {
      round.startSelling(0);
      round.commitSellSelection(0, cards);
      round.submitSellPass(1);
      round.submitSellPass(2);
    }

    assert.equal(round.attemptCount, 3, 'precondition: 3 attempts recorded');
    const r = round.startSelling(0);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('startSelling on the new declarer is rejected after a successful sale', () => {
    const round = makeSellingRound();
    round.startSelling(0);
    round.commitSellSelection(0, [2, 6, 10]);
    round.submitSellBid(1, 105);
    round.submitSellPass(2); // seat 1 is now declarerSeat

    // New declarer (seat 1) cannot initiate another sale
    const r = round.startSelling(1);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });
});
