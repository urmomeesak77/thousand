'use strict';

// Deal sequencing → DealSequencer.js; phase-transition helpers → RoundPhases.js;
// snapshot/view-model serialization → RoundSnapshot.js
const { makeDeck, shuffle } = require('./Deck');
const { buildDealDistribution } = require('./DealSequencer');
const {
  absorbTalon, activeSellOpponents, nextSellOpponent, resolveSellSold, resolveSellReturned,
} = require('./RoundPhases');
const RoundSnapshot = require('./RoundSnapshot');
const TrickPlay = require('./TrickPlay');

const MIN_BID = 100;
const MAX_BID = 300;
const BID_STEP = 5;
const SELL_SELECTION_SIZE = 3;
const MAX_SELL_ATTEMPTS = 3;

class Round {
  constructor({ game, store }) {
    this._game = game;
    this._store = store;

    // seat 0 = Dealer = 1st joiner (host), seat 1 = P1 = 2nd joiner, seat 2 = P2 = 3rd joiner
    this.dealerSeat = 0;
    this.seatOrder = [...game.players];
    this.seatByPlayer = new Map(this.seatOrder.map((pid, idx) => [pid, idx]));

    // phase ∈ { 'dealing' | 'bidding' | 'post-bid-decision' | 'selling-selection' |
    //           'selling-bidding' | 'play-phase-ready' | 'card-exchange' | 'trick-play' |
    //           'round-summary' | 'aborted' }
    this.phase = 'dealing';
    this.deck = null;
    this.hands = { 0: [], 1: [], 2: [] };
    this.talon = [];
    this.exposedSellCards = [];
    this.currentTurnSeat = null;
    this.currentHighBid = null;
    this.bidHistory = [];
    this.passedBidders = new Set();
    this.passedSellOpponents = new Set();
    this._lastSellBidderSeat = null;
    this.declarerSeat = null;
    this.attemptCount = 0;
    this.attemptHistory = [];
    this.isPausedByDisconnect = false;
    this.disconnectedSeats = new Set();

    // Phase 3 fields (card-exchange + trick-play + round-summary)
    this.trickNumber = 0;
    this.currentTrickLeaderSeat = null;
    this.currentTrick = [];
    this.currentTrumpSuit = null;
    this.declaredMarriages = [];
    this.collectedTricks = { 0: [], 1: [], 2: [] };
    this.collectedTrickCounts = { 0: 0, 1: 0, 2: 0 };
    this.exchangePassesCommitted = 0;
    this._usedExchangeDestSeats = null;
    this.roundScores = null;
    this.roundDeltas = null;
    this.summary = null;
    this._trickPlay = null;  // TrickPlay instance, set on entry to trick-play phase
  }

  // T021
  start() {
    const shuffled = shuffle(makeDeck());
    this.deck = shuffled.map((card, i) => ({ id: i, rank: card.rank, suit: card.suit }));
    const dist = buildDealDistribution();
    this.hands = dist.hands;
    this.talon = dist.talon;
    this.phase = 'dealing';
    this.currentTurnSeat = null;
    this.currentHighBid = null;
  }

  // T022
  getRoundStartedPayloadFor(playerId) {
    const selfSeat = this.seatByPlayer.get(playerId);
    return {
      type: 'round_started',
      seats: RoundSnapshot.buildSeatLayout(this, selfSeat),
      dealSequence: RoundSnapshot.buildDealSequenceFor(this, selfSeat),
      gameStatus: RoundSnapshot.buildViewModel(this, selfSeat),
    };
  }

  // T023
  advanceFromDealingToBidding() {
    if (this.phase !== 'dealing') {return;}
    this.phase = 'bidding';
    this.currentTurnSeat = 1; // P1 (clockwise-left of Dealer) bids first per FR-004
  }

  // T024
  submitBid(seat, amount) {
    if (this.phase !== 'bidding') {return { rejected: true, reason: 'Not in bidding phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (seat !== this.currentTurnSeat) {return { rejected: true, reason: 'Not your turn' };}
    if (!Number.isInteger(amount)) {return { rejected: true, reason: 'Bid must be an integer' };}
    if (amount % BID_STEP !== 0) {return { rejected: true, reason: `Bid must be a multiple of ${BID_STEP}` };}
    if (amount > MAX_BID) {return { rejected: true, reason: `Bid cannot exceed ${MAX_BID}` };}
    const smallest = this.currentHighBid === null ? MIN_BID : this.currentHighBid + BID_STEP;
    if (amount < smallest) {return { rejected: true, reason: `Bid must be at least ${smallest}` };}

    this.bidHistory.push({ seat, amount });
    this.currentHighBid = amount;

    this.currentTurnSeat = this._nextActiveBidder(seat);

    return { rejected: false };
  }

  // T025
  submitPass(seat) {
    if (this.phase !== 'bidding') {return { rejected: true, reason: 'Not in bidding phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (seat !== this.currentTurnSeat) {return { rejected: true, reason: 'Not your turn' };}

    this.passedBidders.add(seat);
    this.bidHistory.push({ seat, amount: null });

    const remaining = [0, 1, 2].filter(s => !this.passedBidders.has(s));
    if (remaining.length === 1) {
      this.declarerSeat = remaining[0];
      if (this.currentHighBid === null) {this.currentHighBid = MIN_BID;}
      this.phase = 'post-bid-decision';
      this.currentTurnSeat = remaining[0];
      const { talonIds, identities } = this._absorbTalon();
      return { rejected: false, resolved: true, talonIds, identities };
    } else {
      this.currentTurnSeat = this._nextActiveBidder(seat);
    }

    return { rejected: false };
  }

  // Bounded version of "advance until non-passed seat" — `bidding` is unreachable
  // when all three seats have passed (submitPass would have resolved to declarer
  // at length-1), but a bounded loop documents the invariant and prevents future
  // changes to the resolution logic from creating an infinite loop here.
  _nextActiveBidder(fromSeat) {
    for (let i = 1; i <= 3; i++) {
      const candidate = (fromSeat + i) % 3;
      if (!this.passedBidders.has(candidate)) {return candidate;}
    }
    return fromSeat;
  }

  // T026
  getViewModelFor(seat) {
    return RoundSnapshot.buildViewModel(this, seat);
  }

  // T045
  markDisconnected(seat) {
    this.disconnectedSeats.add(seat);
    if (seat === this.currentTurnSeat) {this.isPausedByDisconnect = true;}
  }

  markReconnected(seat) {
    this.disconnectedSeats.delete(seat);
    if (seat === this.currentTurnSeat) {this.isPausedByDisconnect = false;}
  }

  abort() {
    this.phase = 'aborted';
    this.currentTurnSeat = null;
  }

  // T047
  getSnapshotFor(seat) {
    return RoundSnapshot.buildSnapshot(this, seat);
  }

  // T042
  startGame(seat) {
    if (this.phase === 'card-exchange') {return { noop: true };}
    if (this.phase !== 'post-bid-decision') {return { rejected: true, reason: 'Not in decision phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can start the game' };}
    this.phase = 'card-exchange';
    this.currentTurnSeat = this.declarerSeat;
    this.exchangePassesCommitted = 0;
    return { noop: false, declarerId: this.seatOrder[this.declarerSeat], finalBid: this.currentHighBid };
  }

  // T017 — FR-002/FR-003: card exchange
  submitExchangePass(seat, cardId, destSeat) {
    if (this.phase !== 'card-exchange') {return { rejected: true, reason: 'Not in card-exchange phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can pass cards' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (!this.hands[seat].includes(cardId)) {return { rejected: true, reason: 'Card not in hand' };}
    if (destSeat === this.declarerSeat) {return { rejected: true, reason: 'Cannot pass to yourself' };}
    if (this._usedExchangeDestSeats && this._usedExchangeDestSeats.has(destSeat)) {
      return { rejected: true, reason: 'Already passed to that opponent' };
    }

    // Initialize used destinations tracker if needed
    if (!this._usedExchangeDestSeats) {this._usedExchangeDestSeats = new Set();}

    // Move card from declarer to recipient
    this.hands[seat] = this.hands[seat].filter(id => id !== cardId);
    this.hands[destSeat].push(cardId);
    this._usedExchangeDestSeats.add(destSeat);
    this.exchangePassesCommitted += 1;

    // On second pass: transition to trick-play
    if (this.exchangePassesCommitted === 2) {
      this.phase = 'trick-play';
      this.trickNumber = 1;
      this.currentTrickLeaderSeat = this.declarerSeat;
      this.currentTurnSeat = this.declarerSeat;
      this._trickPlay = new TrickPlay(this.declarerSeat, this.deck);
      return { rejected: false, transitionedToTrickPlay: true, cardId, destSeat };
    }

    return { rejected: false, cardId, destSeat };
  }

  // T018 — delegate to TrickPlay
  playCard(seat, cardId, opts = {}) {
    if (this.phase !== 'trick-play') {return { rejected: true, reason: 'Not in trick-play phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}

    // Lazily init TrickPlay if forced into trick-play phase without going through submitExchangePass
    if (!this._trickPlay) {
      this._trickPlay = new TrickPlay(this.currentTrickLeaderSeat ?? this.declarerSeat, this.deck);
      // Sync any pre-set state into the new TrickPlay instance
      this._trickPlay.trickNumber = this.trickNumber;
      this._trickPlay.currentTrickLeaderSeat = this.currentTrickLeaderSeat;
      this._trickPlay.currentTurnSeat = this.currentTurnSeat;
      this._trickPlay.currentTrick = this.currentTrick;
      this._trickPlay.collectedTricks = this.collectedTricks;
      this._trickPlay.currentTrumpSuit = this.currentTrumpSuit;
      this._trickPlay.declaredMarriages = this.declaredMarriages;
    }

    const result = this._trickPlay.playCard(this.hands, seat, cardId, opts);
    if (result.rejected) {return result;}

    // Sync trickPlay state back to Round fields for snapshot/view-model
    this.trickNumber = this._trickPlay.trickNumber;
    this.currentTrickLeaderSeat = this._trickPlay.currentTrickLeaderSeat;
    this.currentTurnSeat = this._trickPlay.currentTurnSeat;
    this.currentTrick = this._trickPlay.currentTrick;
    this.collectedTricks = this._trickPlay.collectedTricks;
    this.collectedTrickCounts = this._trickPlay.collectedTrickCounts;

    if (result.trickResolved && result.roundComplete) {
      this.phase = 'round-summary';
      this.currentTurnSeat = null;
      // roundScores and buildSummary will be called by the controller (T027)
    }

    return result;
  }

  // T019 — FR-015: assemble RoundSummary view-model
  buildSummary(_game) {
    const { roundScores: scores, roundDeltas: deltas } = this;
    const perPlayer = {};
    for (const seat of [0, 1, 2]) {
      const pid = this.seatOrder[seat];
      const player = this._store.players.get(pid);
      perPlayer[seat] = {
        nickname: player?.nickname ?? null,
        seat,
        trickPoints: scores ? scores[seat] : 0,
        marriageBonus: 0,  // filled in US2
        roundTotal: scores ? scores[seat] : 0,
        delta: deltas ? deltas[seat] : 0,
        cumulativeAfter: deltas ? deltas[seat] : 0,  // US3 replaces
        penalties: [],
      };
    }
    this.summary = {
      roundNumber: 1,  // US3 replaces with game.currentRoundNumber
      declarerSeat: this.declarerSeat,
      declarerNickname: this._store.players.get(this.seatOrder[this.declarerSeat])?.nickname ?? null,
      bid: this.currentHighBid,
      declarerMadeBid: scores ? scores[this.declarerSeat] >= this.currentHighBid : false,
      perPlayer,
      viewerCollectedCards: [],  // per-viewer, filled by RoundSnapshot
      victoryReached: false,  // US3 replaces
    };
    return this.summary;
  }

  // T059
  startSelling(seat) {
    if (this.phase !== 'post-bid-decision') {return { rejected: true, reason: 'Not in decision phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can start selling' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (this.attemptHistory.some((a) => a.outcome === 'sold')) {
      return { rejected: true, reason: 'Selling is no longer available' };
    }
    if (this.attemptCount >= MAX_SELL_ATTEMPTS) {return { rejected: true, reason: 'No selling attempts remaining' };}
    this.phase = 'selling-selection';
    return { rejected: false };
  }

  // T060
  cancelSelling(seat) {
    if (this.phase !== 'selling-selection') {return { rejected: true, reason: 'Not in selling-selection phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can cancel selling' };}
    this.phase = 'post-bid-decision';
    return { rejected: false };
  }

  // T061
  commitSellSelection(seat, cardIds) {
    if (this.phase !== 'selling-selection') {return { rejected: true, reason: 'Not in selling-selection phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can select cards' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (!Array.isArray(cardIds) || cardIds.length !== SELL_SELECTION_SIZE) {
      return { rejected: true, reason: `Exactly ${SELL_SELECTION_SIZE} cards must be selected` };
    }
    if (new Set(cardIds).size !== SELL_SELECTION_SIZE) {
      return { rejected: true, reason: 'Cards must be distinct' };
    }
    const hand = this.hands[this.declarerSeat];
    for (const id of cardIds) {
      if (!hand.includes(id)) {return { rejected: true, reason: 'Card is not in your hand' };}
    }
    // FR-016: selection must differ from every prior attempt's exposed set
    const sortedNew = [...cardIds].sort((a, b) => a - b);
    for (const entry of this.attemptHistory) {
      const sortedPrior = [...entry.exposedIds].sort((a, b) => a - b);
      if (sortedNew.every((v, i) => v === sortedPrior[i])) {
        return { rejected: true, reason: 'You must select a different set of cards than a prior attempt' };
      }
    }
    this.hands[this.declarerSeat] = hand.filter(id => !cardIds.includes(id));
    this.exposedSellCards = [...cardIds];
    this.phase = 'selling-bidding';
    // clockwise-left of declarer bids first (FR-015, parallels FR-004)
    this.currentTurnSeat = (this.declarerSeat + 1) % 3;
    this.passedSellOpponents = new Set();
    this._lastSellBidderSeat = null;
    return { rejected: false };
  }

  // T062
  submitSellBid(seat, amount) {
    if (this.phase !== 'selling-bidding') {return { rejected: true, reason: 'Not in selling-bidding phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (seat === this.declarerSeat) {return { rejected: true, reason: 'The declarer cannot bid in the sell auction' };}
    if (seat !== this.currentTurnSeat) {return { rejected: true, reason: 'Not your turn' };}
    if (!Number.isInteger(amount)) {return { rejected: true, reason: 'Bid must be an integer' };}
    if (amount % BID_STEP !== 0) {return { rejected: true, reason: `Bid must be a multiple of ${BID_STEP}` };}
    if (amount > MAX_BID) {return { rejected: true, reason: `Bid cannot exceed ${MAX_BID}` };}
    const smallest = this.currentHighBid === null ? MIN_BID : this.currentHighBid + BID_STEP;
    if (amount < smallest) {return { rejected: true, reason: `Bid must be at least ${smallest}` };}

    this.currentHighBid = amount;
    this._lastSellBidderSeat = seat;

    const next = this._nextSellOpponent(seat);
    if (next !== null) {
      this.currentTurnSeat = next;
      return { rejected: false };
    }

    // No remaining active opponents → the bidder wins immediately
    return this._resolveSellSold();
  }

  // T063
  submitSellPass(seat) {
    if (this.phase !== 'selling-bidding') {return { rejected: true, reason: 'Not in selling-bidding phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (seat === this.declarerSeat) {return { rejected: true, reason: 'The declarer cannot pass in the sell auction' };}
    if (seat !== this.currentTurnSeat) {return { rejected: true, reason: 'Not your turn' };}

    this.passedSellOpponents.add(seat);

    const remaining = this._activeSellOpponents();

    if (remaining.length === 0) {
      // Both opponents passed without anyone bidding
      return this._resolveSellReturned();
    }

    if (this._lastSellBidderSeat !== null) {
      // One passed and the other has bid at least once (FR-016 / FR-017)
      return this._resolveSellSold();
    }

    // Remaining opponent hasn't bid yet — continue
    this.currentTurnSeat = remaining[0];
    return { rejected: false };
  }

  // T062/T063 helpers — delegate to RoundPhases helpers

  _nextSellOpponent(fromSeat) {
    return nextSellOpponent(fromSeat, this.declarerSeat, this.passedSellOpponents);
  }

  _activeSellOpponents() {
    return activeSellOpponents(this.declarerSeat, this.passedSellOpponents);
  }

  _resolveSellSold() {
    const result = resolveSellSold({
      hands: this.hands,
      exposedSellCards: this.exposedSellCards,
      declarerSeat: this.declarerSeat,
      lastSellBidderSeat: this._lastSellBidderSeat,
      attemptHistory: this.attemptHistory,
    });
    this.declarerSeat = result.buyerSeat;
    this.currentTurnSeat = result.buyerSeat;
    this.exposedSellCards = [];
    this.phase = 'post-bid-decision';
    return result;
  }

  _resolveSellReturned() {
    const result = resolveSellReturned({
      hands: this.hands,
      declarerSeat: this.declarerSeat,
      exposedSellCards: this.exposedSellCards,
      attemptHistory: this.attemptHistory,
    });
    this.exposedSellCards = [];
    this.attemptCount += 1;
    this.currentTurnSeat = this.declarerSeat;
    this.phase = 'post-bid-decision';
    return result;
  }

  // T041 helper — moves talon into declarerSeat's hand; called at every bidding resolution site
  _absorbTalon() {
    const result = absorbTalon({
      hands: this.hands,
      talon: this.talon,
      deck: this.deck,
      declarerSeat: this.declarerSeat,
    });
    this.talon = [];
    return result;
  }

}

module.exports = Round;
