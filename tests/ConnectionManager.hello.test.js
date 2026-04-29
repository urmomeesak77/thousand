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

describe('ConnectionManager hello flow', () => {
  it('(a) no hello within 5 s → socket closed 1008', () => {
    const timers = [];
    const origSetTimeout = global.setTimeout;
    const origClearTimeout = global.clearTimeout;
    global.setTimeout = (cb, ms) => { const id = timers.length; timers.push({ cb, ms }); return id; };
    global.clearTimeout = (id) => { if (typeof id === 'number' && timers[id]) timers[id] = null; };

    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    const ws = makeWs();
    cm.handleConnection(ws);

    global.setTimeout = origSetTimeout;
    global.clearTimeout = origClearTimeout;

    const helloTimer = timers.find((t) => t && t.ms === 5000);
    assert.ok(helloTimer, 'hello timer registered with 5000 ms');
    helloTimer.cb();
    assert.equal(ws._closedCode, 1008);
  });

  it('(b) hello with no creds → connected { restored: false }', () => {
    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    const ws = makeWs();
    cm.handleConnection(ws);
    sendMsg(ws, { type: 'hello' });
    const connected = ws._sent.find((m) => m.type === 'connected');
    assert.ok(connected, 'connected message sent');
    assert.equal(connected.restored, false);
    assert.ok(typeof connected.playerId === 'string');
  });

  it('(c) hello with valid creds → connected { restored: true, nickname }', () => {
    const store = new ThousandStore();
    const ws1 = makeWs();
    const { playerId, sessionToken } = store.createPlayer(ws1, '127.0.0.1');
    store.players.get(playerId).nickname = 'Alice';

    const cm = new ConnectionManager(store);
    const ws2 = makeWs();
    cm.handleConnection(ws2);
    sendMsg(ws2, { type: 'hello', playerId, sessionToken });
    const connected = ws2._sent.find((m) => m.type === 'connected');
    assert.ok(connected, 'connected message sent');
    assert.equal(connected.restored, true);
    assert.equal(connected.nickname, 'Alice');
  });

  it('(d) duplicate hello ignored', () => {
    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    const ws = makeWs();
    cm.handleConnection(ws);
    sendMsg(ws, { type: 'hello' });
    const countAfterFirst = ws._sent.filter((m) => m.type === 'connected').length;
    sendMsg(ws, { type: 'hello' });
    const countAfterSecond = ws._sent.filter((m) => m.type === 'connected').length;
    assert.equal(countAfterFirst, 1);
    assert.equal(countAfterSecond, 1, 'second hello must be ignored');
  });

  it('(e) SC-001 — hello→connected latency < 2000 ms (server-side)', () => {
    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    const ws = makeWs();
    cm.handleConnection(ws);
    const start = Date.now();
    sendMsg(ws, { type: 'hello' });
    const elapsed = Date.now() - start;
    const connected = ws._sent.find((m) => m.type === 'connected');
    assert.ok(connected, 'connected message sent');
    assert.ok(elapsed < 2000, `latency ${elapsed} ms must be < 2000 ms`);
  });
});

describe('ConnectionManager hello — game restoration', () => {
  it('restored player with gameId sends game_joined', () => {
    const store = new ThousandStore();
    const oldWs = { readyState: 1, _socket: { remoteAddress: '::1' }, send: () => {}, close: () => {} };
    const { playerId, sessionToken } = store.createPlayer(oldWs, '::1');
    const player = store.players.get(playerId);
    player.nickname = 'Bob';
    const gameId = 'g1';
    store.games.set(gameId, { id: gameId, players: new Set([playerId]), hostId: playerId, type: 'public', status: 'waiting', maxPlayers: 4, createdAt: 1000, inviteCode: null });
    player.gameId = gameId;

    const cm = new ConnectionManager(store);
    const ws = makeWs();
    cm.handleConnection(ws);
    sendMsg(ws, { type: 'hello', playerId, sessionToken });

    const gameJoined = ws._sent.find((m) => m.type === 'game_joined');
    assert.ok(gameJoined, 'game_joined sent on restore');
    assert.equal(gameJoined.gameId, gameId);
  });
});

describe('ConnectionManager IP rate limit', () => {
  it('11th connection from same IP is closed with 1008', () => {
    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    for (let i = 0; i < 10; i++) {
      cm.handleConnection(makeWs());
    }
    const ws = makeWs();
    cm.handleConnection(ws);
    assert.equal(ws._closedCode, 1008);
  });
});

describe('ConnectionManager message rate limit', () => {
  it('31st message in same window triggers close 1008', () => {
    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    const ws = makeWs();
    cm.handleConnection(ws);
    sendMsg(ws, { type: 'hello' });
    for (let i = 0; i < 29; i++) {
      sendMsg(ws, { type: 'ping' });
    }
    sendMsg(ws, { type: 'ping' });
    assert.equal(ws._closedCode, 1008);
  });
});

describe('ConnectionManager heartbeat', () => {
  it('startHeartbeat registers an interval with given ms', () => {
    let captured;
    const origSetInterval = global.setInterval;
    global.setInterval = (cb, ms) => { captured = { cb, ms }; return { unref: () => {} }; };
    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    cm.startHeartbeat(50);
    global.setInterval = origSetInterval;
    assert.ok(captured, 'setInterval called');
    assert.equal(captured.ms, 50);
  });

  it('startHeartbeat is idempotent — second call ignored', () => {
    let callCount = 0;
    const origSetInterval = global.setInterval;
    global.setInterval = () => { callCount++; return { unref: () => {} }; };
    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    cm.startHeartbeat(50);
    cm.startHeartbeat(50);
    global.setInterval = origSetInterval;
    assert.equal(callCount, 1);
  });

  it('stopHeartbeat clears the interval and nulls the timer', () => {
    let cleared = false;
    const fakeTimer = { unref: () => {} };
    const origSetInterval = global.setInterval;
    const origClearInterval = global.clearInterval;
    global.setInterval = () => fakeTimer;
    global.clearInterval = (t) => { if (t === fakeTimer) cleared = true; };
    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    cm.startHeartbeat(50);
    cm.stopHeartbeat();
    global.setInterval = origSetInterval;
    global.clearInterval = origClearInterval;
    assert.ok(cleared, 'clearInterval called with the timer handle');
    assert.equal(cm._heartbeatTimer, null);
  });

  it('heartbeat sweep terminates non-responsive ws', () => {
    let sweepCb;
    const origSetInterval = global.setInterval;
    global.setInterval = (cb) => { sweepCb = cb; return { unref: () => {} }; };
    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    cm.startHeartbeat(50);
    global.setInterval = origSetInterval;

    const ws = makeWs();
    cm.handleConnection(ws);
    ws.isAlive = false;
    ws._terminated = false;
    ws.terminate = () => { ws._terminated = true; };

    sweepCb();
    assert.ok(ws._terminated, 'non-responsive ws terminated by sweep');
  });

  it('heartbeat sweep pings alive ws and marks isAlive false', () => {
    let sweepCb;
    const origSetInterval = global.setInterval;
    global.setInterval = (cb) => { sweepCb = cb; return { unref: () => {} }; };
    const store = new ThousandStore();
    const cm = new ConnectionManager(store);
    cm.startHeartbeat(50);
    global.setInterval = origSetInterval;

    const ws = makeWs();
    let pinged = false;
    ws.ping = () => { pinged = true; };
    cm.handleConnection(ws);

    sweepCb();
    assert.ok(pinged, 'alive ws was pinged');
    assert.equal(ws.isAlive, false, 'isAlive reset to false after ping');
  });
});
