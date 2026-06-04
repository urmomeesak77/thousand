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

// In-memory stand-in for BroadcastChannel. Faithfully models the real API:
// delivery is asynchronous (on a later task, like a real channel) and a sender
// never receives its own message. Async delivery guards against tests that
// would only pass under synchronous, same-tick delivery.
function makeBus() {
  const channels = [];
  return {
    create() {
      const ch = {
        onmessage: null,
        postMessage(data) {
          for (const c of channels) {
            if (c !== ch) {
              setTimeout(() => { if (c.onmessage) {c.onmessage({ data });} }, 0);
            }
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
    const a = new TabSync({ channelFactory: bus.create, identityStore: storeA, electionWindowMs: 10, adoptTimeoutMs: 1000, nonce: 0.1 });
    const b = new TabSync({ channelFactory: bus.create, identityStore: storeB, electionWindowMs: 10, adoptTimeoutMs: 1000, nonce: 0.8 });

    // Both elect simultaneously. This assertion must DISTINGUISH a working
    // election from a silently-broken one: if B never saw A's `hello`, its
    // peerNonces would be empty, it would think itself lowest, and resolve {}
    // immediately. We instead require B to adopt the creator's published
    // identity — which only happens if A's nonce reached B and B waited.
    const resAP = a.resolveIdentity();
    const resBP = b.resolveIdentity();

    // A is lowest → the creator → resolves empty (server will issue an identity).
    assert.deepEqual(await resAP, {});
    // A obtains its server identity and broadcasts it; B (still waiting out its
    // adopt window) must converge on it rather than create a second player.
    a.publishIdentity('pElected', 'tElected');
    assert.deepEqual(await resBP, { playerId: 'pElected', sessionToken: 'tElected' });
    assert.deepEqual(storeB._get(), { playerId: 'pElected', sessionToken: 'tElected' });
  });

  it('falls back to a direct (empty) connect when BroadcastChannel is unavailable', async () => {
    const TabSync = loadTabSync();
    const store = makeIdentityStore();
    const sync = new TabSync({ channelFactory: null, identityStore: store, electionWindowMs: 10 });

    const id = await sync.resolveIdentity();
    assert.deepEqual(id, {});
  });

  it('a non-lowest fresh tab adopts a creator identity that arrives AFTER the election window', async () => {
    const TabSync = loadTabSync();
    const bus = makeBus();
    const loserStore = makeIdentityStore();
    const loser = new TabSync({ channelFactory: bus.create, identityStore: loserStore, electionWindowMs: 10, adoptTimeoutMs: 1000, nonce: 0.9 });
    const creatorStore = makeIdentityStore();
    const creator = new TabSync({ channelFactory: bus.create, identityStore: creatorStore, electionWindowMs: 10, adoptTimeoutMs: 1000, nonce: 0.1 });

    const loserPromise = loser.resolveIdentity();
    const creatorRes = await creator.resolveIdentity(); // creator (lowest) → resolves empty
    assert.deepEqual(creatorRes, {});

    // Creator's server round-trip completes only AFTER the loser's 10ms election
    // window has elapsed; the loser must still adopt it (within adoptTimeoutMs).
    setTimeout(() => creator.publishIdentity('pLate', 'tLate'), 40);

    const id = await loserPromise;
    assert.deepEqual(id, { playerId: 'pLate', sessionToken: 'tLate' });
    assert.deepEqual(loserStore._get(), { playerId: 'pLate', sessionToken: 'tLate' });
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
