'use strict';

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
  }

  start() {
    return null;
  }

  getRoundStartedPayloadFor(_playerId) {
    return null;
  }

  getViewModelFor(_seat) {
    return null;
  }

  getSnapshotFor(_seat) {
    return null;
  }
}

module.exports = Round;
