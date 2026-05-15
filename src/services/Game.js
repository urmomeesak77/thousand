'use strict';

const { BARREL_MIN, BARREL_MAX, SPECIAL_PENALTY, BARREL_ROUND_LIMIT, ZERO_ROUND_LIMIT } = require('./GameRules');

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
    for (const seat in roundDeltas) {
      this.cumulativeScores[seat] += roundDeltas[seat];
    }

    // Barrel counter advances every round the player was on barrel (FR-023).
    // Counter reset happens regardless of whether penalty fired.
    for (const seat in this.cumulativeScores) {
      if (!this.barrelState[seat].onBarrel) { continue; }

      this.barrelState[seat].barrelRoundsUsed += 1;

      if (this.barrelState[seat].barrelRoundsUsed === BARREL_ROUND_LIMIT) {
        const score = this.cumulativeScores[seat];
        if (score >= BARREL_MIN && score < BARREL_MAX) {
          this.cumulativeScores[seat] -= SPECIAL_PENALTY;
        }
        this.barrelState[seat].barrelRoundsUsed = 0;
      }
    }

    // Three consecutive rounds with zero round score (trickPoints + marriageBonus)
    // triggers a −120 penalty, independent of barrel state (FR-024).
    for (const seat in this.cumulativeScores) {
      const { trickPoints, marriageBonus } = summaryEntry.perPlayer[seat];
      if (trickPoints + marriageBonus === 0) {
        this.consecutiveZeros[seat] += 1;
      } else {
        this.consecutiveZeros[seat] = 0;
      }

      if (this.consecutiveZeros[seat] === ZERO_ROUND_LIMIT) {
        this.cumulativeScores[seat] -= SPECIAL_PENALTY;
        this.consecutiveZeros[seat] = 0;
      }
    }

    // Re-evaluate onBarrel after all penalties are applied so the invariant holds:
    // onBarrel === (cumulativeScores[seat] >= BARREL_MIN && < BARREL_MAX)
    for (const seat in this.cumulativeScores) {
      const score = this.cumulativeScores[seat];
      const nowOnBarrel = score >= BARREL_MIN && score < BARREL_MAX;
      if (this.barrelState[seat].onBarrel && !nowOnBarrel) {
        this.barrelState[seat].barrelRoundsUsed = 0;
      }
      this.barrelState[seat].onBarrel = nowOnBarrel;
    }

    this.history.push(summaryEntry);
    return this.cumulativeScores;
  }

  recordContinuePress(seat) {
    if (this.gameStatus !== 'in-progress') { return; }
    this.continuePresses.add(seat);
  }

  startNextRound() {
    this.currentRoundNumber++;
    this.dealerSeat = (this.dealerSeat + 1) % 3;
    this.continuePresses = new Set();
  }
}

module.exports = Game;
