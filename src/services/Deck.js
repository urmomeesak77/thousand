'use strict';

const crypto = require('crypto');

const RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['♣', '♠', '♥', '♦'];

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
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
