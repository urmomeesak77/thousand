'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const ConnectionManager = require('../src/services/ConnectionManager');
const { FOUR_NINES_BONUS } = require('../src/services/GameRules');

function makeWs() {
  const sent = [];
  const handlers = {};
  const ws = {
    readyState: 1,
    isAlive: true,
    _socket: { remoteAddress: '127.0.0.1' },
    send: (d) => sent.push(JSON.parse(d)),
    close: (code) => { ws._closedCode = code; },
    on: (event, handler) => { handlers[event] = handler; },
    ping: () => {},
    _sent: sent,
    _handlers: handlers,
  };
  return ws;
}

function sendMsg(ws, data) {
  ws._handlers.message?.(Buffer.from(JSON.stringify(data)));
}

function setupInProgressGame() {
  const store = new ThousandStore();
  const cm = new ConnectionManager(store);
  const ws = [makeWs(), makeWs(), makeWs()];
  ws.forEach((w) => { cm.handleConnection(w); sendMsg(w, { type: 'hello' }); });
  const pids = ws.map((w) => w._sent.find((m) => m.type === 'connected').playerId);
  pids.forEach((pid, i) => { store.players.get(pid).nickname = ['Alice', 'Bob', 'Charlie'][i]; });
  const gameId = 'test-game';
  store.games.set(gameId, {
    id: gameId, players: new Set(pids), hostId: pids[0], type: 'public',
    status: 'waiting', requiredPlayers: 3, createdAt: Date.now(), inviteCode: null,
    round: null, waitingRoomTimer: null,
  });
  pids.forEach((pid) => { store.players.get(pid).gameId = gameId; });
  ws.forEach((w) => { w._sent.length = 0; });
  store.startRound(gameId);
  return { store, cm, ws, pids, gameId };
}

// Drives to card-exchange with seat 0 declarer, hands arranged so seat 0 ends
// the exchange holding all four 9s.
function setupFourNinesExchange() {
  const ctx = setupInProgressGame();
  const game = ctx.store.games.get(ctx.gameId);
  const round = game.round;
  round.declarerSeat = 0;
  round.currentHighBid = 100;
  round.phase = 'card-exchange';
  round.currentTurnSeat = 0;
  round.exchangePassesCommitted = 0;
  round._usedExchangeDestSeats = new Set();
  round.talon = [];

  const nineIds = round.deck.filter((c) => c.rank === '9').map((c) => c.id);
  const filler = round.deck.filter((c) => c.rank !== '9').map((c) => c.id);
  round.hands[0] = [...nineIds, filler[0], filler[1]];
  round.hands[1] = [filler[2], filler[3], filler[4], filler[5], filler[6], filler[7], filler[8]];
  round.hands[2] = [filler[9], filler[10], filler[11], filler[12], filler[13], filler[14], filler[15]];

  ctx.ws.forEach((w) => { w._sent.length = 0; });
  return { ...ctx, game, round, fillerToPass: [filler[0], filler[1]] };
}

describe('round-messages.fournines — exchange→award→ack→lead (FR-002, FR-003, FR-004)', () => {
  it('the 2nd exchange_pass broadcasts four_nines_awarded with post-bonus cumulativeScores, and withholds trick_play_started', () => { // per FR-002
    const { ws, round, game, fillerToPass } = setupFourNinesExchange();

    sendMsg(ws[0], { type: 'exchange_pass', cardId: fillerToPass[0], toSeat: 1 });
    ws.forEach((w) => { w._sent.length = 0; });
    sendMsg(ws[0], { type: 'exchange_pass', cardId: fillerToPass[1], toSeat: 2 });

    for (const w of ws) {
      const award = w._sent.find((m) => m.type === 'four_nines_awarded');
      assert.ok(award, 'every player must receive four_nines_awarded');
      assert.equal(award.seat, 0);
      assert.equal(award.amount, FOUR_NINES_BONUS);
      assert.equal(award.cumulativeScores[0], FOUR_NINES_BONUS, 'cumulative reflects the banked +100');
    }
    // Bonus banked on the session.
    assert.equal(game.session.cumulativeScores[0], FOUR_NINES_BONUS);
    // trick_play_started must be withheld until the gate closes.
    for (const w of ws) {
      assert.equal(w._sent.find((m) => m.type === 'trick_play_started'), undefined,
        'trick_play_started must be withheld while the gate is open');
    }
  });

  it('three acknowledge_four_nines messages unlock the held-back trick_play_started', () => { // per FR-003
    const { ws, fillerToPass } = setupFourNinesExchange();
    sendMsg(ws[0], { type: 'exchange_pass', cardId: fillerToPass[0], toSeat: 1 });
    sendMsg(ws[0], { type: 'exchange_pass', cardId: fillerToPass[1], toSeat: 2 });
    ws.forEach((w) => { w._sent.length = 0; });

    sendMsg(ws[0], { type: 'acknowledge_four_nines' });
    sendMsg(ws[1], { type: 'acknowledge_four_nines' });
    // Still withheld with only 2 acks.
    for (const w of ws) {
      assert.equal(w._sent.find((m) => m.type === 'trick_play_started'), undefined);
    }
    sendMsg(ws[2], { type: 'acknowledge_four_nines' });
    for (const w of ws) {
      assert.ok(w._sent.find((m) => m.type === 'trick_play_started'),
        'trick_play_started must broadcast once all three acknowledge');
    }
  });

  it('rejects the first lead while the gate is open, accepts it after acks (R-103)', () => { // per FR-004
    const { ws, round, fillerToPass } = setupFourNinesExchange();
    sendMsg(ws[0], { type: 'exchange_pass', cardId: fillerToPass[0], toSeat: 1 });
    sendMsg(ws[0], { type: 'exchange_pass', cardId: fillerToPass[1], toSeat: 2 });
    ws.forEach((w) => { w._sent.length = 0; });

    // Premature lead from the declarer is rejected to the sender only.
    sendMsg(ws[0], { type: 'play_card', cardId: round.hands[0][0] });
    const rejection = ws[0]._sent.find((m) => m.type === 'action_rejected');
    assert.ok(rejection, 'premature lead must be rejected');
    assert.match(rejection.reason, /acknowledge the four-nines bonus/i);

    // After all three ack, the lead is accepted.
    sendMsg(ws[0], { type: 'acknowledge_four_nines' });
    sendMsg(ws[1], { type: 'acknowledge_four_nines' });
    sendMsg(ws[2], { type: 'acknowledge_four_nines' });
    ws.forEach((w) => { w._sent.length = 0; });
    sendMsg(ws[0], { type: 'play_card', cardId: round.hands[0][0] });
    for (const w of ws) {
      assert.ok(w._sent.find((m) => m.type === 'card_played'),
        'the lead must be accepted and broadcast once the gate closes');
    }
  });
});
