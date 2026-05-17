'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');
const RoundActionHandler = require('../src/controllers/RoundActionHandler');

function makeSetup() {
  const pids = ['p0', 'p1', 'p2'];
  const sent = { p0: [], p1: [], p2: [] };
  const game = {
    id: 'g1',
    players: new Set(pids),
    round: null,
  };
  const store = {
    players: new Map([
      ['p0', { nickname: 'Dealer', gameId: 'g1' }],
      ['p1', { nickname: 'P1', gameId: 'g1' }],
      ['p2', { nickname: 'P2', gameId: 'g1' }],
    ]),
    games: new Map([['g1', game]]),
    sendToPlayer(pid, msg) {
      if (sent[pid]) {sent[pid].push(msg);}
    },
  };
  const round = new Round({ game, store });
  round.start();
  round.advanceFromDealingToBidding();
  game.round = round;
  const handler = new RoundActionHandler({ store });
  return { handler, store, sent, round };
}

describe('RoundActionHandler.handleRequestSnapshot', () => {
  it('sends a round_state_snapshot to the requesting player only', () => {
    const { handler, sent } = makeSetup();

    handler.handleRequestSnapshot('p1');

    const p1Snapshots = sent.p1.filter((m) => m.type === 'round_state_snapshot');
    assert.equal(p1Snapshots.length, 1, 'one snapshot sent to requester');
    assert.equal(sent.p0.length, 0, 'no message sent to other players');
    assert.equal(sent.p2.length, 0, 'no message sent to other players');
  });

  it('snapshot contains the requester\'s authoritative hand and seat layout', () => {
    const { handler, sent, round } = makeSetup();

    handler.handleRequestSnapshot('p1');
    const snap = sent.p1.find((m) => m.type === 'round_state_snapshot');

    assert.ok(Array.isArray(snap.myHand), 'snapshot has myHand');
    assert.equal(snap.myHand.length, round.hands[1].length, 'myHand matches server-side hand size');
    assert.ok(snap.seats, 'snapshot has seats');
    assert.equal(snap.seats.self, 1, 'self seat is the requester\'s');
  });

  it('is a no-op (no rejection toast) when caller is not in a round', () => {
    const sent = { lone: [] };
    const store = {
      players: new Map([['lone', { nickname: 'Lone', gameId: null }]]),
      games: new Map(),
      sendToPlayer(pid, msg) { if (sent[pid]) {sent[pid].push(msg);} },
    };
    const handler = new RoundActionHandler({ store });

    handler.handleRequestSnapshot('lone');

    assert.equal(sent.lone.length, 0, 'silent no-op when caller has no round');
  });

  it('is rate-limited: second call within 250 ms produces no second snapshot', () => {
    const { handler, sent } = makeSetup();

    handler.handleRequestSnapshot('p1');
    handler.handleRequestSnapshot('p1');

    const p1Snapshots = sent.p1.filter((m) => m.type === 'round_state_snapshot');
    assert.equal(p1Snapshots.length, 1, 'rate-limited second call is dropped');
  });
});
