'use strict';

const { makeDeck, shuffle } = require('./Deck');

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

    for (let i = 0; i < 24; i++) {
      const to = this._stepDest(i);
      if (to === 'talon') {
        this.talon.push(i);
      } else {
        this.hands[Number(to[4])].push(i);
      }
    }

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
      const to = this._stepDest(i);
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

    if (3 - this.passedBidders.size === 1) {
      this.declarerSeat = seat;
      this.phase = 'post-bid-decision';
      this.currentTurnSeat = seat;
      const { talonIds, identities } = this._absorbTalon();
      return { rejected: false, resolved: true, talonIds, identities };
    } else {
      let next = (seat + 1) % 3;
      while (this.passedBidders.has(next)) {
        next = (next + 1) % 3;
      }
      this.currentTurnSeat = next;
    }

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
    if (remaining.length === 0) {
      this.declarerSeat = this.dealerSeat;
      this.currentHighBid = 100;
      this.phase = 'post-bid-decision';
      this.currentTurnSeat = this.dealerSeat;
      const { talonIds, identities } = this._absorbTalon();
      return { rejected: false, resolved: true, talonIds, identities };
    } else if (remaining.length === 1) {
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

    const passedPlayers = [...this.passedBidders].map(s =>
      this._store.players.get(this.seatOrder[s]).nickname
    );

    return {
      phase: phaseLabel,
      activePlayer,
      viewerIsActive: this.currentTurnSeat === seat,
      currentHighBid: this.currentHighBid,
      declarer,
      passedPlayers,
      sellAttempt: null,
      disconnectedPlayers: [...this.disconnectedSeats].map(s =>
        this._store.players.get(this.seatOrder[s]).nickname
      ),
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

  // T041 helper — moves talon into declarerSeat's hand; called at every bidding resolution site
  _absorbTalon() {
    const talonIds = [...this.talon];
    const identities = {};
    for (const id of talonIds) {
      const card = this.deck[id];
      identities[id] = { rank: card.rank, suit: card.suit };
    }
    this.talon = [];
    for (const id of talonIds) {
      this.hands[this.declarerSeat].push(id);
    }
    return { talonIds, identities };
  }

  // Canonical 24-step deal destination for step index i (FR-002)
  // Rounds 1-3 (i 0-11): seat1, seat2, seat0, talon (4-step pattern)
  // Rounds 4-7 (i 12-23): seat1, seat2, seat0 (3-step pattern)
  _stepDest(i) {
    if (i < 12) {
      const pos = i % 4;
      if (pos === 0) return 'seat1';
      if (pos === 1) return 'seat2';
      if (pos === 2) return 'seat0';
      return 'talon';
    }
    const pos = (i - 12) % 3;
    if (pos === 0) return 'seat1';
    if (pos === 1) return 'seat2';
    return 'seat0';
  }
}

module.exports = Round;
