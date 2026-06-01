'use strict';

// Seat-count helpers for the N-player generalization (Decision 2; §VII pure-utility
// carve-out). A single `playerCount` (3 or 4) drives every seat range and per-seat
// accumulator, so the engine reduces exactly to today at playerCount === 3.

// seatRange(3) → [0, 1, 2]; seatRange(4) → [0, 1, 2, 3]
function seatRange(playerCount) {
  return Array.from({ length: playerCount }, (_, seat) => seat);
}

// initSeatMap(3, 0) → { 0: 0, 1: 0, 2: 0 }. When `fill` is a function it is invoked
// per seat (use for fresh arrays/objects, e.g. () => []), avoiding shared references.
function initSeatMap(playerCount, fill) {
  const map = {};
  const isFactory = typeof fill === 'function';
  for (let seat = 0; seat < playerCount; seat++) {
    map[seat] = isFactory ? fill(seat) : fill;
  }
  return map;
}

module.exports = { seatRange, initSeatMap };
