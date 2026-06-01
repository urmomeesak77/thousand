'use strict';

const crypto = require('crypto');

// 3-player: 24 cards (9–A). 4-player: 32 cards (7–A) — the 7 and 8 (worth 0 points,
// ranked below the 9) make 8 ranks × 4 suits divide evenly to 8 cards/seat (FR-005, FR-006).
const RANKS_3P = ['9', '10', 'J', 'Q', 'K', 'A'];
const RANKS_4P = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['♣', '♠', '♥', '♦'];

function makeDeck(playerCount = 3) {
  const ranks = playerCount === 4 ? RANKS_4P : RANKS_3P;
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffle(deck) {
  const result = deck.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

module.exports = { makeDeck, shuffle };
