'use strict';

const {
  BARREL_MIN, BARREL_MAX, SPECIAL_PENALTY, BARREL_ROUND_LIMIT, ZERO_ROUND_LIMIT, FOUR_NINES_BONUS,
} = require('./GameRules');
const { initSeatMap } = require('./Seats');

class Game {
  constructor({ gameId, seatOrder, dealerSeat, playerCount = 3 }) {
    this.gameId = gameId;
    this.playerCount = playerCount;
    this.seatOrder = seatOrder;
    this.dealerSeat = dealerSeat;
    this.currentRoundNumber = 1;
    this.cumulativeScores = initSeatMap(playerCount, 0);
    this.barrelState = initSeatMap(playerCount, () => ({ onBarrel: false, barrelRoundsUsed: 0 }));
    this.consecutiveZeros = initSeatMap(playerCount, 0);
    this.continuePresses = new Set();
    this.history = [];
    this.gameStatus = 'in-progress';
    this.nicknames = {};
    // Four-nines award banked this round (FR-002), pending the round-end history
    // append (FR-009). Reset each round in startNextRound. null when none.
    this.pendingFourNinesAward = null;
  }

  // FR-002: bank the +100 four-nines bonus onto the cumulative game score at
  // trick-play start. Does NOT touch roundDeltas, barrel state, or victory —
  // those evaluate at round end via the unchanged applyRoundEnd (R-102).
  applyFourNinesBonus(seat) {
    this.cumulativeScores[seat] += FOUR_NINES_BONUS;
    this.pendingFourNinesAward = { seat, amount: FOUR_NINES_BONUS };
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

    // FR-009: attribute the +100 to this round's history row so the
    // final-results running cumulative is auditable.
    if (this.pendingFourNinesAward) {
      summaryEntry.fourNinesAward = this.pendingFourNinesAward;
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
    this.dealerSeat = (this.dealerSeat + 1) % this.playerCount;
    this.continuePresses = new Set();
    this.pendingFourNinesAward = null;
  }
}

module.exports = Game;
