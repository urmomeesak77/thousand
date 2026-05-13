'use strict';

// Deal sequencing → DealSequencer.js; phase-transition helpers → RoundPhases.js
const { makeDeck, shuffle } = require('./Deck');
const { stepDest, buildDealDistribution } = require('./DealSequencer');
const {
  absorbTalon, activeSellOpponents, nextSellOpponent, resolveSellSold, resolveSellReturned,
} = require('./RoundPhases');

const MIN_BID = 100;
const MAX_BID = 300;
const BID_STEP = 5;
const SELL_SELECTION_SIZE = 3;
const MAX_SELL_ATTEMPTS = 3;

const PHASE_LABELS = {
  'dealing': 'Dealing',
  'bidding': 'Bidding',
  'post-bid-decision': 'Declarer deciding',
  'selling-selection': 'Selling',
  'selling-bidding': 'Selling',
  'play-phase-ready': 'Round ready to play',
  'aborted': 'Round aborted',
};

class Round {
  constructor({ game, store }) {
    this._game = game;
    this._store = store;

    // seat 0 = Dealer = 1st joiner (host), seat 1 = P1 = 2nd joiner, seat 2 = P2 = 3rd joiner
    this.dealerSeat = 0;
    this.seatOrder = [...game.players];
    this.seatByPlayer = new Map(this.seatOrder.map((pid, idx) => [pid, idx]));

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
      seats: this._seatLayoutFor(selfSeat),
      dealSequence: this._buildDealSequenceFor(selfSeat),
      gameStatus: this.getViewModelFor(selfSeat),
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

    let next = (seat + 1) % 3;
    while (this.passedBidders.has(next)) {
      next = (next + 1) % 3;
    }
    this.currentTurnSeat = next;

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
      let next = (seat + 1) % 3;
      while (this.passedBidders.has(next)) {next = (next + 1) % 3;}
      this.currentTurnSeat = next;
    }

    return { rejected: false };
  }

  // T026
  getViewModelFor(seat) {
    return {
      phase: PHASE_LABELS[this.phase] ?? this.phase,
      activePlayer: this._seatInfo(this.currentTurnSeat),
      viewerIsActive: this.currentTurnSeat === seat,
      currentHighBid: this.currentHighBid,
      declarer: this._seatInfo(this.declarerSeat),
      passedPlayers: this._passedNicknamesForCurrentPhase(),
      sellAttempt: this._currentSellAttempt(),
      disconnectedPlayers: this._disconnectedNicknames(),
    };
  }

  _seatInfo(seat) {
    if (seat === null) {
      return null;
    }
    return { seat, nickname: this._store.players.get(this.seatOrder[seat]).nickname };
  }

  // passedBidders shown only during bidding; sell opponents shown only during selling-bidding
  _passedNicknamesForCurrentPhase() {
    let passedSeats;
    if (this.phase === 'selling-bidding') {
      passedSeats = [...this.passedSellOpponents];
    } else if (this.phase === 'bidding') {
      passedSeats = [...this.passedBidders];
    } else {
      passedSeats = [];
    }
    return passedSeats.map((s) => this._store.players.get(this.seatOrder[s]).nickname);
  }

  // sellAttempt is 1-based: shown during selling phases and in post-bid-decision after a failed attempt
  _currentSellAttempt() {
    if (this.phase === 'selling-bidding') {
      return this.attemptCount + 1;
    }
    const last = this.attemptHistory[this.attemptHistory.length - 1];
    if (this.phase === 'post-bid-decision' && last?.outcome === 'returned') {
      return this.attemptCount + 1;
    }
    return null;
  }

  _disconnectedNicknames() {
    return [...this.disconnectedSeats]
      .map((s) => this._store.players.get(this.seatOrder[s])?.nickname)
      .filter(Boolean);
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
    const gameStatus = this.getViewModelFor(seat);
    const payload = {
      type: 'round_state_snapshot',
      phase: gameStatus.phase,
      gameStatus,
      seats: this._seatLayoutFor(seat),
      myHand: this._handIdentitiesFor(seat),
      opponentHandSizes: this._opponentHandSizesFor(seat),
    };

    if (this.talon.length > 0) {
      payload.talonIds = [...this.talon];
    }

    // Deal sequence included so the client can replay the animation on reconnect
    // (only needed when no bids have been placed yet — after that, animating would be jarring)
    if (this.phase === 'bidding' && this.currentHighBid === null) {
      payload.dealSequence = this._buildDealSequenceFor(seat);
    }

    // Exposed sell card identities visible to all during selling-bidding
    if (this.phase === 'selling-bidding') {
      payload.exposed = this.exposedSellCards.map((id) => {
        const card = this.deck[id];
        return { id, rank: card.rank, suit: card.suit };
      });
    }

    if (this.exposedSellCards.length > 0) {
      payload.exposedSellCardIds = [...this.exposedSellCards];
    }

    return payload;
  }

  _seatLayoutFor(seat) {
    const players = this.seatOrder.map((pid, s) => ({
      seat: s,
      playerId: pid,
      nickname: this._store.players.get(pid).nickname,
    }));
    return {
      self: seat,
      left: (seat + 1) % 3,
      right: (seat + 2) % 3,
      dealer: this.dealerSeat,
      players,
    };
  }

  _handIdentitiesFor(seat) {
    return this.hands[seat].map((id) => {
      const card = this.deck[id];
      return { id, rank: card.rank, suit: card.suit };
    });
  }

  _opponentHandSizesFor(seat) {
    const sizes = {};
    for (const s of [0, 1, 2]) {
      if (s !== seat) {
        sizes[s] = this.hands[s].length;
      }
    }
    return sizes;
  }

  _buildDealSequenceFor(seat) {
    return this.deck.map((card, i) => {
      const to = stepDest(i);
      const step = { id: i, to };
      if (to === `seat${seat}`) {
        step.rank = card.rank;
        step.suit = card.suit;
      }
      return step;
    });
  }

  // T042
  startGame(seat) {
    if (this.phase === 'play-phase-ready') {return { noop: true };}
    if (this.phase !== 'post-bid-decision') {return { rejected: true, reason: 'Not in decision phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can start the game' };}
    this.phase = 'play-phase-ready';
    return { noop: false, declarerId: this.seatOrder[this.declarerSeat], finalBid: this.currentHighBid };
  }

  // T059
  startSelling(seat) {
    if (this.phase !== 'post-bid-decision') {return { rejected: true, reason: 'Not in decision phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can start selling' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (this.attemptHistory.some(a => a.outcome === 'sold')) {return { rejected: true, reason: 'Selling is no longer available' };}
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
    const result = absorbTalon({ hands: this.hands, talon: this.talon, deck: this.deck, declarerSeat: this.declarerSeat });
    this.talon = [];
    return result;
  }

}

module.exports = Round;
