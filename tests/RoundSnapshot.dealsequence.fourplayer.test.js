'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');
const RoundSnapshot = require('../src/services/RoundSnapshot');

function makeRound(requiredPlayers) {
  const pids = ['p0', 'p1', 'p2', 'p3'].slice(0, requiredPlayers);
  const game = { players: new Set(pids), requiredPlayers };
  const store = {
    players: new Map(pids.map((id, i) => [id, { nickname: `N${i}` }])),
  };
  const round = new Round({ game, store });
  round.start();
  return round;
}

function revealedIds(round, seat) {
  return RoundSnapshot.buildDealSequenceFor(round, seat)
    .filter((step) => step.rank && step.suit)
    .map((step) => step.id)
    .sort((a, b) => a - b);
}

// per FR-009, FR-018 — the per-viewer deal sequence must reveal each seat's OWN
// dealt cards (rank/suit) and nothing else, so the client HandView seeds exactly
// the server-authoritative hand. A mismatch desyncs the client: the server's
// legalCardIds can reference a card the client never received, freezing the hand.
describe('buildDealSequenceFor — reveals exactly the seat hand (FR-009)', () => {
  it('4-player: every seat is shown precisely its 7 dealt cards', () => { // per FR-009
    const round = makeRound(4);
    for (const seat of [0, 1, 2, 3]) {
      const hand = [...round.hands[seat]].sort((a, b) => a - b);
      assert.equal(hand.length, 7, `seat ${seat} dealt 7`);
      assert.deepEqual(revealedIds(round, seat), hand,
        `seat ${seat} deal sequence must reveal exactly its hand`);
    }
  });

  it('3-player: every seat is shown precisely its 7 dealt cards (unchanged)', () => { // per FR-009
    const round = makeRound(3);
    for (const seat of [0, 1, 2]) {
      const hand = [...round.hands[seat]].sort((a, b) => a - b);
      assert.deepEqual(revealedIds(round, seat), hand,
        `seat ${seat} deal sequence must reveal exactly its hand`);
    }
  });
});
