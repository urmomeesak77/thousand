'use strict';

// US2 regression lock (FR-006, SC-004): the shipped 3-player game must stay
// byte-for-byte behaviorally identical after the player-count generalization —
// 24-card deck, 3-card talon, 2 exchange passes, 3-card tricks, no 7/8, and the
// 9→A trick-winner order preserved.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');
const { RANK_ORDER } = require('../src/services/Scoring');

function makeRound() {
  const pids = ['p0', 'p1', 'p2'];
  const game = { players: new Set(pids) }; // no requiredPlayers → defaults to 3
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

describe('3-player regression — deck, talon, deal (FR-006)', () => {
  it('deals a 24-card deck with no 7s or 8s, 7 cards per seat, 3-card talon', () => { // per FR-006
    const round = makeRound();
    assert.equal(round.playerCount, 3);
    assert.equal(round.deck.length, 24);
    assert.equal(round.deck.filter((c) => c.rank === '7' || c.rank === '8').length, 0);
    assert.equal(round.hands[0].length, 7);
    assert.equal(round.hands[1].length, 7);
    assert.equal(round.hands[2].length, 7);
    assert.equal(round.talon.length, 3);
  });
});

describe('3-player regression — exactly two exchange passes & 3-card tricks (FR-006)', () => {
  it('declarer holds 10 after pickup, transitions after exactly 2 passes, tricks are 3 wide', () => { // per FR-006
    const round = makeRound();
    round.advanceFromDealingToBidding();
    round.submitBid(1, 100);
    round.submitPass(2);
    round.submitPass(0); // declarer = seat 1

    assert.equal(round.hands[1].length, 10, 'declarer holds 7 + 3 talon = 10');

    round.startGame(1);
    round.submitExchangePass(1, round.hands[1][0], 0);
    const second = round.submitExchangePass(1, round.hands[1][0], 2);
    assert.equal(second.transitionedToTrickPlay, true, 'transitions after exactly 2 passes');
    for (const s of [0, 1, 2]) {
      assert.equal(round.hands[s].length, 8, `seat ${s} holds 8`);
    }

    // A random deal can leave one seat holding all four 9s, which opens the
    // four-nines ack-gate at the trick-play transition and would block the
    // declarer's lead. Close it — this test exercises trick width, not the bonus.
    if (round.fourNinesAckPending) {
      for (const s of [0, 1, 2]) {
        round.recordFourNinesAck(s);
      }
    }

    // One trick resolves at 3 cards. Give each seat a distinct suit so no follow-suit
    // constraint applies and every play is trivially legal.
    const idOf = (rank, suit) => round.deck.find((c) => c.rank === rank && c.suit === suit).id;
    round.hands[1] = [idOf('A', '♣')];
    round.hands[2] = [idOf('K', '♠')];
    round.hands[0] = [idOf('Q', '♥')];

    round.playCard(1, round.hands[1][0]);
    assert.equal(round.currentTrick.length, 1);
    round.playCard(2, round.hands[2][0]);
    assert.equal(round.currentTrick.length, 2);
    const resolved = round.playCard(0, round.hands[0][0]);
    assert.equal(resolved.trickResolved, true, 'trick resolves at 3 cards');
    assert.equal(round.currentTrick.length, 0);
  });
});

describe('3-player regression — trick-winner rank order preserved (FR-006)', () => {
  it('Ten outranks K and Q, Ace is highest, across the 9→A range', () => { // per FR-006
    assert.ok(RANK_ORDER['9'] < RANK_ORDER['J']);
    assert.ok(RANK_ORDER['J'] < RANK_ORDER['Q']);
    assert.ok(RANK_ORDER['Q'] < RANK_ORDER['K']);
    assert.ok(RANK_ORDER['K'] < RANK_ORDER['10'], 'Ten outranks King');
    assert.ok(RANK_ORDER['10'] < RANK_ORDER['A'], 'Ace is highest');
  });
});
