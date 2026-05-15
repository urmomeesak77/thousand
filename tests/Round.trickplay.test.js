'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');

// Build a Round in trick-play phase with a controlled deck so card identities
// are deterministic. The deck layout is: suits=['♣','♠','♥','♦'], ranks=['9','10','J','Q','K','A']
// → card id = suitIndex*6 + rankIndex
// ♣9=0  ♣10=1  ♣J=2  ♣Q=3  ♣K=4  ♣A=5
// ♠9=6  ♠10=7  ♠J=8  ♠Q=9  ♠K=10 ♠A=11
// ♥9=12 ♥10=13 ♥J=14 ♥Q=15 ♥K=16 ♥A=17
// ♦9=18 ♦10=19 ♦J=20 ♦Q=21 ♦K=22 ♦A=23
//
// However the real deck is shuffled. We control identity by using round.deck directly
// after start() to look up card ids by rank+suit.

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
  if (!card) {throw new Error(`Card ${rank}${suit} not found in deck`);}
  return card.id;
}

// Sets up a Round in trick-play phase. Hands are populated by assigning specific
// card ids directly to hands so follow-suit scenarios are deterministic.
function makeTrickPlayRound() {
  const round = makeRound();
  round.advanceFromDealingToBidding();
  round.submitPass(1);
  round.submitPass(2); // declarerSeat = 0

  // Force trick-play state
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
// FR-006 — Leading player can play any card
// ---------------------------------------------------------------------------

describe('Round.trickplay — leading player may play any card (FR-006)', () => {
  it('declarer (leader) can play any card from hand to start a trick', () => {
    const round = makeTrickPlayRound();
    const cardId = round.hands[0][0];
    const r = round.playCard(0, cardId);
    assert.equal(r.rejected, false);
  });

  it('playing a card removes it from the leader\'s hand', () => {
    const round = makeTrickPlayRound();
    const cardId = round.hands[0][0];
    round.playCard(0, cardId);
    assert.ok(!round.hands[0].includes(cardId));
  });
});

// ---------------------------------------------------------------------------
// FR-007 — Follow-suit enforcement
// ---------------------------------------------------------------------------

describe('Round.trickplay — follow-suit enforcement (FR-007)', () => {
  it('following player who holds led suit MUST follow suit — off-suit card is rejected', () => {
    const round = makeTrickPlayRound();
    // Give seat 0 a ♣ card; seat 1 holds both ♣ and ♠ cards
    const clubId = findCardId(round.deck, '9', '♣');
    const anotherClubId = findCardId(round.deck, '10', '♣');
    const spadeId = findCardId(round.deck, '9', '♠');
    setHand(round, 0, [clubId]);
    setHand(round, 1, [anotherClubId, spadeId]);
    setHand(round, 2, [findCardId(round.deck, 'J', '♣')]);

    round.playCard(0, clubId); // seat 0 leads ♣; turn → seat 1

    // seat 1 holds a ♣ but tries to play ♠ — must be rejected
    const r = round.playCard(1, spadeId);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });

  it('following player who holds led suit CAN play any card of that suit', () => {
    const round = makeTrickPlayRound();
    const clubId = findCardId(round.deck, '9', '♣');
    const anotherClubId = findCardId(round.deck, '10', '♣');
    const spadeId = findCardId(round.deck, '9', '♠');
    setHand(round, 0, [clubId]);
    setHand(round, 1, [anotherClubId, spadeId]);
    setHand(round, 2, [findCardId(round.deck, 'J', '♣')]);

    round.playCard(0, clubId);

    // seat 1 plays their ♣ — accepted
    const r = round.playCard(1, anotherClubId);
    assert.equal(r.rejected, false);
  });

  it('following player who holds NO card of led suit may play any card', () => {
    const round = makeTrickPlayRound();
    const clubId = findCardId(round.deck, '9', '♣');
    const spadeId = findCardId(round.deck, '9', '♠');
    const heartId = findCardId(round.deck, '9', '♥');
    setHand(round, 0, [clubId]);
    setHand(round, 1, [spadeId, heartId]); // no ♣ in hand
    setHand(round, 2, [findCardId(round.deck, 'J', '♣')]);

    round.playCard(0, clubId);

    // seat 1 plays ♠ even though ♣ was led — no ♣ in hand, so it's fine
    const r = round.playCard(1, spadeId);
    assert.equal(r.rejected, false);
  });
});

// ---------------------------------------------------------------------------
// FR-008 — Trick-winner determination (R-003 table test)
// ---------------------------------------------------------------------------

describe('Round.trickplay — trick winner determination (FR-008 / R-003)', () => {
  // Ten outranks King (same suit, no trump)
  it('Ten beats King of same suit (no trump)', () => {
    const round = makeTrickPlayRound();
    const clubK = findCardId(round.deck, 'K', '♣');
    const club10 = findCardId(round.deck, '10', '♣');
    const club9 = findCardId(round.deck, '9', '♣');
    setHand(round, 0, [clubK]);
    setHand(round, 1, [club10]);
    setHand(round, 2, [club9]);
    round.currentTrumpSuit = null;

    round.playCard(0, clubK);   // seat 0 leads K♣
    round.playCard(1, club10);  // seat 1 plays 10♣
    round.playCard(2, club9);   // seat 2 plays 9♣

    // 10♣ beats K♣ and 9♣ → seat 1 wins
    assert.equal(round.collectedTricks[1].length, 3, 'seat 1 should have won 3 cards');
    assert.equal(round.collectedTricks[0].length, 0);
    assert.equal(round.collectedTricks[2].length, 0);
  });

  // Ten outranks Queen (same suit, no trump)
  it('Ten beats Queen of same suit (no trump)', () => {
    const round = makeTrickPlayRound();
    const clubQ = findCardId(round.deck, 'Q', '♣');
    const club10 = findCardId(round.deck, '10', '♣');
    const club9 = findCardId(round.deck, '9', '♣');
    setHand(round, 0, [clubQ]);
    setHand(round, 1, [club10]);
    setHand(round, 2, [club9]);
    round.currentTrumpSuit = null;

    round.playCard(0, clubQ);   // seat 0 leads Q♣
    round.playCard(1, club10);  // seat 1 plays 10♣
    round.playCard(2, club9);   // seat 2 plays 9♣

    // 10♣ beats Q♣ → seat 1 wins
    assert.equal(round.collectedTricks[1].length, 3);
    assert.equal(round.collectedTricks[0].length, 0);
  });

  // Ace outranks Ten (same suit, no trump)
  it('Ace beats Ten of same suit (no trump)', () => {
    const round = makeTrickPlayRound();
    const clubA = findCardId(round.deck, 'A', '♣');
    const club10 = findCardId(round.deck, '10', '♣');
    const club9 = findCardId(round.deck, '9', '♣');
    setHand(round, 0, [clubA]);
    setHand(round, 1, [club10]);
    setHand(round, 2, [club9]);
    round.currentTrumpSuit = null;

    round.playCard(0, clubA);   // seat 0 leads A♣
    round.playCard(1, club10);  // seat 1 plays 10♣
    round.playCard(2, club9);   // seat 2 plays 9♣

    // A♣ beats 10♣ → seat 0 wins
    assert.equal(round.collectedTricks[0].length, 3);
    assert.equal(round.collectedTricks[1].length, 0);
  });

  it('highest card of led suit wins when no trump played', () => {
    const round = makeTrickPlayRound();
    const clubJ = findCardId(round.deck, 'J', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    const club10 = findCardId(round.deck, '10', '♣');
    setHand(round, 0, [clubJ]);
    setHand(round, 1, [clubQ]);
    setHand(round, 2, [club10]);
    round.currentTrumpSuit = null;

    round.playCard(0, clubJ);   // seat 0 leads J♣
    round.playCard(1, clubQ);   // seat 1 plays Q♣
    round.playCard(2, club10);  // seat 2 plays 10♣

    // 10♣ beats Q♣ and J♣ → seat 2 wins
    assert.equal(round.collectedTricks[2].length, 3);
  });

  it('off-suit non-trump cards do not beat led suit', () => {
    const round = makeTrickPlayRound();
    const clubA = findCardId(round.deck, 'A', '♣');
    const spadeA = findCardId(round.deck, 'A', '♠');
    const club9 = findCardId(round.deck, '9', '♣');
    setHand(round, 0, [clubA]);
    setHand(round, 1, [spadeA]); // no ♣ → can play ♠
    setHand(round, 2, [club9]);
    round.currentTrumpSuit = null;

    round.playCard(0, clubA);   // seat 0 leads A♣
    round.playCard(1, spadeA);  // seat 1 plays A♠ (off-suit, no trump)
    round.playCard(2, club9);   // seat 2 plays 9♣

    // A♣ leads and no trump → seat 0 wins (♠A is off-suit and cannot beat ♣A)
    assert.equal(round.collectedTricks[0].length, 3);
  });
});

// ---------------------------------------------------------------------------
// FR-008 — Trick resolution mechanics
// ---------------------------------------------------------------------------

describe('Round.trickplay — trick resolution (FR-008)', () => {
  it('after all 3 cards played, currentTrick is cleared', () => {
    const round = makeTrickPlayRound();
    // Give seat 1 and 2 off-suit so no follow-suit constraint blocks us in this test
    // (Just need the trick to resolve — use all same suit if possible)
    const club9 = findCardId(round.deck, '9', '♣');
    const clubJ = findCardId(round.deck, 'J', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    setHand(round, 0, [club9]);
    setHand(round, 1, [clubJ]);
    setHand(round, 2, [clubQ]);
    round.currentTrumpSuit = null;

    round.playCard(0, club9);
    round.playCard(1, clubJ);
    round.playCard(2, clubQ);

    assert.equal(round.currentTrick.length, 0, 'currentTrick must be empty after resolution');
  });

  it('winner receives all 3 card ids in collectedTricks', () => {
    const round = makeTrickPlayRound();
    const club9 = findCardId(round.deck, '9', '♣');
    const clubJ = findCardId(round.deck, 'J', '♣');
    const clubA = findCardId(round.deck, 'A', '♣');
    setHand(round, 0, [club9]);
    setHand(round, 1, [clubJ]);
    setHand(round, 2, [clubA]);
    round.currentTrumpSuit = null;

    round.playCard(0, club9);
    round.playCard(1, clubJ);
    round.playCard(2, clubA);

    // A♣ is highest → seat 2 wins
    const collected = round.collectedTricks[2];
    assert.equal(collected.length, 3);
    assert.ok(collected.includes(club9));
    assert.ok(collected.includes(clubJ));
    assert.ok(collected.includes(clubA));
  });

  it('trickNumber increments after each resolved trick', () => {
    const round = makeTrickPlayRound();
    const club9 = findCardId(round.deck, '9', '♣');
    const clubJ = findCardId(round.deck, 'J', '♣');
    const clubQ = findCardId(round.deck, 'Q', '♣');
    setHand(round, 0, [club9, findCardId(round.deck, '9', '♠')]);
    setHand(round, 1, [clubJ, findCardId(round.deck, 'J', '♠')]);
    setHand(round, 2, [clubQ, findCardId(round.deck, 'Q', '♠')]);
    round.currentTrumpSuit = null;

    round.playCard(0, club9);
    round.playCard(1, clubJ);
    round.playCard(2, clubQ);

    assert.equal(round.trickNumber, 2);
  });

  it('winner of a trick becomes the next leader (currentTrickLeaderSeat)', () => {
    const round = makeTrickPlayRound();
    const club9 = findCardId(round.deck, '9', '♣');
    const clubJ = findCardId(round.deck, 'J', '♣');
    const clubA = findCardId(round.deck, 'A', '♣');
    setHand(round, 0, [club9]);
    setHand(round, 1, [clubJ]);
    setHand(round, 2, [clubA]);
    round.currentTrumpSuit = null;

    round.playCard(0, club9);
    round.playCard(1, clubJ);
    round.playCard(2, clubA);

    // seat 2 wins → becomes new leader
    assert.equal(round.currentTrickLeaderSeat, 2);
    assert.equal(round.currentTurnSeat, 2);
  });
});

// ---------------------------------------------------------------------------
// FR-008 — Phase transition after last trick
// ---------------------------------------------------------------------------

describe('Round.trickplay — phase transition after trick 8 (FR-008)', () => {
  it('after trick 8 resolves phase becomes "round-summary"', () => {
    const round = makeTrickPlayRound();
    round.currentTrumpSuit = null;

    // We need to play 8 tricks. Use all 24 cards across 8 tricks of 3 cards each.
    // Assign 8 cards per seat and play them trick by trick.
    // Use all ♣ for seat 0, all ♠ for seat 1, all ♥ for seat 2 so
    // follow-suit always allows play (seat 0 leads ♣ → seat 1 and 2 have no ♣).
    const suit0Cards = ['9', '10', 'J', 'Q', 'K', 'A'].map(r => findCardId(round.deck, r, '♣'));
    const suit1Cards = ['9', '10', 'J', 'Q', 'K', 'A'].map(r => findCardId(round.deck, r, '♠'));
    const suit2Cards = ['9', '10', 'J', 'Q', 'K', 'A'].map(r => findCardId(round.deck, r, '♥'));
    // 6 cards per seat = 6 tricks. We need 8 total and 8 cards each (24 total / 3 players = 8 cards per player).
    // Add ♦ cards to fill up to 8 per seat (need 2 more per seat = 6 ♦ cards total, 2 per seat).
    const diam9  = findCardId(round.deck, '9',  '♦');
    const diam10 = findCardId(round.deck, '10', '♦');
    const diamJ  = findCardId(round.deck, 'J',  '♦');
    const diamQ  = findCardId(round.deck, 'Q',  '♦');
    const diamK  = findCardId(round.deck, 'K',  '♦');
    const diamA  = findCardId(round.deck, 'A',  '♦');

    setHand(round, 0, [...suit0Cards, diam9, diam10]);
    setHand(round, 1, [...suit1Cards, diamJ, diamQ]);
    setHand(round, 2, [...suit2Cards, diamK, diamA]);

    // Play 8 tricks. Seat 0 leads each time with ♣ (first 6) then ♦.
    // Seat 1 and 2 have no ♣ or ♦ (except the assigned ♦ pair), so they can play freely.
    // The leader changes each trick, so we must track currentTrickLeaderSeat.
    // For simplicity, just play the cards in hand order; the leader plays first each trick.

    // Trick 1: seat 0 leads ♣9, seat 1 plays ♠9, seat 2 plays ♥9
    // After resolve, whoever holds the highest card wins and leads next.
    // Rather than tracking leader, manually set currentTurnSeat to follow the leader.
    // Actually, let's just play in order and trust the implementation to set currentTurnSeat.

    function playTrick(leadSeat, c0, c1, c2) {
      const ordered = [leadSeat, (leadSeat + 1) % 3, (leadSeat + 2) % 3];
      const cardMap = { [leadSeat]: c0, [(leadSeat + 1) % 3]: c1, [(leadSeat + 2) % 3]: c2 };
      for (const seat of ordered) {
        round.playCard(seat, cardMap[seat]);
      }
    }

    // Trick 1: seat 0 leads
    playTrick(0, suit0Cards[0], suit1Cards[0], suit2Cards[0]);
    // After trick 1, trickNumber === 2; leader is whoever won

    // For the remaining 7 tricks, we need to know who leads.
    // Let's drive all remaining tricks by checking currentTrickLeaderSeat each time.
    // We'll assign the remaining cards to each seat and track what's left.
    const remaining = {
      0: [...suit0Cards.slice(1), diam9, diam10],
      1: [...suit1Cards.slice(1), diamJ, diamQ],
      2: [...suit2Cards.slice(1), diamK, diamA],
    };

    for (let t = 2; t <= 8; t++) {
      const leader = round.currentTrickLeaderSeat;
      const c0 = remaining[leader].shift();
      const c1 = remaining[(leader + 1) % 3].shift();
      const c2 = remaining[(leader + 2) % 3].shift();
      playTrick(leader, c0, c1, c2);
    }

    assert.equal(round.phase, 'round-summary');
  });
});

// ---------------------------------------------------------------------------
// FR-007 — Out-of-turn play is rejected
// ---------------------------------------------------------------------------

describe('Round.trickplay — out-of-turn play is rejected', () => {
  it('a card played by the wrong seat is rejected', () => {
    const round = makeTrickPlayRound();
    // currentTurnSeat = 0 (declarerSeat); seat 1 tries to play first
    const cardId = round.hands[1][0];
    const r = round.playCard(1, cardId);
    assert.equal(r.rejected, true);
    assert.ok(r.reason);
  });
});
