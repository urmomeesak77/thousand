'use strict';

// Deal sequencing → DealSequencer.js; phase-transition helpers → RoundPhases.js
const { makeDeck, shuffle } = require('./Deck');
const { stepDest, buildDealDistribution } = require('./DealSequencer');
const { absorbTalon, activeSellOpponents, nextSellOpponent, resolveSellSold, resolveSellReturned } = require('./RoundPhases');

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
    this.declarerSeat = null;
    this.attemptCount = 0;
    this.attemptHistory = [];
    this.pausedByDisconnect = false;
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
    const leftSeat = (selfSeat + 1) % 3;
    const rightSeat = (selfSeat + 2) % 3;

    const players = this.seatOrder.map((pid, seat) => ({
      seat,
      playerId: pid,
      nickname: this._store.players.get(pid).nickname,
    }));

    const dealSequence = this.deck.map((card, i) => {
      const to = stepDest(i);
      const step = { id: i, to };
      if (to === 'talon' || to === `seat${selfSeat}`) {
        step.rank = card.rank;
        step.suit = card.suit;
      }
      return step;
    });

    return {
      type: 'round_started',
      seats: {
        self: selfSeat,
        left: leftSeat,
        right: rightSeat,
        dealer: 0,
        players,
      },
      dealSequence,
      gameStatus: this.getViewModelFor(selfSeat),
    };
  }

  // T023
  advanceFromDealingToBidding() {
    if (this.phase !== 'dealing') return;
    this.phase = 'bidding';
    this.currentTurnSeat = 1; // P1 (clockwise-left of Dealer) bids first per FR-004
  }

  // T024
  submitBid(seat, amount) {
    if (this.phase !== 'bidding') return { rejected: true, reason: 'Not in bidding phase' };
    if (this.pausedByDisconnect) return { rejected: true, reason: 'Round is paused' };
    if (seat !== this.currentTurnSeat) return { rejected: true, reason: 'Not your turn' };
    if (!Number.isInteger(amount)) return { rejected: true, reason: 'Bid must be an integer' };
    if (amount % 5 !== 0) return { rejected: true, reason: 'Bid must be a multiple of 5' };
    if (amount > 300) return { rejected: true, reason: 'Bid cannot exceed 300' };
    const smallest = this.currentHighBid === null ? 100 : this.currentHighBid + 5;
    if (amount < smallest) return { rejected: true, reason: `Bid must be at least ${smallest}` };

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
    if (this.phase !== 'bidding') return { rejected: true, reason: 'Not in bidding phase' };
    if (this.pausedByDisconnect) return { rejected: true, reason: 'Round is paused' };
    if (seat !== this.currentTurnSeat) return { rejected: true, reason: 'Not your turn' };

    this.passedBidders.add(seat);
    this.bidHistory.push({ seat, amount: null });

    const remaining = [0, 1, 2].filter(s => !this.passedBidders.has(s));
    if (remaining.length === 1) {
      this.declarerSeat = remaining[0];
      if (this.currentHighBid === null) this.currentHighBid = 100;
      this.phase = 'post-bid-decision';
      this.currentTurnSeat = remaining[0];
      const { talonIds, identities } = this._absorbTalon();
      return { rejected: false, resolved: true, talonIds, identities };
    } else {
      let next = (seat + 1) % 3;
      while (this.passedBidders.has(next)) next = (next + 1) % 3;
      this.currentTurnSeat = next;
    }

    return { rejected: false };
  }

  // T026
  getViewModelFor(seat) {
    const phaseLabel = {
      'dealing': 'Dealing',
      'bidding': 'Bidding',
      'post-bid-decision': 'Declarer deciding',
      'selling-selection': 'Selling',
      'selling-bidding': 'Selling',
      'play-phase-ready': 'Round ready to play',
      'aborted': 'Round aborted',
    }[this.phase] ?? this.phase;

    const activePlayer = this.currentTurnSeat !== null
      ? {
          seat: this.currentTurnSeat,
          nickname: this._store.players.get(this.seatOrder[this.currentTurnSeat]).nickname,
        }
      : null;

    const declarer = this.declarerSeat !== null
      ? {
          seat: this.declarerSeat,
          nickname: this._store.players.get(this.seatOrder[this.declarerSeat]).nickname,
        }
      : null;

    // During selling-bidding, passedPlayers reflects sell opponents who passed (not the bidding-phase passers)
    const passedPlayers = (this.phase === 'selling-bidding'
      ? [...this.passedSellOpponents]
      : [...this.passedBidders]
    ).map(s => this._store.players.get(this.seatOrder[s]).nickname);

    // sellAttempt is 1-based: shown during selling phases and in post-bid-decision after a failed attempt
    let sellAttempt = null;
    if (this.phase === 'selling-selection' || this.phase === 'selling-bidding') {
      sellAttempt = this.attemptCount + 1;
    } else if (
      this.phase === 'post-bid-decision' &&
      this.attemptHistory.length > 0 &&
      this.attemptHistory[this.attemptHistory.length - 1].outcome === 'returned'
    ) {
      sellAttempt = this.attemptCount + 1;
    }

    return {
      phase: phaseLabel,
      activePlayer,
      viewerIsActive: this.currentTurnSeat === seat,
      currentHighBid: this.currentHighBid,
      declarer,
      passedPlayers,
      sellAttempt,
      disconnectedPlayers: [...this.disconnectedSeats].map(s =>
        this._store.players.get(this.seatOrder[s])?.nickname
      ).filter(Boolean),
    };
  }

  // T045
  markDisconnected(seat) {
    this.disconnectedSeats.add(seat);
    if (seat === this.currentTurnSeat) this.pausedByDisconnect = true;
  }

  markReconnected(seat) {
    this.disconnectedSeats.delete(seat);
    if (seat === this.currentTurnSeat) this.pausedByDisconnect = false;
  }

  abort(_abortedByNickname) {
    this.phase = 'aborted';
    this.currentTurnSeat = null;
  }

  // T047
  getSnapshotFor(seat) {
    const leftSeat = (seat + 1) % 3;
    const rightSeat = (seat + 2) % 3;

    const players = this.seatOrder.map((pid, s) => ({
      seat: s,
      playerId: pid,
      nickname: this._store.players.get(pid).nickname,
    }));

    const myHand = this.hands[seat].map(id => {
      const card = this.deck[id];
      return { id, rank: card.rank, suit: card.suit };
    });

    const opponentHandSizes = {};
    for (const s of [0, 1, 2]) {
      if (s !== seat) opponentHandSizes[s] = this.hands[s].length;
    }

    const gameStatus = this.getViewModelFor(seat);

    const payload = {
      type: 'round_state_snapshot',
      phase: gameStatus.phase,
      gameStatus,
      seats: {
        self: seat,
        left: leftSeat,
        right: rightSeat,
        dealer: this.dealerSeat,
        players,
      },
      myHand,
      opponentHandSizes,
    };

    // Talon identities visible to all during dealing and bidding
    if (this.phase === 'dealing' || this.phase === 'bidding') {
      payload.talon = this.talon.map(id => {
        const card = this.deck[id];
        return { id, rank: card.rank, suit: card.suit };
      });
    }

    if (this.talon.length > 0) {
      payload.talonIds = [...this.talon];
    }

    // Exposed sell card identities visible to all during selling-bidding
    if (this.phase === 'selling-bidding') {
      payload.exposed = this.exposedSellCards.map(id => {
        const card = this.deck[id];
        return { id, rank: card.rank, suit: card.suit };
      });
    }

    if (this.exposedSellCards.length > 0) {
      payload.exposedSellCardIds = [...this.exposedSellCards];
    }

    return payload;
  }

  // T042
  startGame(seat) {
    if (this.phase === 'play-phase-ready') return { noop: true };
    if (this.phase !== 'post-bid-decision') return { rejected: true, reason: 'Not in decision phase' };
    if (seat !== this.declarerSeat) return { rejected: true, reason: 'Only the declarer can start the game' };
    this.phase = 'play-phase-ready';
    return { noop: false, declarerId: this.seatOrder[this.declarerSeat], finalBid: this.currentHighBid };
  }

  // T059
  startSelling(seat) {
    if (this.phase !== 'post-bid-decision') return { rejected: true, reason: 'Not in decision phase' };
    if (seat !== this.declarerSeat) return { rejected: true, reason: 'Only the declarer can start selling' };
    if (this.pausedByDisconnect) return { rejected: true, reason: 'Round is paused' };
    if (this.attemptHistory.some(a => a.outcome === 'sold')) return { rejected: true, reason: 'Selling is no longer available' };
    if (this.attemptCount >= 3) return { rejected: true, reason: 'No selling attempts remaining' };
    this.phase = 'selling-selection';
    return { rejected: false };
  }

  // T060
  cancelSelling(seat) {
    if (this.phase !== 'selling-selection') return { rejected: true, reason: 'Not in selling-selection phase' };
    if (seat !== this.declarerSeat) return { rejected: true, reason: 'Only the declarer can cancel selling' };
    this.phase = 'post-bid-decision';
    return { rejected: false };
  }

  // T061
  commitSellSelection(seat, cardIds) {
    if (this.phase !== 'selling-selection') return { rejected: true, reason: 'Not in selling-selection phase' };
    if (seat !== this.declarerSeat) return { rejected: true, reason: 'Only the declarer can select cards' };
    if (this.pausedByDisconnect) return { rejected: true, reason: 'Round is paused' };
    if (!Array.isArray(cardIds) || cardIds.length !== 3) {
      return { rejected: true, reason: 'Exactly 3 cards must be selected' };
    }
    if (new Set(cardIds).size !== 3) {
      return { rejected: true, reason: 'Cards must be distinct' };
    }
    const hand = this.hands[this.declarerSeat];
    for (const id of cardIds) {
      if (!hand.includes(id)) return { rejected: true, reason: 'Card is not in your hand' };
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
    if (this.phase !== 'selling-bidding') return { rejected: true, reason: 'Not in selling-bidding phase' };
    if (this.pausedByDisconnect) return { rejected: true, reason: 'Round is paused' };
    if (seat === this.declarerSeat) return { rejected: true, reason: 'The declarer cannot bid in the sell auction' };
    if (seat !== this.currentTurnSeat) return { rejected: true, reason: 'Not your turn' };
    if (!Number.isInteger(amount)) return { rejected: true, reason: 'Bid must be an integer' };
    if (amount % 5 !== 0) return { rejected: true, reason: 'Bid must be a multiple of 5' };
    if (amount > 300) return { rejected: true, reason: 'Bid cannot exceed 300' };
    const smallest = this.currentHighBid === null ? 100 : this.currentHighBid + 5;
    if (amount < smallest) return { rejected: true, reason: `Bid must be at least ${smallest}` };

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
    if (this.phase !== 'selling-bidding') return { rejected: true, reason: 'Not in selling-bidding phase' };
    if (this.pausedByDisconnect) return { rejected: true, reason: 'Round is paused' };
    if (seat === this.declarerSeat) return { rejected: true, reason: 'The declarer cannot pass in the sell auction' };
    if (seat !== this.currentTurnSeat) return { rejected: true, reason: 'Not your turn' };

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
