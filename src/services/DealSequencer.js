'use strict';

const { initSeatMap } = require('./Seats');

// Canonical deal destination for step index i, generalized over playerCount (FR-002, FR-009).
// Each deal is a talon-bearing phase followed by a talon-less phase, mirroring the shipped
// 3-player cadence and reducing to it exactly at playerCount === 3:
//   - Talon-bearing phase: `playerCount` rounds, each dealing one card to seats
//     1, 2, …, n-1, 0 and then one to the talon ((n+1)-step pattern) → n cards/seat, n in talon.
//   - Talon-less phase: the remaining (7-n) rounds deal seats 1, 2, …, n-1, 0 (n-step pattern).
// Net: 7 cards/seat, `playerCount` talon cards.
//   3-player: 0-11 → seat1,seat2,seat0,talon; 12-23 → seat1,seat2,seat0.
//   4-player: 0-19 → seat1,seat2,seat3,seat0,talon; 20-31 → seat1,seat2,seat3,seat0.
function stepDest(i, playerCount = 3) {
  const talonPhaseLen = playerCount * (playerCount + 1);
  if (i < talonPhaseLen) {
    const pos = i % (playerCount + 1);
    if (pos === playerCount) { return 'talon'; }
    return `seat${(pos + 1) % playerCount}`;
  }
  const pos = (i - talonPhaseLen) % playerCount;
  return `seat${(pos + 1) % playerCount}`;
}

// Distribute a deck into { hands, talon } following the canonical deal sequence.
// Deck size is 8 × playerCount (24 for 3-player, 32 for 4-player).
function buildDealDistribution(playerCount = 3) {
  const deckSize = 8 * playerCount;
  const hands = initSeatMap(playerCount, () => []);
  const talon = [];
  for (let i = 0; i < deckSize; i++) {
    const to = stepDest(i, playerCount);
    if (to === 'talon') {
      talon.push(i);
    } else {
      hands[Number(to.slice(4))].push(i);
    }
  }
  return { hands, talon };
}

module.exports = { stepDest, buildDealDistribution };
