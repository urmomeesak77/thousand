'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');
const Scoring = require('../src/services/Scoring');

function makeRound() {
  const pids = ['p0', 'p1', 'p2', 'p3'];
  const game = { players: new Set(pids), requiredPlayers: 4 };
  const store = {
    players: new Map([
      ['p0', { nickname: 'Dealer' }],
      ['p1', { nickname: 'P1' }],
      ['p2', { nickname: 'P2' }],
      ['p3', { nickname: 'P3' }],
    ]),
  };
  const round = new Round({ game, store });
  round.start();
  return round;
}

function findCardId(deck, rank, suit) {
  const card = deck.find((c) => c.rank === rank && c.suit === suit);
  if (!card) { throw new Error(`Card ${rank}${suit} not found`); }
  return card.id;
}

describe('Round (4-player) — deal & deck (FR-009)', () => {
  it('playerCount is 4 and the deal gives 7 per seat + a 4-card talon from a 32-card deck', () => { // per FR-009
    const round = makeRound();
    assert.equal(round.playerCount, 4);
    assert.equal(round.deck.length, 32);
    for (const s of [0, 1, 2, 3]) {
      assert.equal(round.hands[s].length, 7, `seat ${s} dealt 7`);
    }
    assert.equal(round.talon.length, 4);
  });
});

describe('Round (4-player) — bidding, forced declarer & talon pickup (FR-010)', () => {
  it('resolves to a sole survivor over four seats and the declarer holds 11 after the full talon pickup', () => { // per FR-010
    const round = makeRound();
    round.advanceFromDealingToBidding();
    assert.equal(round.currentTurnSeat, 1, 'P1 (left of dealer) bids first');

    assert.equal(round.submitBid(1, 100).rejected ?? false, false);
    assert.equal(round.submitPass(2).rejected ?? false, false);
    assert.equal(round.submitPass(3).rejected ?? false, false);
    const resolved = round.submitPass(0);

    assert.equal(resolved.resolved, true, 'auction resolves once the last opponent passes');
    assert.equal(round.declarerSeat, 1);
    assert.equal(round.talon.length, 0, 'talon absorbed');
    assert.equal(round.hands[1].length, 11, 'declarer holds 7 + 4 talon = 11');
  });
});

describe('Round (4-player) — card exchange (FR-011)', () => {
  it('declarer passes one card to each of the three opponents and everyone holds 8', () => { // per FR-011
    const round = makeRound();
    round.advanceFromDealingToBidding();
    round.submitBid(1, 100);
    round.submitPass(2);
    round.submitPass(3);
    round.submitPass(0); // declarer = seat 1, holds 11

    round.startGame(1);
    assert.equal(round.phase, 'card-exchange');

    round.submitExchangePass(1, round.hands[1][0], 0);
    assert.equal(round.exchangePassesCommitted, 1);
    round.submitExchangePass(1, round.hands[1][0], 2);
    assert.equal(round.exchangePassesCommitted, 2);
    const last = round.submitExchangePass(1, round.hands[1][0], 3);

    assert.equal(last.transitionedToTrickPlay, true, 'transitions after exactly 3 passes (playerCount-1)');
    assert.equal(round.phase, 'trick-play');
    for (const s of [0, 1, 2, 3]) {
      assert.equal(round.hands[s].length, 8, `seat ${s} holds 8 at trick-play start`);
    }
  });
});

describe('Round (4-player) — eight tricks of four cards & scoring (FR-013, FR-007)', () => {
  it('plays eight 4-card tricks to completion; 7/8 score 0 and total round points stay 120', () => { // per FR-013
    const round = makeRound();
    // Controlled trick-play: each seat holds one full suit (8 cards), so the
    // leader (no follower can follow suit, no trump) wins every trick.
    round.phase = 'trick-play';
    round.declarerSeat = 0;
    round.trickNumber = 1;
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.currentTrick = [];
    round.collectedTricks = { 0: [], 1: [], 2: [], 3: [] };
    round.declaredMarriages = [];
    round.currentTrumpSuit = null;

    const bySuit = { '♣': [], '♠': [], '♥': [], '♦': [] };
    round.deck.forEach((c) => bySuit[c.suit].push(c.id));
    round.hands = { 0: bySuit['♣'], 1: bySuit['♠'], 2: bySuit['♥'], 3: bySuit['♦'] };

    let result;
    for (let trick = 0; trick < 8; trick++) {
      for (let k = 0; k < 4; k++) {
        const seat = round.currentTurnSeat;
        result = round.playCard(seat, round.hands[seat][0]);
        assert.equal(result.rejected ?? false, false, `trick ${trick} play ${k}`);
        if (k < 3) {
          assert.equal(round.currentTrick.length, k + 1, 'trick width builds to 4');
        }
      }
      assert.equal(round.currentTrick.length, 0, `trick ${trick} resolved`);
    }
    assert.equal(result.roundComplete, true, 'round completes after 8 tricks');
    assert.equal(round.collectedTricks[0].length, 32, 'leader won all 8 tricks (32 cards)');

    const scores = Scoring.roundScores(round);
    assert.equal(scores[0] + scores[1] + scores[2] + scores[3], 120, 'total trick points = 120');
  });
});

describe('Round (4-player) — selling with three opponents', () => {
  it('requires a 4-card selection and resolves to a buyer among the three opponents', () => {
    const round = makeRound();
    round.phase = 'post-bid-decision';
    round.declarerSeat = 0;
    round.currentHighBid = 100;
    round.currentTurnSeat = 0;
    round.hands[0] = round.deck.slice(0, 11).map((c) => c.id);

    round.startSelling(0);
    assert.equal(round.phase, 'selling-selection');

    const threeCards = round.hands[0].slice(0, 3);
    assert.match(round.commitSellSelection(0, threeCards).reason, /Exactly 4/);

    const fourCards = round.hands[0].slice(0, 4);
    assert.equal(round.commitSellSelection(0, fourCards).rejected ?? false, false);
    assert.equal(round.currentTurnSeat, 1, 'left of declarer bids first in the sell auction');

    assert.equal(round.submitSellPass(1).rejected ?? false, false);
    assert.equal(round.submitSellPass(2).rejected ?? false, false);
    const sold = round.submitSellBid(3, 105); // must outbid the standing 100

    assert.equal(sold.outcome, 'sold');
    assert.equal(round.declarerSeat, 3, 'buyer (an opponent) becomes the new declarer');
  });
});

describe('Round (4-player) — four-nines acknowledgment gate (FR-017)', () => {
  it('the gate closes only once all four seats have acknowledged', () => { // per FR-017
    const round = makeRound();
    round.fourNinesAward = { seat: 0, amount: 100 };
    round.fourNinesAckPending = true;
    round.fourNinesAcks = new Set();

    assert.equal(round.recordFourNinesAck(0).gateClosed, false);
    assert.equal(round.recordFourNinesAck(1).gateClosed, false);
    assert.equal(round.recordFourNinesAck(2).gateClosed, false);
    assert.equal(round.recordFourNinesAck(2).changed, false, 'duplicate ack is idempotent');
    assert.equal(round.fourNinesAckPending, true, 'still pending with three of four');
    const closed = round.recordFourNinesAck(3);
    assert.equal(closed.gateClosed, true, 'closes when the fourth seat acknowledges');
  });
});

describe('Round (4-player) — marriage switches trump & trump beats led suit (FR-014)', () => {
  it('a declared marriage awards the bonus, switches trump, and a trump beats a higher led-suit card', () => { // per FR-014
    const round = makeRound();
    round.phase = 'trick-play';
    round.declarerSeat = 0;
    round.trickNumber = 2;
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.currentTrick = [];
    round.collectedTricks = { 0: [], 1: [], 2: [], 3: [] };
    round.declaredMarriages = [];
    round.currentTrumpSuit = null;

    const d = round.deck;
    round.hands = {
      0: [findCardId(d, 'K', '♠'), findCardId(d, 'Q', '♠'), findCardId(d, 'A', '♥')],
      1: [findCardId(d, '7', '♠'), findCardId(d, '8', '♦')],
      2: [findCardId(d, '9', '♥'), findCardId(d, 'K', '♣')],
      3: [findCardId(d, '8', '♣'), findCardId(d, '7', '♦')],
    };

    const marriage = round.declareMarriage(0, findCardId(d, 'K', '♠'));
    assert.equal(marriage.rejected ?? false, false);
    assert.equal(marriage.newTrumpSuit, '♠');
    assert.equal(marriage.bonus, 80, 'spades marriage bonus');
    assert.equal(round.currentTrumpSuit, '♠');

    // Trick: seat0 leads A♥ (high), seat1 has no heart but holds a trump → must trump.
    round.playCard(0, findCardId(d, 'A', '♥'));
    round.playCard(1, findCardId(d, '7', '♠')); // trump
    round.playCard(2, findCardId(d, '9', '♥')); // follows led suit
    const resolved = round.playCard(3, findCardId(d, '8', '♣'));

    assert.equal(resolved.trickResolved, true);
    assert.equal(resolved.winnerSeat, 1, 'the lone trump beats the higher heart across all four seats');
  });
});
