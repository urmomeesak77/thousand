'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

// Load TabSync as an ES-module-stripped script into a jsdom window, mirroring
// the ThousandSocket.test.js loading approach.
const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'public', 'js', 'storage', 'TabSync.js'),
  'utf8'
)
  .replace(/^import[^;]+;$/gm, '')
  .replace(/^export\s+class\s+(\w+)/gm, (_, name) => `window.${name} = class ${name}`);

function loadTabSync() {
  const dom = new JSDOM('<html></html>', { runScripts: 'dangerously', url: 'http://localhost:3000' });
  dom.window.eval(src);
  return dom.window.TabSync;
}

// In-memory stand-in for BroadcastChannel: posts reach every OTHER channel.
function makeBus() {
  const channels = [];
  return {
    create() {
      const ch = {
        onmessage: null,
        postMessage(data) {
          for (const c of channels) {
            if (c !== ch && c.onmessage) {c.onmessage({ data });}
          }
        },
        close() {},
      };
      channels.push(ch);
      return ch;
    },
  };
}

function makeIdentityStore(initial) {
  let stored = initial ? { ...initial } : {};
  return {
    load: () => ({ ...stored }),
    save: (playerId, sessionToken) => { stored = { playerId, sessionToken }; },
    _get: () => stored,
  };
}

describe('TabSync.resolveIdentity', () => {
  it('returns a stored identity immediately without electing', async () => {
    const TabSync = loadTabSync();
    const bus = makeBus();
    const store = makeIdentityStore({ playerId: 'p1', sessionToken: 't1' });
    const sync = new TabSync({ channelFactory: bus.create, identityStore: store, electionWindowMs: 10 });

    const id = await sync.resolveIdentity();
    assert.deepEqual(id, { playerId: 'p1', sessionToken: 't1' });
  });

  it('a fresh tab adopts a sibling that already holds an identity', async () => {
    const TabSync = loadTabSync();
    const bus = makeBus();
    // Sibling already has identity and is listening on the bus.
    const holderStore = makeIdentityStore({ playerId: 'pHold', sessionToken: 'tHold' });
    const holder = new TabSync({ channelFactory: bus.create, identityStore: holderStore, electionWindowMs: 10 });
    await holder.resolveIdentity(); // primes holder._identity and its listener

    const freshStore = makeIdentityStore();
    const fresh = new TabSync({ channelFactory: bus.create, identityStore: freshStore, electionWindowMs: 50, nonce: 0.9 });

    const id = await fresh.resolveIdentity();
    assert.deepEqual(id, { playerId: 'pHold', sessionToken: 'tHold' });
    assert.deepEqual(freshStore._get(), { playerId: 'pHold', sessionToken: 'tHold' });
  });

  it('two fresh tabs elect exactly one creator (lowest nonce); the other adopts', async () => {
    const TabSync = loadTabSync();
    const bus = makeBus();
    const storeA = makeIdentityStore();
    const storeB = makeIdentityStore();
    const a = new TabSync({ channelFactory: bus.create, identityStore: storeA, electionWindowMs: 20, nonce: 0.1 });
    const b = new TabSync({ channelFactory: bus.create, identityStore: storeB, electionWindowMs: 20, nonce: 0.8 });

    const [resA, resB] = await Promise.all([a.resolveIdentity(), b.resolveIdentity()]);

    // Lowest nonce (A) is the creator → empty identity (server will issue one).
    assert.deepEqual(resA, {});
    // B is NOT the creator; with no identity published yet it falls back to empty too.
    assert.deepEqual(resB, {});
  });

  it('falls back to a direct (empty) connect when BroadcastChannel is unavailable', async () => {
    const TabSync = loadTabSync();
    const store = makeIdentityStore();
    const sync = new TabSync({ channelFactory: null, identityStore: store, electionWindowMs: 10 });

    const id = await sync.resolveIdentity();
    assert.deepEqual(id, {});
  });
});

describe('TabSync.publishIdentity', () => {
  it('saves the identity to the store and broadcasts it to siblings', () => {
    const TabSync = loadTabSync();
    const bus = makeBus();
    // A fresh sibling that is mid-election, listening on the bus.
    const sibStore = makeIdentityStore();
    const sibling = new TabSync({ channelFactory: bus.create, identityStore: sibStore, electionWindowMs: 1000, nonce: 0.5 });
    const sibPromise = sibling.resolveIdentity(); // starts electing, registers _onIdentity

    const pubStore = makeIdentityStore();
    const publisher = new TabSync({ channelFactory: bus.create, identityStore: pubStore, electionWindowMs: 1000 });

    publisher.publishIdentity('pX', 'tX');

    // Publisher persisted it.
    assert.deepEqual(pubStore._get(), { playerId: 'pX', sessionToken: 'tX' });
    // Sibling adopted it via the broadcast.
    return sibPromise.then((id) => {
      assert.deepEqual(id, { playerId: 'pX', sessionToken: 'tX' });
      assert.deepEqual(sibStore._get(), { playerId: 'pX', sessionToken: 'tX' });
    });
  });
});
