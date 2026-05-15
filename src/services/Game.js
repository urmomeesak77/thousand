'use strict';

class Game {
  constructor({ gameId, seatOrder, dealerSeat }) {
    this.gameId = gameId;
    this.seatOrder = seatOrder;
    this.dealerSeat = dealerSeat;
    this.currentRoundNumber = 1;
    this.cumulativeScores = { 0: 0, 1: 0, 2: 0 };
    this.barrelState = {
      0: { onBarrel: false, barrelRoundsUsed: 0 },
      1: { onBarrel: false, barrelRoundsUsed: 0 },
      2: { onBarrel: false, barrelRoundsUsed: 0 },
    };
    this.consecutiveZeros = { 0: 0, 1: 0, 2: 0 };
    this.continuePresses = new Set();
    this.history = [];
    this.gameStatus = 'in-progress';
    this.nicknames = {};
  }

  applyRoundEnd(roundDeltas, summaryEntry) {
    // Update cumulativeScores by adding each delta
    for (const seat in roundDeltas) {
      this.cumulativeScores[seat] += roundDeltas[seat];
    }

    // Update barrelState for each seat
    for (const seat in this.cumulativeScores) {
      const newScore = this.cumulativeScores[seat];
      const newOnBarrel = newScore >= 880 && newScore < 1000;
      const wasOnBarrel = this.barrelState[seat].onBarrel;

      // If exiting barrel: reset barrelRoundsUsed to 0
      if (wasOnBarrel && !newOnBarrel) {
        this.barrelState[seat].barrelRoundsUsed = 0;
      }

      // Update onBarrel status
      this.barrelState[seat].onBarrel = newOnBarrel;
    }

    // Append summaryEntry to history
    this.history.push(summaryEntry);

    // Return the updated cumulativeScores
    return this.cumulativeScores;
  }

  recordContinuePress(seat) {
    // Short-circuit if gameStatus is not 'in-progress'
    if (this.gameStatus !== 'in-progress') {
      return;
    }

    // Add seat to continuePresses (Set.add is idempotent)
    this.continuePresses.add(seat);
  }

  startNextRound() {
    // Increment currentRoundNumber
    this.currentRoundNumber++;

    // Rotate dealerSeat clockwise: (this.dealerSeat + 1) % 3
    this.dealerSeat = (this.dealerSeat + 1) % 3;

    // Clear continuePresses to empty Set
    this.continuePresses = new Set();
  }
}

module.exports = Game;
