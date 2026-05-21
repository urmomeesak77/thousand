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

// Hands arranged so a crawl resolves to seat 2 by the highest led-suit card with
// no trump on trick 1: seat 0 leads Q♥, seat 1 commits K♠ (off-suit — proving
// follow-suit is suspended), seat 2 commits 10♥ (highest heart → winner).
function freshCrawl() {
  const tp = new TrickPlay(0, DECK);
  const hands = {
    0: [idOf('Q', '♥'), idOf('J', '♣'), idOf('A', '♦')],
    1: [idOf('K', '♠'), idOf('9', '♥'), idOf('A', '♣')],
    2: [idOf('10', '♥'), idOf('9', '♣'), idOf('A', '♠')],
  };
  return { tp, hands };
}

describe('TrickPlay crawl — beginCrawl gating (FR-003)', () => {
  it('activates only on trick 1 with the declarer leading', () => { // per FR-003
    const { tp } = freshCrawl();
    assert.equal(tp.crawlActive, false);
    const r = tp.beginCrawl();
    assert.equal(r.rejected, false);
    assert.equal(tp.crawlActive, true);
  });

  it('is idempotent — a second beginCrawl is a harmless no-op', () => { // per FR-003
    const { tp } = freshCrawl();
    tp.beginCrawl();
    const r = tp.beginCrawl();
    assert.equal(r.rejected, false);
    assert.equal(tp.crawlActive, true);
  });

  it('rejects beginCrawl when it is not trick 1', () => { // per FR-003
    const { tp } = freshCrawl();
    tp.trickNumber = 2;
    assert.equal(tp.beginCrawl().rejected, true);
    assert.equal(tp.crawlActive, false);
  });

  it('rejects beginCrawl when the declarer is not the current leader', () => { // per FR-003
    const { tp } = freshCrawl();
    tp.currentTrickLeaderSeat = 1;
    assert.equal(tp.beginCrawl().rejected, true);
  });
});

describe('TrickPlay crawl — commit without follow-suit (FR-004, FR-008)', () => {
  it('accepts any card, removes it from hand, and advances the turn', () => { // per FR-004
    const { tp, hands } = freshCrawl();
    tp.beginCrawl();

    const r0 = tp.commitCrawlCard(hands, 0, idOf('Q', '♥'));
    assert.equal(r0.rejected, false);
    assert.equal(hands[0].includes(idOf('Q', '♥')), false, 'committed card leaves the hand');
    assert.equal(tp.currentTurnSeat, 1, 'turn advances to seat 1');

    // seat 1 commits an off-suit card while still holding a heart — proving
    // follow-suit is suspended for the crawl trick (FR-004).
    const r1 = tp.commitCrawlCard(hands, 1, idOf('K', '♠'));
    assert.equal(r1.rejected, false, 'an off-suit commit must be accepted');
    assert.deepEqual(r1.committedSeats, [0, 1]);
    assert.equal(tp.currentTurnSeat, 2);
  });
});

describe('TrickPlay crawl — third commit resolves via _resolveTrick (FR-006, FR-007)', () => {
  it('funnels the three commits into a trick, picks the led-suit winner, and advances to trick 2', () => { // per FR-006, FR-007
    const { tp, hands } = freshCrawl();
    tp.beginCrawl();
    tp.commitCrawlCard(hands, 0, idOf('Q', '♥'));
    tp.commitCrawlCard(hands, 1, idOf('K', '♠'));
    const r = tp.commitCrawlCard(hands, 2, idOf('10', '♥'));

    assert.equal(r.crawlResolved, true);
    assert.equal(r.winnerSeat, 2, 'highest heart (10♥) wins; the off-suit K♠ cannot');
    assert.equal(r.commits.length, 3);
    // Winner collected the three cards and is on lead for trick 2.
    assert.equal(tp.collectedTrickCounts[2], 1);
    assert.equal(tp.collectedTricks[2].length, 3);
    assert.equal(tp.trickNumber, 2);
    assert.equal(tp.currentTrickLeaderSeat, 2);
    assert.equal(tp.currentTurnSeat, 2);
    assert.equal(tp.crawlActive, false, 'crawl ends once resolved');
    assert.equal(tp.currentTrick.length, 0, 'currentTrick cleared after resolution');
  });

  it('re-enforces follow-suit from trick 2 onward (FR-008)', () => { // per FR-008
    const { tp, hands } = freshCrawl();
    tp.beginCrawl();
    tp.commitCrawlCard(hands, 0, idOf('Q', '♥'));
    tp.commitCrawlCard(hands, 1, idOf('K', '♠'));
    tp.commitCrawlCard(hands, 2, idOf('10', '♥'));

    // Winner seat 2 leads trick 2 with a club; seat 0 still holds J♣ and must follow.
    assert.equal(tp.playCard(hands, 2, idOf('9', '♣')).rejected, false);
    const rej = tp.playCard(hands, 0, idOf('A', '♦'));
    assert.equal(rej.rejected, true, 'seat 0 holds a club and may not play a diamond');
    assert.match(rej.reason, /follow suit/i);
  });
});
