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
      if (sent[pid]) sent[pid].push(msg);
    },
  };

  const round = new Round({ game, store });
  round.start();
  round.advanceFromDealingToBidding(); // currentTurnSeat = 1 (p1)
  game.round = round;

  const handler = new RoundActionHandler({ store });
  return { handler, store, sent, round };
}

function totalSent(sent) {
  return sent.p0.length + sent.p1.length + sent.p2.length;
}

describe('RoundActionHandler rate limiting — continue_to_next_round (FR-027)', () => {
  it('second handleContinueToNextRound within 250 ms from same player is silently dropped', () => {
    const { handler, sent } = makeSetup();

    // First call: player not in round-summary phase, so it emits action_rejected
    handler.handleContinueToNextRound('p1');
    const afterFirst = totalSent(sent);
    assert.ok(afterFirst > 0, 'first call must produce action_rejected');

    // Second call within same window: rate-limited, must be completely silent
    handler.handleContinueToNextRound('p1');
    assert.equal(totalSent(sent), afterFirst, 'rate-limited second call must not emit any message');
  });

  it('rate-limited continue_to_next_round does not emit action_rejected to sender', () => {
    const { handler, sent } = makeSetup();

    handler.handleContinueToNextRound('p1'); // first call — consumes rate-limit slot
    sent.p0.length = 0;
    sent.p1.length = 0;
    sent.p2.length = 0;

    handler.handleContinueToNextRound('p1'); // rate-limited
    const rejections = sent.p1.filter((m) => m.type === 'action_rejected');
    assert.equal(rejections.length, 0, 'rate-limited drop must not send action_rejected');
  });
});

describe('RoundActionHandler rate limiting — FR-030 (250 ms / 1 req window)', () => {
  it('second handleBid within 250 ms from the same player is silently dropped (no broadcast, no action_rejected)', () => {
    const { handler, sent } = makeSetup();

    handler.handleBid('p1', 100); // first call — accepted; broadcasts bid_accepted + phase_changed to all 3
    const afterFirst = totalSent(sent);
    assert.ok(afterFirst > 0, 'first bid must produce broadcasts');

    handler.handleBid('p1', 105); // second call within the same ms — rate limited, silently dropped
    assert.equal(totalSent(sent), afterFirst, 'no additional messages after rate-limited bid');
  });

  it('second handlePass within 250 ms from the same player is silently dropped', () => {
    const { handler, sent } = makeSetup();

    handler.handlePass('p1'); // first pass — accepted
    const afterFirst = totalSent(sent);
    assert.ok(afterFirst > 0, 'first pass must produce broadcasts');

    handler.handlePass('p1'); // second pass within same window — dropped
    assert.equal(totalSent(sent), afterFirst, 'no additional messages after rate-limited pass');
  });

  it('a second message from a DIFFERENT player is not rate-limited', () => {
    const { handler, sent } = makeSetup();

    handler.handleBid('p1', 100); // p1 bids; turn advances to p2
    const afterP1Bid = totalSent(sent);

    handler.handleBid('p2', 105); // p2 bids — different player, own rate-limit bucket
    assert.ok(totalSent(sent) > afterP1Bid, 'p2 bid must produce additional messages');
  });

  it('rate-limited drop does not emit action_rejected to the sender', () => {
    const { handler, sent } = makeSetup();

    handler.handleBid('p1', 100); // first call consumed the rate-limit slot
    sent.p0.length = 0;
    sent.p1.length = 0;
    sent.p2.length = 0;

    handler.handleBid('p1', 105); // rate-limited — must be completely silent
    const rejections = sent.p1.filter((m) => m.type === 'action_rejected');
    assert.equal(rejections.length, 0, 'rate-limited drop must not send action_rejected');
  });
});
