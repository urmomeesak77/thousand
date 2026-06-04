'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const BotStrategy = require('../src/services/bots/BotStrategy');

// Build a deck (indexed by cardId) from [rank, suit] pairs.
function buildDeck(cards) {
  return cards.map(([rank, suit], id) => ({ id, rank, suit }));
}

// Declarer leading on trick 1 (outside the marriage window), no trump. Hand: 10♥, Q♣.
// 10♥ is the higher-value card but is beatable by A♥; Q♣ is lower-value but becomes a
// guaranteed winner once A♣/10♣/K♣ are gone.
function declarerRound(deck) {
  return {
    phase: 'trick-play', declarerSeat: 0, currentTurnSeat: 0, playerCount: 3,
    fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
    trickNumber: 1, currentTrumpSuit: null, currentTrick: [], hands: { 0: [0, 1] }, deck,
  };
}

const CARDS = [
  ['10', 'H'], // 0  10♥ — higher value, beatable by A♥
  ['Q', 'C'],  // 1  Q♣  — boss once the higher clubs are gone
  ['A', 'H'],  // 2  A♥  — the live card that keeps 10♥ from being boss
  ['A', 'C'],  // 3
  ['10', 'C'], // 4
  ['K', 'C'],  // 5
];

describe('BotStrategy.decide — boss-card cashing with memory (FR-012, S1)', () => {
  it('with empty knowledge, the declarer plays the feature-009 lead (highest value)', () => { // per FR-014
    const d = BotStrategy.decide(declarerRound(buildDeck(CARDS)), 0, 0.5);
    assert.equal(d.kind, 'playCard');
    assert.equal(d.cardId, 0); // 10♥ — 009 leads the highest-value free card
  });

  it('cashes a recalled boss card instead of the 009 lead', () => { // per FR-012
    // A♣/10♣/K♣ recalled gone ⇒ Q♣ is unbeatable; A♥ still live ⇒ 10♥ is not.
    const knowledge = { goneCardIds: new Set([3, 4, 5]) };
    const d = BotStrategy.decide(declarerRound(buildDeck(CARDS)), 0, 0.5, knowledge);
    assert.equal(d.cardId, 1); // Q♣ — the highest-point identifiable boss
  });

  it('falls back to the 009 lead when a higher card is forgotten (memory mistake)', () => { // per FR-013
    // K♣ forgotten ⇒ Q♣ can no longer be proven safe ⇒ no boss ⇒ 009 fallback.
    const knowledge = { goneCardIds: new Set([3, 4]) };
    const d = BotStrategy.decide(declarerRound(buildDeck(CARDS)), 0, 0.5, knowledge);
    assert.equal(d.cardId, 0); // 10♥, exactly as with no memory
  });

  it('never reads gone cards from round state — only from knowledge.goneCardIds (S2)', () => { // per FR-012
    const round = declarerRound(buildDeck(CARDS));
    // Any direct read of round.playedLog would throw; the strategy must not touch it.
    Object.defineProperty(round, 'playedLog', {
      get() { throw new Error('BotStrategy read round.playedLog directly'); },
    });
    const knowledge = { goneCardIds: new Set([3, 4, 5]) };
    assert.doesNotThrow(() => BotStrategy.decide(round, 0, 0.5, knowledge));
    assert.equal(BotStrategy.decide(round, 0, 0.5, knowledge).cardId, 1);
  });
});

describe('BotStrategy.decide — opponent cashes a recalled boss on the lead (FR-012)', () => {
  // Opponent (declarer is seat 1) leading with A♣ + 9♥. A♣ is an unbeatable boss; 9♥ is
  // the lowest dump. 009 opponents always dump lowest; memory lets it cash the ace.
  const deck = buildDeck([['A', 'C'], ['9', 'H'], ['K', 'D']]);
  const round = {
    phase: 'trick-play', declarerSeat: 1, currentTurnSeat: 0, playerCount: 3,
    fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
    trickNumber: 2, currentTrumpSuit: null, currentTrick: [], hands: { 0: [0, 1] }, deck,
  };

  it('with empty knowledge, dumps the lowest legal card (feature 009)', () => { // per FR-014
    assert.equal(BotStrategy.decide(round, 0, 0.5).cardId, 1); // 9♥
  });

  it('with any recall active, leads the boss ace it can prove unbeatable', () => { // per FR-012
    const knowledge = { goneCardIds: new Set([2]) }; // an unrelated gone card
    assert.equal(BotStrategy.decide(round, 0, 0.5, knowledge).cardId, 0); // A♣
  });
});
