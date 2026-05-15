'use strict';

const { RANK_ORDER } = require('./Scoring');

class TrickPlay {
  constructor(declarerSeat, deck) {
    this.declarerSeat = declarerSeat;
    this.deck = deck;

    this.trickNumber = 1;
    this.currentTrickLeaderSeat = declarerSeat;
    this.currentTurnSeat = declarerSeat;
    this.currentTrick = [];
    this.currentTrumpSuit = null;
    this.declaredMarriages = [];
    this.collectedTricks = { 0: [], 1: [], 2: [] };
    this.collectedTrickCounts = { 0: 0, 1: 0, 2: 0 };
  }

  playCard(hands, seat, cardId, _opts = {}) {
    if (seat !== this.currentTurnSeat) {
      return { rejected: true, reason: 'Not your turn' };
    }
    if (!hands[seat].includes(cardId)) {
      return { rejected: true, reason: 'Card not in hand' };
    }

    const followSuitRejection = this._checkFollowSuit(hands, seat, cardId);
    if (followSuitRejection) {return followSuitRejection;}

    hands[seat] = hands[seat].filter(id => id !== cardId);
    this.currentTrick.push({ seat, cardId });
    this.currentTurnSeat = (seat + 1) % 3;

    if (this.currentTrick.length === 3) {
      return this._resolveTrick();
    }

    return { rejected: false };
  }

  _checkFollowSuit(hands, seat, cardId) {
    if (this.currentTrick.length === 0) {return null;}

    const ledSuit = this.deck[this.currentTrick[0].cardId].suit;
    const playedSuit = this.deck[cardId].suit;

    if (playedSuit === ledSuit) {return null;}

    const hasLedSuit = hands[seat].some(id => this.deck[id].suit === ledSuit);
    if (hasLedSuit) {
      return { rejected: true, reason: 'You must follow suit' };
    }

    return null;
  }

  _resolveTrick() {
    const { winnerSeat, winningCardId } = this._determineWinner();

    const trickCardIds = this.currentTrick.map(c => c.cardId);
    for (const cardId of trickCardIds) {
      this.collectedTricks[winnerSeat].push(cardId);
    }
    this.collectedTrickCounts[winnerSeat] += 1;

    this.currentTrick = [];
    this.currentTrickLeaderSeat = winnerSeat;
    this.currentTurnSeat = winnerSeat;

    const result = { rejected: false, trickResolved: true, winnerSeat, winningCardId, trickCardIds };

    if (this.trickNumber < 8) {
      this.trickNumber += 1;
      return { ...result, roundComplete: false };
    }

    // trickNumber === 8: last trick
    return { ...result, roundComplete: true };
  }

  _determineWinner() {
    const ledSuit = this.deck[this.currentTrick[0].cardId].suit;
    const trumpCards = this.currentTrick.filter(
      c => this.deck[c.cardId].suit === this.currentTrumpSuit
    );
    const candidates = trumpCards.length > 0
      ? trumpCards
      : this.currentTrick.filter(c => this.deck[c.cardId].suit === ledSuit);

    const winner = candidates.reduce((a, b) =>
      RANK_ORDER[this.deck[a.cardId].rank] > RANK_ORDER[this.deck[b.cardId].rank] ? a : b
    );

    return { winnerSeat: winner.seat, winningCardId: winner.cardId };
  }
}

module.exports = TrickPlay;
