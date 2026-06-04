'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const BotStrategy = require('../src/services/bots/BotStrategy');
const BotMemory = require('../src/services/bots/BotMemory');

// Build a deck (indexed by cardId) from [rank, suit] pairs.
function buildDeck(cards) {
  return cards.map(([rank, suit], id) => ({ id, rank, suit }));
}

// Declarer leading on trick 1, no trump. Hand: K♣, 9♦, J♦. With no recall the bot can't
// prove K♣ safe (A♣/10♣ still live) so it leads the low safe 9♦; once A♣ & 10♣ are
// recalled gone, K♣ is a guaranteed winner and gets cashed. The full higher-diamond suit
// is in the deck so 9♦/J♦ are never themselves bosses.
function declarerRound(deck) {
  return {
    phase: 'trick-play', declarerSeat: 0, currentTurnSeat: 0, playerCount: 3,
    fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
    trickNumber: 1, currentTrumpSuit: null, currentTrick: [], hands: { 0: [0, 1, 2] }, deck,
  };
}

const CARDS = [
  ['K', 'C'],  // 0  hand — boss only once A♣ & 10♣ are recalled gone
  ['9', 'D'],  // 1  hand — the empty-memory safe lead
  ['J', 'D'],  // 2  hand
  ['A', 'C'],  // 3  higher club (recall target)
  ['10', 'C'], // 4  higher club (recall target)
  ['A', 'D'],  // 5  higher diamonds keep 9♦/J♦ from ever being a boss
  ['10', 'D'], // 6
  ['K', 'D'],  // 7
  ['Q', 'D'],  // 8
];

describe('BotStrategy.decide — boss-card cashing with memory (FR-012, S2)', () => {
  it('with empty knowledge, leads a low safe side card (no boss provable)', () => { // per FR-014
    const d = BotStrategy.decide(declarerRound(buildDeck(CARDS)), 0, 0.5);
    assert.equal(d.kind, 'playCard');
    assert.equal(d.cardId, 1); // 9♦ — K♣ not provably safe, lead low from the long ♦ suit
  });

  it('cashes K♣ once A♣ and 10♣ are recalled gone', () => { // per FR-012
    const knowledge = { goneCardIds: new Set([3, 4]) };
    const d = BotStrategy.decide(declarerRound(buildDeck(CARDS)), 0, 0.5, knowledge);
    assert.equal(d.cardId, 0); // K♣ is now a guaranteed winner
  });

  it('falls back to the safe lead when a higher club is forgotten (memory mistake)', () => { // per FR-013
    const knowledge = { goneCardIds: new Set([3]) }; // 10♣ forgotten
    const d = BotStrategy.decide(declarerRound(buildDeck(CARDS)), 0, 0.5, knowledge);
    assert.equal(d.cardId, 1); // 9♦ — cannot prove K♣ safe
  });

  it('never reads gone cards from round state — only from knowledge.goneCardIds (S2)', () => { // per FR-012
    const round = declarerRound(buildDeck(CARDS));
    // Any direct read of round.playedLog would throw; the strategy must not touch it.
    Object.defineProperty(round, 'playedLog', {
      get() { throw new Error('BotStrategy read round.playedLog directly'); },
    });
    const knowledge = { goneCardIds: new Set([3, 4]) };
    assert.doesNotThrow(() => BotStrategy.decide(round, 0, 0.5, knowledge));
    assert.equal(BotStrategy.decide(round, 0, 0.5, knowledge).cardId, 0); // K♣
  });
});

describe('BotStrategy.decide — opponents play competently on the lead (FR-012)', () => {
  // Declarer is seat 1; the opponent at seat 0 leads. It cashes its boss ace instead of
  // dumping its lowest card (the old v1 behaviour). An ace is an inherent boss — no memory
  // needed; memory only matters for non-top cards (covered by the declarer cases above).
  const deck = buildDeck([['A', 'C'], ['9', 'H'], ['K', 'D']]);
  const round = {
    phase: 'trick-play', declarerSeat: 1, currentTurnSeat: 0, playerCount: 3,
    fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
    trickNumber: 2, currentTrumpSuit: null, currentTrick: [], hands: { 0: [0, 1] }, deck,
  };

  it('leads the boss ace, not the lowest card', () => { // per FR-012
    assert.equal(BotStrategy.decide(round, 0, 0.5).cardId, 0); // A♣
  });
});

describe('BotStrategy.decide — forgetting causes measurable mistakes (FR-013, SC-004)', () => {
  // Declarer holds K♣, 9♦, J♦, leading trick 5. K♣ is a boss ONLY if the bot recalls both
  // higher clubs (A♣,10♣, played trick 1 ⇒ age 4). Recalled ⇒ cash K♣; forgotten ⇒ it
  // can't prove K♣ safe and leads the low 9♦ — an observable mistake (a missed winner).
  const DECK = buildDeck([
    ['K', 'C'], ['9', 'D'], ['J', 'D'], ['A', 'C'], ['10', 'C'],
    ['A', 'D'], ['10', 'D'], ['K', 'D'], ['Q', 'D'],
  ]);
  const round = {
    phase: 'trick-play', declarerSeat: 0, currentTurnSeat: 0, playerCount: 3,
    fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
    trickNumber: 5, currentTrumpSuit: null, currentTrick: [], hands: { 0: [0, 1, 2] }, deck: DECK,
  };
  const PLAYED_LOG = [{ cardId: 3, trickNumber: 1 }, { cardId: 4, trickNumber: 1 }];

  // How many of `rounds` decisions cash the boss K♣ (cardId 0) vs leading 9♦ (the mistake).
  function bossCashes(skill, seed, rounds) {
    let cashes = 0;
    for (let roundKey = 0; roundKey < rounds; roundKey++) {
      const goneCardIds = new BotMemory(skill, seed).recalledGoneCardIds(PLAYED_LOG, 5, roundKey);
      if (BotStrategy.decide(round, 0, 0.5, { goneCardIds }).cardId === 0) { cashes += 1; }
    }
    return cashes;
  }

  it('a perfect-memory bot cashes the boss every round (no mistakes)', () => { // per FR-013
    assert.equal(bossCashes(1, 7, 200), 200);
  });

  it('a forgetful bot makes measurably more mistakes than the perfect baseline', () => { // per SC-004
    const forgetful = bossCashes(0.2, 7, 200);
    assert.ok(forgetful < 200, `forgetful cashed ${forgetful}/200 — expected some fallbacks`);
    assert.ok(200 - forgetful >= 20, `expected ≥20 mistakes, got ${200 - forgetful}`);
  });
});
