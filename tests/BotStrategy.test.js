'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const BotStrategy = require('../src/services/bots/BotStrategy');
const { roundDownToStep, estimateMakeable } = require('../src/services/bots/botStrategyHelpers');
const { MAX_TALON_GAMBLE, BID_STEP, MAX_BID } = require('../src/services/bots/botConstants');

const C = (rank, suit) => ({ rank, suit });
// Build a deck (indexed by cardId) + a hand of cardIds from a list of [rank,suit].
function deckHand(cards) {
  const deck = cards.map(([rank, suit], id) => ({ id, rank, suit }));
  return { deck, ids: cards.map((_, id) => id) };
}
function handObjs(cards) {
  return cards.map(([rank, suit], cardId) => ({ cardId, rank, suit }));
}

// per FR-016, FR-017, SC-007 — bidding scales with aggressiveness within a bound.
describe('BotStrategy.decideBid', () => {
  const marriageHand = handObjs([['K', 'C'], ['Q', 'C'], ['A', 'S'], ['J', 'H']]);

  it('is monotonic non-decreasing in aggressiveness', () => {
    const floor = 100;
    const bids = [0, 0.25, 0.5, 0.75, 1].map(
      (a) => BotStrategy.decideBid(marriageHand, a, floor).amount,
    );
    for (let i = 1; i < bids.length; i++) {
      assert.ok(bids[i] >= bids[i - 1], `bid[${i}]=${bids[i]} >= bid[${i - 1}]=${bids[i - 1]}`);
    }
  });

  it('never exceeds the safe estimate + the moderate gamble cap', () => {
    const safe = estimateMakeable(marriageHand).value;
    const bound = roundDownToStep(safe + MAX_TALON_GAMBLE, BID_STEP);
    for (const a of [0, 0.33, 0.66, 1]) {
      const d = BotStrategy.decideBid(marriageHand, a, 100);
      assert.ok(d.amount <= bound, `${d.amount} <= ${bound}`);
      assert.ok(d.amount <= MAX_BID);
      assert.equal(d.amount % BID_STEP, 0);
    }
  });

  it('a cautious bot with a weak hand passes below the floor', () => {
    const weak = handObjs([['J', 'H'], ['9', 'S'], ['J', 'D']]);
    assert.equal(BotStrategy.decideBid(weak, 0, 150).kind, 'pass');
  });

  it('the forced last bidder takes the floor instead of passing', () => {
    const weak = handObjs([['J', 'H'], ['9', 'S'], ['J', 'D']]);
    const d = BotStrategy.decideBid(weak, 0, 150, { forced: true });
    assert.equal(d.kind, 'bid');
    assert.equal(d.amount, 150);
  });
});

describe('BotStrategy.decide — per-phase legality', () => {
  it('bidding: returns a legal bid/pass on the bot\'s turn', () => {
    const { deck } = deckHand([['K', 'C'], ['Q', 'C'], ['A', 'S']]);
    const round = {
      phase: 'bidding', currentTurnSeat: 0, declarerSeat: null, playerCount: 3,
      currentHighBid: null, passedBidders: new Set(), isPausedByDisconnect: false,
      hands: { 0: [0, 1, 2] }, deck, _game: {},
    };
    const d = BotStrategy.decide(round, 0, 1);
    assert.ok(d.kind === 'bid' || d.kind === 'pass');
    if (d.kind === 'bid') { assert.equal(d.amount % BID_STEP, 0); }
  });

  it('post-bid-decision: the declarer starts the game (never sells in v1)', () => {
    const round = { phase: 'post-bid-decision', declarerSeat: 0 };
    assert.deepEqual(BotStrategy.decide(round, 0, 0.5), { kind: 'startGame' });
    assert.equal(BotStrategy.decide(round, 1, 0.5), null);
  });

  it('selling-bidding: a bot opponent passes', () => {
    const round = { phase: 'selling-bidding', declarerSeat: 0, currentTurnSeat: 1 };
    assert.deepEqual(BotStrategy.decide(round, 1, 0.5), { kind: 'sellPass' });
  });

  it('card-exchange: the declarer passes a non-essential card to a fresh seat', () => {
    const { deck } = deckHand([['A', 'S'], ['K', 'C'], ['Q', 'C'], ['9', 'D']]);
    const round = {
      phase: 'card-exchange', declarerSeat: 0, playerCount: 3,
      hands: { 0: [0, 1, 2, 3] }, deck, _usedExchangeDestSeats: new Set(),
    };
    const d = BotStrategy.decide(round, 0, 0.5);
    assert.equal(d.kind, 'exchangePass');
    assert.equal(d.cardId, 3); // the 9♦ — not the ace, not a marriage card
    assert.notEqual(d.toSeat, 0);
    assert.ok(d.toSeat >= 0 && d.toSeat < 3);
  });

  it('card-exchange: returns null once every opponent already received a card', () => {
    const { deck } = deckHand([['A', 'S'], ['9', 'D']]);
    const round = {
      phase: 'card-exchange', declarerSeat: 0, playerCount: 3,
      hands: { 0: [0, 1] }, deck, _usedExchangeDestSeats: new Set([1, 2]),
    };
    assert.equal(BotStrategy.decide(round, 0, 0.5), null);
  });

  it('trick-play non-declarer: dumps the lowest legal (follow-suit) card', () => {
    // Hand A♥,J♥,9♠; led K♥ ⇒ must follow hearts ⇒ legal {A♥,J♥} ⇒ dump J♥.
    const { deck } = deckHand([['A', 'H'], ['J', 'H'], ['9', 'S'], ['K', 'H']]);
    const round = {
      phase: 'trick-play', declarerSeat: 1, currentTurnSeat: 0, playerCount: 3,
      fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
      trickNumber: 3, currentTrumpSuit: null,
      currentTrick: [{ seat: 1, cardId: 3 }], hands: { 0: [0, 1, 2] }, deck,
    };
    const d = BotStrategy.decide(round, 0, 0.5);
    assert.equal(d.kind, 'playCard');
    assert.equal(d.cardId, 1); // J♥, the lowest-value legal heart
  });

  it('trick-play declarer lead: declares a held marriage in the legal window', () => {
    const { deck } = deckHand([['K', 'C'], ['Q', 'C'], ['9', 'S']]);
    const round = {
      phase: 'trick-play', declarerSeat: 0, currentTurnSeat: 0, playerCount: 3,
      fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
      trickNumber: 2, currentTrumpSuit: null,
      currentTrick: [], hands: { 0: [0, 1, 2] }, deck,
    };
    const d = BotStrategy.decide(round, 0, 0.5);
    assert.equal(d.kind, 'playCard');
    assert.equal(d.declareMarriage, true);
    assert.equal(d.cardId, 0); // leads the K♣ to declare the clubs marriage
  });

  it('round-summary: presses continue once, then has nothing to do', () => {
    const session = { continuePresses: new Set() };
    const round = { phase: 'round-summary', _game: { session } };
    assert.deepEqual(BotStrategy.decide(round, 2, 0.5), { kind: 'continueToNextRound' });
    session.continuePresses.add(2);
    assert.equal(BotStrategy.decide(round, 2, 0.5), null);
  });

  it('trick-play: acknowledges a pending four-nines gate, then waits', () => {
    const round = {
      phase: 'trick-play', fourNinesAckPending: true, fourNinesAcks: new Set(),
      currentTurnSeat: 1, isPausedByDisconnect: false, crawlActive: false,
    };
    assert.deepEqual(BotStrategy.decide(round, 0, 0.5), { kind: 'acknowledgeFourNines' });
    round.fourNinesAcks.add(0);
    assert.equal(BotStrategy.decide(round, 0, 0.5), null);
  });

  it('trick-play: responds to a human crawl by committing the lowest card', () => {
    const { deck } = deckHand([['A', 'S'], ['9', 'D'], ['K', 'C']]);
    const round = {
      phase: 'trick-play', fourNinesAckPending: false, isPausedByDisconnect: false,
      crawlActive: true, currentTurnSeat: 0, hands: { 0: [0, 1, 2] }, deck,
    };
    const d = BotStrategy.decide(round, 0, 0.5);
    assert.equal(d.kind, 'crawlCommit');
    assert.equal(d.cardId, 1); // 9♦ — lowest value
  });

  it('trick-play declarer lead: draws trumps when no marriage is declarable', () => {
    // trick 1 (outside the 2–6 marriage window), trump set → lead the highest trump.
    const { deck } = deckHand([['9', 'S'], ['A', 'S'], ['J', 'H']]);
    const round = {
      phase: 'trick-play', declarerSeat: 0, currentTurnSeat: 0, playerCount: 3,
      fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
      trickNumber: 1, currentTrumpSuit: 'S', currentTrick: [], hands: { 0: [0, 1, 2] }, deck,
    };
    const d = BotStrategy.decide(round, 0, 0.5);
    assert.equal(d.kind, 'playCard');
    assert.equal(d.cardId, 1); // A♠ is the strongest trump
  });

  it('trick-play declarer follow: wins the trick as cheaply as it can', () => {
    // Led 9♥; declarer holds K♥ and A♥ → wins with the cheaper winner (K♥).
    const { deck } = deckHand([['K', 'H'], ['A', 'H'], ['9', 'H']]);
    const round = {
      phase: 'trick-play', declarerSeat: 0, currentTurnSeat: 0, playerCount: 3,
      fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
      trickNumber: 4, currentTrumpSuit: null,
      currentTrick: [{ seat: 1, cardId: 2 }], hands: { 0: [0, 1] }, deck,
    };
    const d = BotStrategy.decide(round, 0, 0.5);
    assert.equal(d.kind, 'playCard');
    assert.equal(d.cardId, 0); // K♥ beats the 9♥ more cheaply than the A♥
  });

  it('returns null when it is not the bot\'s turn to bid', () => {
    const round = {
      phase: 'bidding', currentTurnSeat: 1, playerCount: 3, currentHighBid: null,
      passedBidders: new Set(), isPausedByDisconnect: false, hands: {}, deck: [], _game: {},
    };
    assert.equal(BotStrategy.decide(round, 0, 0.5), null);
  });
});
