'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TrickPlay = require('../src/services/TrickPlay');

// Same deck shape as Round.start() / TrickPlay.playedLog.test.js: deck[id] = card.
function buildDeck() {
  const ranks = ['9', 'J', 'Q', 'K', '10', 'A'];
  const suits = ['♣', '♠', '♥', '♦'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ id: deck.length, rank, suit });
    }
  }
  return deck;
}

const DECK = buildDeck();
const idOf = (rank, suit) => DECK.find((c) => c.rank === rank && c.suit === suit).id;

// Lead `id` for `seat` on trick `trickNumber`: force an empty centre led by seat,
// then play the card (recorded as that trick's lead).
function lead(tp, hands, seat, id, trickNumber) {
  tp.trickNumber = trickNumber;
  tp.currentTrickLeaderSeat = seat;
  tp.currentTurnSeat = seat;
  tp.currentTrick = [];
  tp.playCard(hands, seat, id);
}

// Declare a marriage for `seat` on trick `trickNumber` (centre empty, seat leading).
function declare(tp, hands, seat, id, trickNumber) {
  tp.trickNumber = trickNumber;
  tp.currentTrickLeaderSeat = seat;
  tp.currentTurnSeat = seat;
  tp.currentTrick = [];
  return tp.declareMarriage(hands, seat, id);
}

describe('TrickPlay clubs-combo easter egg', () => {
  it('A then 10 of clubs led, then clubs marriage -> easterEgg true', () => {
    const tp = new TrickPlay(0, DECK);
    const hands = {
      0: [idOf('A', '♣'), idOf('10', '♣'), idOf('K', '♣'), idOf('Q', '♣')],
      1: [], 2: [],
    };
    lead(tp, hands, 0, idOf('A', '♣'), 1);
    lead(tp, hands, 0, idOf('10', '♣'), 2);
    const res = declare(tp, hands, 0, idOf('K', '♣'), 3);
    assert.equal(res.rejected, false);
    assert.equal(res.easterEgg, true);
  });

  it('reversed order (10 then A) -> no easterEgg', () => {
    const tp = new TrickPlay(0, DECK);
    const hands = {
      0: [idOf('A', '♣'), idOf('10', '♣'), idOf('K', '♣'), idOf('Q', '♣')],
      1: [], 2: [],
    };
    lead(tp, hands, 0, idOf('10', '♣'), 1);
    lead(tp, hands, 0, idOf('A', '♣'), 2);
    const res = declare(tp, hands, 0, idOf('K', '♣'), 3);
    assert.ok(!res.easterEgg);
  });

  it('a different seat led one of the clubs -> no easterEgg', () => {
    const tp = new TrickPlay(0, DECK);
    const hands = {
      0: [idOf('10', '♣'), idOf('K', '♣'), idOf('Q', '♣')],
      1: [idOf('A', '♣')],
      2: [],
    };
    lead(tp, hands, 1, idOf('A', '♣'), 1);   // seat 1 led the ace
    lead(tp, hands, 0, idOf('10', '♣'), 2);
    const res = declare(tp, hands, 0, idOf('K', '♣'), 3);
    assert.ok(!res.easterEgg);
  });

  it('non-clubs marriage -> no easterEgg', () => {
    const tp = new TrickPlay(0, DECK);
    const hands = {
      0: [idOf('A', '♣'), idOf('10', '♣'), idOf('K', '♠'), idOf('Q', '♠')],
      1: [], 2: [],
    };
    lead(tp, hands, 0, idOf('A', '♣'), 1);
    lead(tp, hands, 0, idOf('10', '♣'), 2);
    const res = declare(tp, hands, 0, idOf('K', '♠'), 3); // spades marriage
    assert.ok(!res.easterEgg);
  });

  it('a non-club lead breaks the streak -> no easterEgg', () => {
    const tp = new TrickPlay(0, DECK);
    const hands = {
      0: [idOf('A', '♣'), idOf('9', '♠'), idOf('K', '♣'), idOf('Q', '♣')],
      1: [], 2: [],
    };
    lead(tp, hands, 0, idOf('A', '♣'), 1);
    lead(tp, hands, 0, idOf('9', '♠'), 2);   // T-1 lead is not 10 of clubs
    const res = declare(tp, hands, 0, idOf('K', '♣'), 3);
    assert.ok(!res.easterEgg);
  });
});
