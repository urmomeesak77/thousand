'use strict';

const { makeDeck } = require('./Deck');
const { stepDest } = require('./DealSequencer');

// Test-only deck seam. Inert in production (returns null unless
// THOUSAND_STACK_DECK is set), it lets the quickstart and the live e2e force
// otherwise astronomically-rare deals:
//   `four-nines`      → all four 9s on seat 1; `four-nines-2` → seat 2.
//   `no-ace-declarer` → all four aces split across seats 1 & 2 (never seat 0
//                       or the talon), so seat 0 — the intended declarer —
//                       holds no ace through talon pickup and the exchange.
function stackedDeckForTest(playerCount) {
  const mode = process.env.THOUSAND_STACK_DECK;
  if (!mode) { return null; }
  if (mode.startsWith('four-nines')) {
    const targetSeat = mode === 'four-nines-2' ? 2 : 1;
    return stackRankOnSlots('9', slotsForSeat(targetSeat, 4, playerCount), playerCount);
  }
  if (mode === 'no-ace-declarer') {
    // Split the four aces across seats 1 and 2 (never seat 0 or the talon) so the
    // intended declarer (seat 0) holds no ace through pickup and exchange.
    return stackRankOnSlots('A', [...slotsForSeat(1, 2, playerCount), ...slotsForSeat(2, 2, playerCount)], playerCount);
  }
  return null;
}

// First `count` deck indices that the deal sequence routes to `seat`, for the
// active deck length (24 or 32). Lets the seam target seats regardless of count.
function slotsForSeat(seat, count, playerCount) {
  const slots = [];
  const deckSize = 8 * playerCount;
  for (let i = 0; i < deckSize && slots.length < count; i++) {
    if (stepDest(i, playerCount) === `seat${seat}`) { slots.push(i); }
  }
  return slots;
}

// Build a deck where the four cards of `rank` occupy `slots` (deck indices), with
// the remaining cards filling the rest in order. Deck index → seat is fixed by
// DealSequencer.stepDest, so callers pick slots that land the cards on the intended seats.
function stackRankOnSlots(rank, slots, playerCount) {
  const full = makeDeck(playerCount);
  const picked = full.filter((c) => c.rank === rank);
  const rest = full.filter((c) => c.rank !== rank);
  const ordered = new Array(full.length);
  slots.forEach((pos, idx) => { ordered[pos] = picked[idx]; });
  let r = 0;
  for (let i = 0; i < full.length; i++) { if (!ordered[i]) { ordered[i] = rest[r++]; } }
  return ordered;
}

module.exports = { stackedDeckForTest };
