'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');

// Deck layout: suits=['♣','♠','♥','♦'], ranks=['9','10','J','Q','K','A']
// → card id = suitIndex*6 + rankIndex
// ♣9=0  ♣10=1  ♣J=2  ♣Q=3  ♣K=4  ♣A=5
// ♠9=6  ♠10=7  ♠J=8  ♠Q=9  ♠K=10 ♠A=11
// ♥9=12 ♥10=13 ♥J=14 ♥Q=15 ♥K=16 ♥A=17
// ♦9=18 ♦10=19 ♦J=20 ♦Q=21 ♦K=22 ♦A=23
//
// The real deck is shuffled, so we look up card ids by rank+suit.

function makeRound() {
  const pids = ['p0', 'p1', 'p2'];
  const game = { players: new Set(pids) };
  const store = {
    players: new Map([
      ['p0', { nickname: 'Dealer' }],
      ['p1', { nickname: 'P1' }],
      ['p2', { nickname: 'P2' }],
    ]),
  };
  const round = new Round({ game, store });
  round.start();
  return round;
}

function findCardId(deck, rank, suit) {
  const card = deck.find(c => c.rank === rank && c.suit === suit);
  if (!card) { throw new Error(`Card ${rank}${suit} not found in deck`); }
  return card.id;
}

function makeTrickPlayRound() {
  const round = makeRound();
  round.advanceFromDealingToBidding();
  round.submitPass(1);
  round.submitPass(2); // declarerSeat = 0

  round.phase = 'trick-play';
  round.trickNumber = 1;
  round.currentTrickLeaderSeat = 0;
  round.currentTurnSeat = 0;
  round.currentTrick = [];
  round.collectedTricks = { 0: [], 1: [], 2: [] };
  round.currentTrumpSuit = null;
  round.declaredMarriages = [];
  round.exchangePassesCommitted = 2;

  return round;
}

function setHand(round, seat, cardIds) {
  round.hands[seat] = [...cardIds];
}

// ---------------------------------------------------------------------------
// FR-009 — Marriage declaration timing restrictions
// ---------------------------------------------------------------------------

describe('Round.marriage — timing restrictions (FR-009)', () => {
  it('rejects declareMarriage on trick 1', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 1;
    round.currentTrick = []; // leading position
    const clubK = findCardId(round.deck, 'K', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    setHand(round, 0, [clubK, clubQ]);

    const r = round.declareMarriage(0, clubK);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('rejects declareMarriage on trick 7', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 7;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const spadeK = findCardId(round.deck, 'K', '♠');
    const spadeQ = findCardId(round.deck, 'Q', '♠');
    setHand(round, 0, [spadeK, spadeQ]);

    const r = round.declareMarriage(0, spadeK);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('rejects declareMarriage on trick 8', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 8;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const heartK = findCardId(round.deck, 'K', '♥');
    const heartQ = findCardId(round.deck, 'Q', '♥');
    setHand(round, 0, [heartK, heartQ]);

    const r = round.declareMarriage(0, heartK);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('rejects declareMarriage when caller is not the current trick leader', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 3;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0; // seat 0 is leader
    round.currentTurnSeat = 1;        // seat 1's turn but not leader
    const diamK = findCardId(round.deck, 'K', '♦');
    const diamQ = findCardId(round.deck, 'Q', '♦');
    setHand(round, 1, [diamK, diamQ]);

    const r = round.declareMarriage(1, diamK);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('rejects declareMarriage when trick is already in progress (not leading)', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 3;
    const clubK = findCardId(round.deck, 'K', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    const club9 = findCardId(round.deck, '9', '♣');
    setHand(round, 0, [club9]);
    setHand(round, 1, [clubK, clubQ]);
    setHand(round, 2, [findCardId(round.deck, 'J', '♣')]);

    // Seat 0 leads; trick is in progress when seat 1 tries to declare
    round.playCard(0, club9);
    const r = round.declareMarriage(1, clubK);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });
});

// ---------------------------------------------------------------------------
// FR-010 — Marriage declaration conditions and effects
// ---------------------------------------------------------------------------

describe('Round.marriage — successful declaration (FR-010)', () => {
  it('accepts declareMarriage when player holds K+Q of same suit on trick 2', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 2;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const clubK = findCardId(round.deck, 'K', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    setHand(round, 0, [clubK, clubQ]);

    const r = round.declareMarriage(0, clubK);
    assert.equal(r.rejected, false);
  });

  it('accepts declareMarriage on trick 6 (last valid trick)', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 6;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const spadeK = findCardId(round.deck, 'K', '♠');
    const spadeQ = findCardId(round.deck, 'Q', '♠');
    setHand(round, 0, [spadeK, spadeQ]);

    const r = round.declareMarriage(0, spadeK);
    assert.equal(r.rejected, false);
  });

  it('successful declaration appends to declaredMarriages with correct fields', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 3;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const heartK = findCardId(round.deck, 'K', '♥');
    const heartQ = findCardId(round.deck, 'Q', '♥');
    setHand(round, 0, [heartK, heartQ]);

    round.declareMarriage(0, heartK);

    assert.equal(round.declaredMarriages.length, 1);
    const m = round.declaredMarriages[0];
    assert.equal(m.playerSeat, 0);
    assert.equal(m.suit, '♥');
    assert.ok(typeof m.bonus === 'number');
    assert.ok(m.bonus > 0);
    assert.equal(m.trickNumber, 3);
  });

  it('successful declaration sets currentTrumpSuit to the declared suit', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 4;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const diamK = findCardId(round.deck, 'K', '♦');
    const diamQ = findCardId(round.deck, 'Q', '♦');
    setHand(round, 0, [diamK, diamQ]);

    round.declareMarriage(0, diamK);

    assert.equal(round.currentTrumpSuit, '♦');
  });

  it('return value includes rejected:false, suit, bonus, and newTrumpSuit', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 5;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const clubK = findCardId(round.deck, 'K', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    setHand(round, 0, [clubK, clubQ]);

    const r = round.declareMarriage(0, clubK);
    assert.equal(r.rejected, false);
    assert.equal(r.suit, '♣');
    assert.ok(typeof r.bonus === 'number');
    assert.ok(r.bonus > 0);
    assert.equal(r.newTrumpSuit, '♣');
  });

  it('rejects when player holds K but not Q of that suit', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 3;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const spadeK = findCardId(round.deck, 'K', '♠');
    const spade9 = findCardId(round.deck, '9', '♠');
    setHand(round, 0, [spadeK, spade9]); // K but no Q

    const r = round.declareMarriage(0, spadeK);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('rejects when player holds Q but not K of that suit', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 3;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const heartQ = findCardId(round.deck, 'Q', '♥');
    const heart9 = findCardId(round.deck, '9', '♥');
    setHand(round, 0, [heartQ, heart9]); // Q but no K

    const r = round.declareMarriage(0, heartQ);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('rejects when the declared card is not K or Q', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 3;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const clubK = findCardId(round.deck, 'K', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    const clubA = findCardId(round.deck, 'A', '♣');
    setHand(round, 0, [clubK, clubQ, clubA]);

    // Try declaring with an Ace — not a marriage card
    const r = round.declareMarriage(0, clubA);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });
});

// ---------------------------------------------------------------------------
// FR-011 — Play-without-declaring: no bonus, no trump change
// ---------------------------------------------------------------------------

describe('Round.marriage — play-without-declaring (FR-011)', () => {
  it('playing K without declaring marriage does not change currentTrumpSuit', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 3;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const clubK = findCardId(round.deck, 'K', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    setHand(round, 0, [clubK, clubQ]);
    setHand(round, 1, [findCardId(round.deck, '9', '♠')]);
    setHand(round, 2, [findCardId(round.deck, '9', '♥')]);

    round.playCard(0, clubK);

    assert.equal(round.currentTrumpSuit, null);
  });

  it('playing K without declaring marriage leaves declaredMarriages empty', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 3;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const clubK = findCardId(round.deck, 'K', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    setHand(round, 0, [clubK, clubQ]);
    setHand(round, 1, [findCardId(round.deck, '9', '♠')]);
    setHand(round, 2, [findCardId(round.deck, '9', '♥')]);

    round.playCard(0, clubK);

    assert.equal(round.declaredMarriages.length, 0);
  });

  it('playing Q without declaring marriage leaves declaredMarriages empty', () => {
    const round = makeTrickPlayRound();
    round.trickNumber = 4;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const heartK = findCardId(round.deck, 'K', '♥');
    const heartQ = findCardId(round.deck, 'Q', '♥');
    setHand(round, 0, [heartK, heartQ]);
    setHand(round, 1, [findCardId(round.deck, '9', '♠')]);
    setHand(round, 2, [findCardId(round.deck, '9', '♦')]);

    round.playCard(0, heartQ);

    assert.equal(round.declaredMarriages.length, 0);
    assert.equal(round.currentTrumpSuit, null);
  });
});

// ---------------------------------------------------------------------------
// FR-012 — Marriage stacking and trump replacement
// ---------------------------------------------------------------------------

describe('Round.marriage — stacking and trump replacement (FR-012)', () => {
  it('two marriages by the same player both appear in declaredMarriages', () => {
    const round = makeTrickPlayRound();

    // First marriage on trick 2
    round.trickNumber = 2;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    const clubK = findCardId(round.deck, 'K', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    const spadeK = findCardId(round.deck, 'K', '♠');
    const spadeQ = findCardId(round.deck, 'Q', '♠');
    setHand(round, 0, [clubK, clubQ, spadeK, spadeQ]);

    round.declareMarriage(0, clubK);
    assert.equal(round.declaredMarriages.length, 1);

    // Second marriage on trick 3
    round.trickNumber = 3;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;

    round.declareMarriage(0, spadeK);
    assert.equal(round.declaredMarriages.length, 2);
  });

  it('both marriage bonuses accumulate in declaredMarriages', () => {
    const round = makeTrickPlayRound();
    const clubK = findCardId(round.deck, 'K', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    const spadeK = findCardId(round.deck, 'K', '♠');
    const spadeQ = findCardId(round.deck, 'Q', '♠');
    setHand(round, 0, [clubK, clubQ, spadeK, spadeQ]);

    round.trickNumber = 2;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.declareMarriage(0, clubK);

    round.trickNumber = 3;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.declareMarriage(0, spadeK);

    const totalBonus = round.declaredMarriages.reduce((sum, m) => sum + m.bonus, 0);
    assert.ok(totalBonus > 0);
    assert.equal(round.declaredMarriages.length, 2);
  });

  it('second marriage declaration replaces currentTrumpSuit with the new suit', () => {
    const round = makeTrickPlayRound();
    const clubK = findCardId(round.deck, 'K', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    const heartK = findCardId(round.deck, 'K', '♥');
    const heartQ = findCardId(round.deck, 'Q', '♥');
    setHand(round, 0, [clubK, clubQ, heartK, heartQ]);

    round.trickNumber = 2;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.declareMarriage(0, clubK);
    assert.equal(round.currentTrumpSuit, '♣');

    round.trickNumber = 3;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.declareMarriage(0, heartK);
    assert.equal(round.currentTrumpSuit, '♥');
  });

  it('most-recent declaration wins for trump: second suit supersedes first', () => {
    const round = makeTrickPlayRound();
    const spadeK = findCardId(round.deck, 'K', '♠');
    const spadeQ = findCardId(round.deck, 'Q', '♠');
    const diamK  = findCardId(round.deck, 'K', '♦');
    const diamQ  = findCardId(round.deck, 'Q', '♦');
    setHand(round, 0, [spadeK, spadeQ, diamK, diamQ]);

    round.trickNumber = 2;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.declareMarriage(0, spadeK);

    round.trickNumber = 4;
    round.currentTrick = [];
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.declareMarriage(0, diamK);

    // ♦ is the latest trump; ♠ is no longer trump
    assert.equal(round.currentTrumpSuit, '♦');
    assert.notEqual(round.currentTrumpSuit, '♠');
  });
});
