'use strict';

// Canonical 24-step deal destination for step index i (FR-002):
// Rounds 1-3 (i 0-11): seat1, seat2, seat0, talon (4-step pattern)
// Rounds 4-7 (i 12-23): seat1, seat2, seat0 (3-step pattern)
function stepDest(i) {
  if (i < 12) {
    const pos = i % 4;
    if (pos === 0) {return 'seat1';}
    if (pos === 1) {return 'seat2';}
    if (pos === 2) {return 'seat0';}
    return 'talon';
  }
  const pos = (i - 12) % 3;
  if (pos === 0) {return 'seat1';}
  if (pos === 1) {return 'seat2';}
  return 'seat0';
}

// Distribute a 24-card deck into { hands, talon } following the canonical deal sequence
function buildDealDistribution() {
  const hands = { 0: [], 1: [], 2: [] };
  const talon = [];
  for (let i = 0; i < 24; i++) {
    const to = stepDest(i);
    if (to === 'talon') {
      talon.push(i);
    } else {
      hands[Number(to[4])].push(i);
    }
  }
  return { hands, talon };
}

module.exports = { stepDest, buildDealDistribution };
