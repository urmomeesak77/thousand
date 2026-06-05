'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const RoundActionHandler = require('../src/controllers/RoundActionHandler');

// Start a 3-player game, disable the handler rate limiter, and drive the auction
// so a known seat becomes the declarer at 100. Returns the pieces needed to then
// drive the sell phase.
function declaredGame() {
  const store = new ThousandStore();
  const pids = ['p0', 'p1', 'p2'];
  pids.forEach((pid, i) => {
    store.players.set(pid, { id: pid, nickname: ['A', 'B', 'C'][i], gameId: 'g' });
  });
  store.games.set('g', {
    id: 'g', players: new Set(pids), hostId: 'p0', type: 'public',
    status: 'waiting', requiredPlayers: 3, createdAt: Date.now(),
    inviteCode: null, round: null, waitingRoomTimer: null,
  });
  store.startRound('g');
  const handler = new RoundActionHandler({ store });
  handler._rateLimiter.isAllowed = () => true;
  const round = store.games.get('g').round;
  const pidAt = (seat) => round.seatOrder[seat];

  // First two seats pass; the third is the forced last bidder and wins at 100.
  handler.handlePass(pidAt(round.currentTurnSeat));
  handler.handlePass(pidAt(round.currentTurnSeat));
  handler.handleBid(pidAt(round.currentTurnSeat), 100);

  const session = store.games.get('g').session;
  return { store, handler, round, session, pidAt, declarerSeat: round.declarerSeat };
}

function kindsOf(session) {
  return session.actionHistory.toView().map((e) => e.kind);
}

describe('sell-phase history recording', () => {
  it('records sell-start, opponent bid, and a sold resolution (in order)', () => {
    const { handler, round, session, pidAt, declarerSeat } = declaredGame();
    const declarerPid = pidAt(declarerSeat);

    // Declarer puts the contract up for sale and exposes 3 cards.
    handler.handleSellStart(declarerPid);
    const exposeIds = round.hands[declarerSeat].slice(0, round.playerCount);
    handler.handleSellSelect(declarerPid, exposeIds);

    // First opponent bids 110; second opponent passes → contract sold to the bidder.
    const firstOpp = round.currentTurnSeat;
    handler.handleSellBid(pidAt(firstOpp), 110);
    handler.handleSellPass(pidAt(round.currentTurnSeat));

    const view = session.actionHistory.toView();
    const sellStart = view.find((e) => e.kind === 'sell-start');
    const sellBid = view.find((e) => e.kind === 'sell-bid');
    const sellSold = view.find((e) => e.kind === 'sell-sold');

    assert.ok(sellStart, 'a sell-start entry was recorded');
    assert.equal(sellStart.seat, declarerSeat);
    assert.ok(sellBid, 'a sell-bid entry was recorded');
    assert.deepEqual({ seat: sellBid.seat, amount: sellBid.data.amount }, { seat: firstOpp, amount: 110 });
    assert.ok(sellSold, 'a sell-sold entry was recorded');
    assert.deepEqual({ seat: sellSold.seat, amount: sellSold.data.amount }, { seat: firstOpp, amount: 110 });

    // Resolution order: start before bid before sold.
    assert.ok(sellStart.seq < sellBid.seq && sellBid.seq < sellSold.seq, 'entries are in resolution order');
  });

  it('records a sell-returned resolution when both opponents pass without buying', () => {
    const { handler, round, session, pidAt, declarerSeat } = declaredGame();
    const declarerPid = pidAt(declarerSeat);

    handler.handleSellStart(declarerPid);
    handler.handleSellSelect(declarerPid, round.hands[declarerSeat].slice(0, round.playerCount));

    // Both opponents pass with no bid → contract returns to the declarer.
    handler.handleSellPass(pidAt(round.currentTurnSeat));
    handler.handleSellPass(pidAt(round.currentTurnSeat));

    const view = session.actionHistory.toView();
    const passes = view.filter((e) => e.kind === 'sell-pass');
    const returned = view.find((e) => e.kind === 'sell-returned');

    assert.equal(passes.length, 2, 'both opponent passes are recorded');
    assert.ok(returned, 'a sell-returned entry was recorded');
    assert.equal(returned.seat, declarerSeat);
    assert.ok(kindsOf(session).indexOf('sell-returned') === view.length - 1, 'sell-returned is the last entry');
  });

  it('the sell-start entry is in the snapshot broadcast for that action (no one-snapshot lag)', () => {
    const { store, handler, round, pidAt, declarerSeat } = declaredGame();
    const declarerPid = pidAt(declarerSeat);
    handler.handleSellStart(declarerPid);

    // Capture the exposure broadcast — its snapshot must already carry sell-start.
    const sent = [];
    const original = store.sendToPlayer.bind(store);
    store.sendToPlayer = (pid, msg) => { sent.push(msg); return original(pid, msg); };
    handler.handleSellSelect(declarerPid, round.hands[declarerSeat].slice(0, round.playerCount));
    store.sendToPlayer = original;

    const snapshots = sent.map((m) => m.gameStatus).filter((gs) => gs && Array.isArray(gs.actionHistory));
    assert.ok(snapshots.length > 0, 'the exposure broadcast carried a snapshot');
    for (const gs of snapshots) {
      assert.ok(
        gs.actionHistory.some((e) => e.kind === 'sell-start' && e.seat === declarerSeat),
        'sell-start must be present in the snapshot for the exposing action',
      );
    }
  });
});
