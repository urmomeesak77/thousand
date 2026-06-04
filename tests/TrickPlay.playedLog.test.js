'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TrickPlay = require('../src/services/TrickPlay');

// Standard 24-card deck shaped like Round.start() produces (deck[id] = card).
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

// All-heart hands so follow-suit is always satisfiable and tricks resolve cleanly:
// seat 0 holds the top heart and leads/wins every trick.
function freshTrick() {
  const tp = new TrickPlay(0, DECK);
  const hands = {
    0: [idOf('A', '♥'), idOf('9', '♥')],
    1: [idOf('K', '♥'), idOf('10', '♥')],
    2: [idOf('Q', '♥'), idOf('J', '♥')],
  };
  return { tp, hands };
}

// Crawl scenario from TrickPlay.crawl.test.js: seat 0 leads, all three commit
// face-down on trick 1, resolving to a single trick.
function freshCrawl() {
  const tp = new TrickPlay(0, DECK);
  const hands = {
    0: [idOf('Q', '♥'), idOf('J', '♣'), idOf('A', '♦')],
    1: [idOf('K', '♠'), idOf('9', '♥'), idOf('A', '♣')],
    2: [idOf('10', '♥'), idOf('9', '♣'), idOf('A', '♠')],
  };
  return { tp, hands };
}

describe('TrickPlay.playedLog — initialisation (FR-003)', () => {
  it('starts as an empty array', () => { // per FR-003
    const { tp } = freshTrick();
    assert.deepEqual(tp.playedLog, []);
  });
});

describe('TrickPlay.playedLog — playCard logging (FR-003)', () => {
  it('records every played card once, in play order, with the led trickNumber', () => { // per FR-003
    const { tp, hands } = freshTrick();
    // Trick 1: all hearts, seat 0 (A♥) wins.
    tp.playCard(hands, 0, idOf('A', '♥'));
    tp.playCard(hands, 1, idOf('K', '♥'));
    tp.playCard(hands, 2, idOf('Q', '♥'));

    assert.deepEqual(tp.playedLog, [
      { cardId: idOf('A', '♥'), trickNumber: 1 },
      { cardId: idOf('K', '♥'), trickNumber: 1 },
      { cardId: idOf('Q', '♥'), trickNumber: 1 },
    ]);
  });

  it('tags later tricks with the correct trickNumber (P2)', () => { // per FR-003
    const { tp, hands } = freshTrick();
    tp.playCard(hands, 0, idOf('A', '♥'));
    tp.playCard(hands, 1, idOf('K', '♥'));
    tp.playCard(hands, 2, idOf('Q', '♥'));
    // Trick 2: seat 0 won, leads again.
    tp.playCard(hands, 0, idOf('9', '♥'));

    assert.equal(tp.trickNumber, 2);
    assert.deepEqual(tp.playedLog[3], { cardId: idOf('9', '♥'), trickNumber: 2 });
  });

  it('length equals the total cards played so far (P3)', () => { // per FR-003
    const { tp, hands } = freshTrick();
    assert.equal(tp.playedLog.length, 0);
    tp.playCard(hands, 0, idOf('A', '♥'));
    assert.equal(tp.playedLog.length, 1);
    tp.playCard(hands, 1, idOf('K', '♥'));
    tp.playCard(hands, 2, idOf('Q', '♥'));
    assert.equal(tp.playedLog.length, 3);
    tp.playCard(hands, 0, idOf('9', '♥'));
    assert.equal(tp.playedLog.length, 4);
  });

  it('does not log a rejected play (wrong turn)', () => { // per FR-003
    const { tp, hands } = freshTrick();
    const r = tp.playCard(hands, 1, idOf('K', '♥')); // not seat 1's turn
    assert.equal(r.rejected, true);
    assert.deepEqual(tp.playedLog, []);
  });
});

describe('TrickPlay.playedLog — crawl path (FR-003)', () => {
  it('logs each crawl-committed card once at trickNumber 1, no duplicates', () => { // per FR-003
    const { tp, hands } = freshCrawl();
    tp.beginCrawl();
    tp.commitCrawlCard(hands, 0, idOf('Q', '♥'));
    tp.commitCrawlCard(hands, 1, idOf('K', '♠'));
    tp.commitCrawlCard(hands, 2, idOf('10', '♥'));

    // Three commits funnel into one resolved trick — exactly three log entries,
    // never six (P1: no double-log when commits flow into currentTrick).
    assert.equal(tp.playedLog.length, 3);
    assert.deepEqual(tp.playedLog, [
      { cardId: idOf('Q', '♥'), trickNumber: 1 },
      { cardId: idOf('K', '♠'), trickNumber: 1 },
      { cardId: idOf('10', '♥'), trickNumber: 1 },
    ]);
  });

  it('does not log a rejected crawl commit (crawl not active)', () => { // per FR-003
    const { tp, hands } = freshCrawl();
    const r = tp.commitCrawlCard(hands, 0, idOf('Q', '♥'));
    assert.equal(r.rejected, true);
    assert.deepEqual(tp.playedLog, []);
  });
});
