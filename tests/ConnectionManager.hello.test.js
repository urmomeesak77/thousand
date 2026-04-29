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
