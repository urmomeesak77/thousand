'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const ConnectionManager = require('../src/services/ConnectionManager');

// ---------------------------------------------------------------------------
// Helpers — reproduce a 3-player game in trick-play with deterministic hands
// ---------------------------------------------------------------------------

function makeWs() {
  const sent = [];
  const handlers = {};
  const ws = {
    readyState: 1,
    isAlive: true,
    _socket: { remoteAddress: '127.0.0.1' },
    send: (d) => sent.push(JSON.parse(d)),
    close: () => {},
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

function setupTrickPlay() {
  const store = new ThousandStore();
  const cm = new ConnectionManager(store);
  const ws = [makeWs(), makeWs(), makeWs()];
  ws.forEach((w) => { cm.handleConnection(w); sendMsg(w, { type: 'hello' }); });
  const pids = ws.map((w) => w._sent.find((m) => m.type === 'connected').playerId);
  pids.forEach((pid, i) => { store.players.get(pid).nickname = ['Alice', 'Bob', 'Charlie'][i]; });

  const gameId = 'test-game';
  store.games.set(gameId, {
    id: gameId, players: new Set(pids), hostId: pids[0], type: 'public',
    status: 'waiting', requiredPlayers: 3, createdAt: Date.now(),
    inviteCode: null, round: null, waitingRoomTimer: null,
  });
  pids.forEach((pid) => { store.players.get(pid).gameId = gameId; });
  store.startRound(gameId);

  const round = store.games.get(gameId).round;
  round.phase = 'trick-play';
  round.trickNumber = 1;
  round.currentTrickLeaderSeat = 0;
  round.currentTurnSeat = 0;
  round.currentTrick = [];
  round.collectedTricks = { 0: [], 1: [], 2: [] };
  round.collectedTrickCounts = { 0: 0, 1: 0, 2: 0 };
  round.currentTrumpSuit = null;
  round.declaredMarriages = [];
  round.exchangePassesCommitted = 2;
  round.declarerSeat = 0;
  round.currentHighBid = 100;

  return { store, ws, pids, gameId, round };
}

function findCardId(deck, rank, suit) {
  const c = deck.find((card) => card.rank === rank && card.suit === suit);
  if (!c) throw new Error(`Card ${rank}${suit} not in deck`);
  return c.id;
}

// ---------------------------------------------------------------------------
// Bug repro: server sent `card_played` with the wrong cardId when the player
// who played the 3rd (trick-resolving) card was NOT the trick winner.
//
// Root cause: _broadcastPlayCardResults read playedCardId from currentTrick
// after _resolveTrick() had already cleared it, then fell back to
// collectedTricks[playerSeat] — which only has entries when playerSeat IS the
// winner. For a 3rd-card-non-winner, the fallback either returned undefined
// (first trick: hand still had the optimistically-hidden card → phantom) or a
// stale cardId from a prior trick that this player had won. Either way the
// client could not reconcile its hand against the server.
// ---------------------------------------------------------------------------

describe('round-messages — card_played carries the actual played card id', () => {
  it('3rd card from a non-winning player has the played cardId in card_played', () => {
    const { ws, round } = setupTrickPlay();

    // Alice leads ♣A (highest), Bob follows ♣9, Charlie follows ♣10.
    // Alice wins the trick (♣A beats ♣10 beats ♣9). Charlie is the 3rd-card
    // player and does NOT win.
    const aliceClubA = findCardId(round.deck, 'A', '♣');
    const bobClub9 = findCardId(round.deck, '9', '♣');
    const charlieClub10 = findCardId(round.deck, '10', '♣');
    round.hands[0] = [aliceClubA];
    round.hands[1] = [bobClub9];
    round.hands[2] = [charlieClub10];

    ws.forEach((w) => { w._sent.length = 0; });

    sendMsg(ws[0], { type: 'play_card', cardId: aliceClubA });
    sendMsg(ws[1], { type: 'play_card', cardId: bobClub9 });
    sendMsg(ws[2], { type: 'play_card', cardId: charlieClub10 });

    // Every player gets multiple card_played events; the 3rd one (Charlie's)
    // is the one with the bug.
    for (const w of ws) {
      const charliePlayedEvents = w._sent.filter((m) => m.type === 'card_played');
      assert.equal(charliePlayedEvents.length, 3, 'expected one card_played per card played');
      const charlieMsg = charliePlayedEvents[2];
      assert.equal(charlieMsg.cardId, charlieClub10,
        `card_played for the 3rd card must carry charlieClub10 (got cardId=${charlieMsg.cardId})`);
      assert.equal(charlieMsg.playerSeat, 2, 'playerSeat must be Charlie (seat 2)');
      assert.ok(charlieMsg.card?.rank === '10' && charlieMsg.card?.suit === '♣',
        'card identity must match the 10♣');
    }
  });

  it('3rd card cardId is correct even when player has won prior tricks', () => {
    const { ws, round } = setupTrickPlay();

    // Trick 1: Charlie wins (♣A beats ♣10 beats ♣9).
    // Trick 2: Alice wins, Charlie plays 3rd and loses. card_played must
    // still report Charlie's actual played card, not the last card from his
    // collected-tricks pile.
    const cA = findCardId(round.deck, 'A', '♣');
    const c10 = findCardId(round.deck, '10', '♣');
    const c9 = findCardId(round.deck, '9', '♣');
    const sA = findCardId(round.deck, 'A', '♠');
    const s10 = findCardId(round.deck, '10', '♠');
    const s9 = findCardId(round.deck, '9', '♠');

    round.hands[0] = [c10, sA];   // Alice plays ♣10 then ♠A (trick 2)
    round.hands[1] = [c9, s10];   // Bob plays ♣9 then ♠10
    round.hands[2] = [cA, s9];    // Charlie plays ♣A (wins trick 1) then ♠9 (loses trick 2)

    // Trick 1: leader = seat 0
    sendMsg(ws[0], { type: 'play_card', cardId: c10 });
    sendMsg(ws[1], { type: 'play_card', cardId: c9 });
    sendMsg(ws[2], { type: 'play_card', cardId: cA });
    // Charlie wins trick 1; he leads trick 2.
    assert.equal(round.currentTrickLeaderSeat, 2, 'Charlie should lead trick 2');

    ws.forEach((w) => { w._sent.length = 0; });

    // Trick 2: Charlie leads ♠9, Alice plays ♠A (wins), Bob plays ♠10.
    // The 3rd-card player is Bob, who does NOT win. Verify card_played's
    // cardId is Bob's actual played card (s10), not a stale id from Bob's
    // (empty) collected pile.
    sendMsg(ws[2], { type: 'play_card', cardId: s9 });
    sendMsg(ws[0], { type: 'play_card', cardId: sA });
    sendMsg(ws[1], { type: 'play_card', cardId: s10 });

    const bobMsg = ws[1]._sent.filter((m) => m.type === 'card_played').slice(-1)[0];
    assert.equal(bobMsg.cardId, s10,
      `card_played for Bob's 3rd card must carry s10 (got cardId=${bobMsg.cardId})`);
    assert.equal(bobMsg.playerSeat, 1, 'playerSeat must be Bob (seat 1)');
  });
});
