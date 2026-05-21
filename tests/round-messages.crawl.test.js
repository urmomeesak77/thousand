'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const ConnectionManager = require('../src/services/ConnectionManager');

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

// Forces trick-play with seat 0 declarer holding no ace; seat 0 leads Q♥, seat 1
// commits K♠ (off-suit), seat 2 commits 10♥ (highest heart → winner).
function setupAcelessTrickPlay() {
  const ctx = setupInProgressGame();
  const game = ctx.store.games.get(ctx.gameId);
  const round = game.round;
  round.declarerSeat = 0;
  round.currentHighBid = 100;
  round.phase = 'trick-play';
  round.trickNumber = 1;
  round.currentTrickLeaderSeat = 0;
  round.currentTurnSeat = 0;
  round.fourNinesAckPending = false;
  const find = (rank, suit) => round.deck.find((c) => c.rank === rank && c.suit === suit).id;
  round.hands[0] = [find('Q', '♥'), find('J', '♣'), find('K', '♦')];
  round.hands[1] = [find('K', '♠'), find('A', '♣'), find('A', '♠')];
  round.hands[2] = [find('10', '♥'), find('A', '♥'), find('A', '♦')];
  ctx.ws.forEach((w) => { w._sent.length = 0; });
  return { ...ctx, game, round, cards: { s0: find('Q', '♥'), s1: find('K', '♠'), s2: find('10', '♥') } };
}

function hasFace(msg) {
  const inCommits = Array.isArray(msg.commits) && msg.commits.some((c) => 'rank' in c || 'suit' in c);
  const inTrick = (msg.gameStatus?.currentTrick ?? []).some((c) => c.rank != null || c.suit != null);
  return inCommits || inTrick;
}

describe('round-messages.crawl — commit×3 → reveal (FR-003, FR-004, FR-006, FR-007)', () => {
  it('the declarer crawl_commit broadcasts crawl_committed with no faces', () => { // per FR-003
    const { ws, cards } = setupAcelessTrickPlay();
    sendMsg(ws[0], { type: 'crawl_commit', cardId: cards.s0 });

    for (const w of ws) {
      const committed = w._sent.find((m) => m.type === 'crawl_committed');
      assert.ok(committed, 'every player must receive crawl_committed');
      assert.equal(committed.seat, 0);
      assert.deepEqual(committed.committedSeats, [0]);
      assert.equal(hasFace(committed), false, 'crawl_committed must carry no card identity (FR-005)');
      assert.equal(committed.gameStatus.crawlActive, true);
      assert.equal(committed.gameStatus.currentTrick.length, 0);
      assert.equal(w._sent.find((m) => m.type === 'crawl_revealed'), undefined, 'no reveal before the third commit');
    }
  });

  it('the third commit broadcasts crawl_revealed with three faces, winnerSeat, and trick-2 gameStatus', () => { // per FR-006
    const { ws, cards } = setupAcelessTrickPlay();
    sendMsg(ws[0], { type: 'crawl_commit', cardId: cards.s0 });
    sendMsg(ws[1], { type: 'crawl_commit', cardId: cards.s1 });
    ws.forEach((w) => { w._sent.length = 0; });
    sendMsg(ws[2], { type: 'crawl_commit', cardId: cards.s2 });

    for (const w of ws) {
      const revealed = w._sent.find((m) => m.type === 'crawl_revealed');
      assert.ok(revealed, 'every player must receive crawl_revealed');
      assert.equal(revealed.commits.length, 3);
      for (const c of revealed.commits) {
        assert.ok(c.rank != null && c.suit != null, 'reveal carries full card identity');
      }
      assert.equal(revealed.winnerSeat, 2, 'highest heart (10♥) wins; off-suit K♠ cannot');
      assert.equal(revealed.gameStatus.trickNumber, 2, 'gameStatus already advanced to trick 2 (FR-007)');
      assert.equal(revealed.gameStatus.crawlActive, false);
    }
  });

  it('never leaks a face before the third commit; every viewer gets the same winner (FR-005, FR-010)', () => { // per FR-005, FR-010
    const { ws, cards } = setupAcelessTrickPlay();
    sendMsg(ws[0], { type: 'crawl_commit', cardId: cards.s0 });
    sendMsg(ws[1], { type: 'crawl_commit', cardId: cards.s1 });

    // Across the whole pre-reveal window, no crawl_committed message — for any
    // viewer — may carry a card face (in commits or gameStatus.currentTrick).
    for (const w of ws) {
      for (const committed of w._sent.filter((m) => m.type === 'crawl_committed')) {
        assert.equal(hasFace(committed), false, 'crawl_committed must never carry a face (FR-005)');
      }
    }

    sendMsg(ws[2], { type: 'crawl_commit', cardId: cards.s2 });
    // Faces appear only in crawl_revealed, and the winner is identical everywhere.
    const winners = new Set();
    for (const w of ws) {
      assert.ok(w._sent.find((m) => m.type === 'crawl_revealed'), 'reveal reaches every viewer');
      const revealed = w._sent.find((m) => m.type === 'crawl_revealed');
      winners.add(revealed.winnerSeat);
    }
    assert.equal(winners.size, 1, 'all viewers agree on the winner (FR-010)');
    assert.equal([...winners][0], 2);
  });

  it('an off-suit opponent commit is accepted (follow-suit suspended, FR-004)', () => { // per FR-004
    const { ws, cards } = setupAcelessTrickPlay();
    sendMsg(ws[0], { type: 'crawl_commit', cardId: cards.s0 });
    ws.forEach((w) => { w._sent.length = 0; });
    // seat 1 commits K♠ while still holding nothing of the led suit — accepted, no rejection.
    sendMsg(ws[1], { type: 'crawl_commit', cardId: cards.s1 });
    assert.equal(ws[1]._sent.find((m) => m.type === 'action_rejected'), undefined);
    const committed = ws[1]._sent.find((m) => m.type === 'crawl_committed');
    assert.deepEqual(committed.committedSeats, [0, 1]);
  });
});
