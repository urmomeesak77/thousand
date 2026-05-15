'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const ConnectionManager = require('../src/services/ConnectionManager');

// ---------------------------------------------------------------------------
// Helpers (same pattern as round-messages.test.js)
// ---------------------------------------------------------------------------

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

// Bootstrap 3 players + a game through the ConnectionManager hello flow,
// then start the round via store.startRound so the game is in-progress.
function setupInProgressGame() {
  const store = new ThousandStore();
  const cm = new ConnectionManager(store);

  const ws = [makeWs(), makeWs(), makeWs()];
  ws.forEach((w) => {
    cm.handleConnection(w);
    sendMsg(w, { type: 'hello' });
  });

  const pids = ws.map((w) => w._sent.find((m) => m.type === 'connected').playerId);
  pids.forEach((pid, i) => {
    store.players.get(pid).nickname = ['Alice', 'Bob', 'Charlie'][i];
  });

  const gameId = 'test-game';
  store.games.set(gameId, {
    id: gameId,
    players: new Set(pids),
    hostId: pids[0],
    type: 'public',
    status: 'waiting',
    requiredPlayers: 3,
    createdAt: Date.now(),
    inviteCode: null,
    round: null,
    waitingRoomTimer: null,
  });
  pids.forEach((pid) => { store.players.get(pid).gameId = gameId; });

  // Clear hello/lobby messages
  ws.forEach((w) => { w._sent.length = 0; });

  store.startRound(gameId);

  return { store, cm, ws, pids, gameId };
}

// Drives round to post-bid-decision with seat 0 (Alice) as declarer at bid 100.
function setupPostBidGame() {
  const { store, cm, ws, pids, gameId } = setupInProgressGame();
  const game = store.games.get(gameId);
  const round = game.round;

  round.passedBidders.add(1);
  round.passedBidders.add(2);
  round.declarerSeat = 0;
  round.currentHighBid = 100;
  round.phase = 'post-bid-decision';
  round.currentTurnSeat = 0;
  const talonIds = [...round.talon];
  for (const id of talonIds) round.hands[0].push(id);
  round.talon = [];

  ws.forEach((w) => { w._sent.length = 0; });
  return { store, cm, ws, pids, gameId };
}

// ---------------------------------------------------------------------------
// T013 — Phase 3 message protocol tests
// ---------------------------------------------------------------------------

// After start_game + card exchange:
// exchange_pass messages must broadcast card_passed to all 3 players
describe('round-messages.005 — exchange_pass broadcasts card_passed', () => {
  it('after start_game, sending exchange_pass broadcasts card_passed to all 3 players', () => {
    // Arrange: Drive round to card-exchange phase via Round direct mutation.
    // start_game deletes the game record; we need to work with round state directly.
    const { store, cm, ws, pids, gameId } = setupPostBidGame();
    const round = store.games.get(gameId).round;

    // Force card-exchange phase (as the implementation will set it)
    round.phase = 'card-exchange';
    round.exchangePassesCommitted = 0;
    round._usedExchangeDestSeats = new Set();
    // Ensure Alice (seat 0) has cards to pass
    assert.ok(round.hands[0].length >= 2, 'declarer must have cards to pass');

    ws.forEach((w) => { w._sent.length = 0; });

    // Alice passes her first card to Bob (seat 1)
    const cardToPass = round.hands[0][0];
    sendMsg(ws[0], { type: 'exchange_pass', cardId: cardToPass, toSeat: 1 });

    // Once implementation is in place, all 3 players must receive card_passed
    for (const w of ws) {
      const msg = w._sent.find((m) => m.type === 'card_passed');
      assert.ok(msg, 'every player must receive card_passed after exchange_pass');
    }
  });

  it('after 2 exchange_passes, trick_play_started is broadcast to all 3', () => {
    const { store, ws, gameId } = setupPostBidGame();
    const round = store.games.get(gameId).round;

    // Force card-exchange phase
    round.phase = 'card-exchange';
    round.exchangePassesCommitted = 0;
    round._usedExchangeDestSeats = new Set();

    ws.forEach((w) => { w._sent.length = 0; });

    const hand = round.hands[0];
    assert.ok(hand.length >= 2, 'declarer must have at least 2 cards to pass');

    // First pass: to seat 1
    sendMsg(ws[0], { type: 'exchange_pass', cardId: hand[0], toSeat: 1 });
    ws.forEach((w) => { w._sent.length = 0; });

    // Second pass: to seat 2 (must trigger trick-play start)
    const hand2 = round.hands[0]; // hand is mutated after first pass
    sendMsg(ws[0], { type: 'exchange_pass', cardId: hand2[0], toSeat: 2 });

    // All 3 must receive trick_play_started once both passes are done
    for (const w of ws) {
      const msg = w._sent.find((m) => m.type === 'trick_play_started');
      assert.ok(msg, 'every player must receive trick_play_started after both exchange passes');
    }
  });
});

// After trick_play_started, play_card broadcasts card_played to all 3 players
describe('round-messages.005 — play_card broadcasts card_played', () => {
  it('after trick-play starts, play_card from the leading player broadcasts card_played to all 3', () => {
    const { store, ws, gameId } = setupPostBidGame();
    const round = store.games.get(gameId).round;

    // Force trick-play phase (as if card exchange completed)
    round.phase = 'trick-play';
    round.trickNumber = 1;
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.currentTrick = [];
    round.collectedTricks = { 0: [], 1: [], 2: [] };
    round.currentTrumpSuit = null;
    round.declaredMarriages = [];
    round.exchangePassesCommitted = 2;

    ws.forEach((w) => { w._sent.length = 0; });

    // Alice (seat 0) leads: play her first card
    const cardId = round.hands[0][0];
    sendMsg(ws[0], { type: 'play_card', cardId });

    // All 3 players must receive card_played
    for (const w of ws) {
      const msg = w._sent.find((m) => m.type === 'card_played');
      assert.ok(msg, 'every player must receive card_played after play_card');
    }
  });

  it('play_card from the wrong seat (not currentTurnSeat) produces action_rejected to sender only', () => {
    const { store, ws, gameId } = setupPostBidGame();
    const round = store.games.get(gameId).round;

    // Force trick-play phase: seat 0 is leader
    round.phase = 'trick-play';
    round.trickNumber = 1;
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.currentTrick = [];
    round.collectedTricks = { 0: [], 1: [], 2: [] };
    round.currentTrumpSuit = null;
    round.declaredMarriages = [];
    round.exchangePassesCommitted = 2;

    ws.forEach((w) => { w._sent.length = 0; });

    // Bob (seat 1) tries to play — not his turn
    const cardId = round.hands[1][0];
    sendMsg(ws[1], { type: 'play_card', cardId });

    const rejection = ws[1]._sent.find((m) => m.type === 'action_rejected');
    assert.ok(rejection, 'wrong-turn player must receive action_rejected');
    assert.ok(rejection.reason, 'rejection must have a reason');

    // Others must not receive anything
    assert.equal(ws[0]._sent.length, 0, 'Alice must not receive any message');
    assert.equal(ws[2]._sent.length, 0, 'Charlie must not receive any message');
  });
});

// After all 8 tricks are resolved, round_summary is broadcast to all 3
describe('round-messages.005 — round_summary broadcast after trick 8', () => {
  it('after the 8th trick resolves, round_summary is broadcast to all 3 players', () => {
    const { store, ws, pids, gameId } = setupPostBidGame();
    const round = store.games.get(gameId).round;

    // Force trick-play phase at trick 8 (final trick)
    round.phase = 'trick-play';
    round.trickNumber = 8;
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.currentTrick = [];
    round.collectedTricks = { 0: [], 1: [], 2: [] };
    round.currentTrumpSuit = null;
    round.declaredMarriages = [];
    round.exchangePassesCommitted = 2;
    round.declarerSeat = 0;
    round.currentHighBid = 100;

    // Give each player exactly 1 card each (last trick of the round)
    const deck = round.deck;
    const cardA = deck[0].id;
    const cardB = deck[6].id;
    const cardC = deck[12].id;
    round.hands[0] = [cardA];
    round.hands[1] = [cardB];
    round.hands[2] = [cardC];

    ws.forEach((w) => { w._sent.length = 0; });

    // Play the final trick: seat 0 leads, seat 1 follows, seat 2 follows
    sendMsg(ws[0], { type: 'play_card', cardId: cardA });
    sendMsg(ws[1], { type: 'play_card', cardId: cardB });
    sendMsg(ws[2], { type: 'play_card', cardId: cardC });

    // After the 8th trick resolves, all 3 players must receive round_summary
    for (const w of ws) {
      const msg = w._sent.find((m) => m.type === 'round_summary');
      assert.ok(msg, 'every player must receive round_summary after the final trick');
    }
  });

  it('round_summary contains perPlayer scoring data for all 3 seats', () => {
    const { store, ws, gameId } = setupPostBidGame();
    const round = store.games.get(gameId).round;

    // Force final trick state
    round.phase = 'trick-play';
    round.trickNumber = 8;
    round.currentTrickLeaderSeat = 0;
    round.currentTurnSeat = 0;
    round.currentTrick = [];
    round.collectedTricks = { 0: [], 1: [], 2: [] };
    round.currentTrumpSuit = null;
    round.declaredMarriages = [];
    round.exchangePassesCommitted = 2;
    round.declarerSeat = 0;
    round.currentHighBid = 100;

    const deck = round.deck;
    round.hands[0] = [deck[0].id];
    round.hands[1] = [deck[6].id];
    round.hands[2] = [deck[12].id];

    ws.forEach((w) => { w._sent.length = 0; });

    sendMsg(ws[0], { type: 'play_card', cardId: deck[0].id });
    sendMsg(ws[1], { type: 'play_card', cardId: deck[6].id });
    sendMsg(ws[2], { type: 'play_card', cardId: deck[12].id });

    const msg = ws[0]._sent.find((m) => m.type === 'round_summary');
    assert.ok(msg, 'round_summary must be broadcast after final trick');
    assert.ok(msg.summary?.perPlayer, 'round_summary must include summary.perPlayer data');

    // Must have entries for all 3 seats
    assert.ok(msg.summary.perPlayer[0] !== undefined, 'perPlayer must include seat 0');
    assert.ok(msg.summary.perPlayer[1] !== undefined, 'perPlayer must include seat 1');
    assert.ok(msg.summary.perPlayer[2] !== undefined, 'perPlayer must include seat 2');
  });
});
