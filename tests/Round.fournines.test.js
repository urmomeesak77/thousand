'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');
const { FOUR_NINES_BONUS } = require('../src/services/GameRules');

// Reaches post-bid-decision with seat 0 as declarer (same pattern as
// Round.cardexchange.test.js), then forces card-exchange phase.
function makeCardExchangeRound() {
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
  round.submitPass(1);
  round.submitPass(2);
  round.submitBid(0, 100);
  round.phase = 'card-exchange';
  round.exchangePassesCommitted = 0;
  round._usedExchangeDestSeats = new Set();
  return round;
}

// Drives the round so that the declarer's 2nd (final) exchange pass transitions
// to trick-play with seat 0 holding all four 9s.
function makeFourNinesAtTransition() {
  const round = makeCardExchangeRound();
  const nineIds = round.deck.filter((c) => c.rank === '9').map((c) => c.id);
  const filler = round.deck.filter((c) => c.rank !== '9').map((c) => c.id);
  round.exchangePassesCommitted = 1;
  round._usedExchangeDestSeats = new Set([1]);
  round.hands[0] = [...nineIds, filler[0], filler[1]];
  round.hands[1] = [filler[2], filler[3]];
  round.hands[2] = [filler[4], filler[5]];
  const result = round.submitExchangePass(0, filler[0], 2);
  return { round, result };
}

describe('Round.fournines — detection at the 2nd-pass transition (FR-001)', () => {
  it('transitions to trick-play and records the award on the holding seat', () => { // per FR-001
    const { round, result } = makeFourNinesAtTransition();
    assert.equal(result.transitionedToTrickPlay, true);
    assert.equal(round.phase, 'trick-play');
    assert.deepEqual(round.fourNinesAward, { seat: 0, amount: FOUR_NINES_BONUS });
  });

  it('opens the acknowledgment gate (pending true, no acks yet)', () => { // per FR-003
    const { round } = makeFourNinesAtTransition();
    assert.equal(round.fourNinesAckPending, true);
    assert.equal(round.fourNinesAcks.size, 0);
  });

  it('returns the award in the result so the handler can act', () => { // per FR-001
    const { result } = makeFourNinesAtTransition();
    assert.deepEqual(result.fourNinesAward, { seat: 0, amount: FOUR_NINES_BONUS });
  });
});

describe('Round.fournines — gate holds the first lead (FR-003, R-103)', () => {
  it('rejects play_card while the gate is open', () => { // per FR-003
    const { round } = makeFourNinesAtTransition();
    const r = round.playCard(0, round.hands[0][0]);
    assert.equal(r.rejected, true);
    assert.match(r.reason, /acknowledge the four-nines bonus/i);
  });

  it('accepts the first lead once all three acks are recorded', () => { // per FR-003
    const { round } = makeFourNinesAtTransition();
    round.recordFourNinesAck(0);
    round.recordFourNinesAck(1);
    round.recordFourNinesAck(2);
    assert.equal(round.fourNinesAckPending, false);
    const r = round.playCard(0, round.hands[0][0]);
    assert.notEqual(r.rejected, true);
  });
});

describe('Round.fournines — acks are idempotent and once-only (FR-005)', () => {
  it('a duplicate ack from the same seat does not advance the gate', () => { // per FR-005
    const { round } = makeFourNinesAtTransition();
    round.recordFourNinesAck(1);
    round.recordFourNinesAck(1);
    assert.equal(round.fourNinesAcks.size, 1);
    assert.equal(round.fourNinesAckPending, true);
  });

  it('the award is not re-detected after the transition', () => { // per FR-005
    const { round } = makeFourNinesAtTransition();
    const before = round.fourNinesAward;
    // A further exchange_pass is rejected (no longer in card-exchange) — award unchanged.
    round.submitExchangePass(0, round.hands[0][0], 1);
    assert.deepEqual(round.fourNinesAward, before);
  });
});

describe('Round.fournines — buildSummary surfaces the bonus line item (FR-008)', () => {
  it('puts fourNinesBonus: 100 on the awarded seat row only', () => { // per FR-008
    const { round } = makeFourNinesAtTransition(); // award seat 0
    round.roundScores = { 0: 50, 1: 40, 2: 30 };
    round.roundDeltas = { 0: 50, 1: 40, 2: 30 };
    const summary = round.buildSummary();
    assert.equal(summary.perPlayer[0].fourNinesBonus, 100);
    assert.ok(!summary.perPlayer[1].fourNinesBonus);
    assert.ok(!summary.perPlayer[2].fourNinesBonus);
  });

  it('cumulativeAfter reconciles to before + 100 + roundDelta once the round ends', () => { // per FR-008
    const Game = require('../src/services/Game');
    const game = new Game({ gameId: 'g', seatOrder: ['p0', 'p1', 'p2'], dealerSeat: 0 });
    game.cumulativeScores[0] = 200;
    game.applyFourNinesBonus(0); // banks +100 at trick-play start → 300
    game.applyRoundEnd({ 0: 50, 1: 0, 2: 0 }, {
      roundNumber: 1, declarerSeat: 0, bid: 100,
      perPlayer: { 0: { trickPoints: 50, marriageBonus: 0 }, 1: { trickPoints: 0, marriageBonus: 0 }, 2: { trickPoints: 0, marriageBonus: 0 } },
    });
    assert.equal(game.cumulativeScores[0], 200 + 100 + 50);
  });
});

describe('Round.fournines — reconnect snapshot exposes the gate state (FR-010)', () => {
  it('snapshot carries fourNinesAward and fourNinesAckPending while open', () => { // per FR-010
    const { round } = makeFourNinesAtTransition();
    const snap = round.getSnapshotFor(0);
    assert.deepEqual(snap.fourNinesAward, { seat: 0, amount: FOUR_NINES_BONUS });
    assert.equal(snap.fourNinesAckPending, true);
  });

  it('viewerHasAcknowledged reflects this viewer sticky press', () => { // per FR-010
    const { round } = makeFourNinesAtTransition();
    round.recordFourNinesAck(1);
    assert.equal(round.getSnapshotFor(1).viewerHasAcknowledged, true);
    assert.equal(round.getSnapshotFor(2).viewerHasAcknowledged, false);
  });
});
