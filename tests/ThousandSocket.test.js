'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

let strippedSrc;

before(() => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'public', 'js', 'network', 'ThousandSocket.js'),
    'utf8'
  );
  strippedSrc = src
    // Strip the IdentityStore import — we provide a stub on window.
    .replace(/^import[^;]+;$/gm, '')
    .replace(/^export default\s+(\w+);\s*$/gm, (_, name) => `window.${name} = ${name};`);
});

function makeFakeWs() {
  const ws = {
    readyState: 0, // CONNECTING
    sent: [],
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  };
  ws.send = (d) => ws.sent.push(d);
  ws.close = () => { ws.readyState = 3; };
  return ws;
}

function makeAntlion() {
  // Captures scheduled callbacks instead of running them — tests fire them manually.
  const scheduled = [];
  let nextId = 1;
  return {
    scheduled,
    schedule(delay, cb) {
      const id = nextId++;
      scheduled.push({ id, delay, cb });
      return id;
    },
    cancelScheduled(id) {
      const idx = scheduled.findIndex((s) => s.id === id);
      if (idx >= 0) scheduled.splice(idx, 1);
    },
  };
}

function bootstrap() {
  const dom = new JSDOM('<html></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost:3000',
  });
  // Stub IdentityStore.load — invoked inside ws.onopen.
  dom.window.IdentityStore = { load: () => ({}) };

  const wsInstances = [];
  dom.window.WebSocket = function FakeWS() {
    const ws = makeFakeWs();
    wsInstances.push(ws);
    return ws;
  };

  dom.window.eval(strippedSrc);
  return { dom, wsInstances, ThousandSocket: dom.window.ThousandSocket };
}

describe('ThousandSocket reconnect backoff', () => {
  it('first reconnect schedules ~1000 ms (within ±20% jitter)', () => {
    const { wsInstances, ThousandSocket } = bootstrap();
    const antlion = makeAntlion();
    const sock = new ThousandSocket(antlion, () => {}, () => {});
    sock.connect();

    wsInstances[0].onclose();
    assert.equal(antlion.scheduled.length, 1);
    const d = antlion.scheduled[0].delay;
    assert.ok(d >= 800 && d <= 1200, `expected ~1000, got ${d}`);
  });

  it('subsequent reconnects double base delay up to 30000 cap', () => {
    const { wsInstances, ThousandSocket } = bootstrap();
    const antlion = makeAntlion();
    const sock = new ThousandSocket(antlion, () => {}, () => {});
    sock.connect();

    const expectedBases = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (let i = 0; i < expectedBases.length; i++) {
      // Trigger close, then fire the scheduled reconnect to spawn the next ws.
      const ws = wsInstances[i];
      ws.onclose();
      const last = antlion.scheduled[antlion.scheduled.length - 1];
      const base = expectedBases[i];
      assert.ok(
        last.delay >= base * 0.8 && last.delay <= base * 1.2,
        `attempt ${i}: expected ~${base}, got ${last.delay}`
      );
      // Run the scheduled cb to create the next ws instance.
      last.cb();
    }
  });

  it('successful onopen resets the attempt counter', () => {
    const { wsInstances, ThousandSocket } = bootstrap();
    const antlion = makeAntlion();
    const sock = new ThousandSocket(antlion, () => {}, () => {});
    sock.connect();

    // Two failed cycles to grow the backoff.
    wsInstances[0].onclose();
    antlion.scheduled[antlion.scheduled.length - 1].cb();
    wsInstances[1].onclose();
    antlion.scheduled[antlion.scheduled.length - 1].cb();

    // Third ws connects successfully.
    wsInstances[2].onopen();
    // Then drops — next reconnect should be back at ~1000 ms.
    wsInstances[2].onclose();
    const d = antlion.scheduled[antlion.scheduled.length - 1].delay;
    assert.ok(d >= 800 && d <= 1200, `expected ~1000 after reset, got ${d}`);
  });

  it('disconnect() prevents further reconnect scheduling', () => {
    const { wsInstances, ThousandSocket } = bootstrap();
    const antlion = makeAntlion();
    const sock = new ThousandSocket(antlion, () => {}, () => {});
    sock.connect();

    sock.disconnect();
    const before_ = antlion.scheduled.length;
    wsInstances[0].onclose();
    assert.equal(antlion.scheduled.length, before_, 'no new schedule after disconnect()');
  });

  it('disconnect() cancels any pending reconnect timer', () => {
    const { wsInstances, ThousandSocket } = bootstrap();
    const antlion = makeAntlion();
    const sock = new ThousandSocket(antlion, () => {}, () => {});
    sock.connect();

    wsInstances[0].onclose();
    assert.equal(antlion.scheduled.length, 1);
    sock.disconnect();
    assert.equal(antlion.scheduled.length, 0, 'pending timer cancelled');
  });
});
