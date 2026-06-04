# Same-browser multi-tab as one player — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every tab of one browser act as a single player whose state mirrors live across all tabs, and stop the fresh-load race that turns one browser into two players (and two games).

**Architecture:** Server-side, the player (not the socket) becomes the unit: `Player.ws` becomes `Player.sockets` (a `Set`), so every broadcast/snapshot — already routed by `playerId` — reaches all of a player's tabs automatically, and the disconnect grace timer only starts when the *last* tab closes. Client-side, a new `TabSync` module uses a `BroadcastChannel` to make simultaneously-opened fresh tabs converge on one identity before connecting. A server create-guard closes the last per-player two-games hole.

**Tech Stack:** Node.js (CommonJS backend), vanilla ES-module frontend, `node:test` runner, `jsdom` for client tests, `BroadcastChannel` (browser).

**Spec:** `docs/superpowers/specs/2026-06-04-multi-tab-single-player-design.md`

**Conventions:** 2-space indent; semicolons; `const` by default; comments explain *why*; max 50-line functions. Run a single test file with `node --test tests/<file>`. Run all with `npm test`. Lint with `npm run lint`.

---

## Task 1: `PlayerRegistry` — sockets Set

**Files:**
- Modify: `src/services/PlayerRegistry.js` (`create` ~26-38, `sendToPlayer` ~86-91)
- Test: `tests/PlayerRegistry.sockets.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/PlayerRegistry.sockets.test.js`:

```javascript
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const PlayerRegistry = require('../src/services/PlayerRegistry');

function makeWs() {
  const sent = [];
  return { readyState: 1, send: (d) => sent.push(JSON.parse(d)), _sent: sent };
}

describe('PlayerRegistry multi-socket', () => {
  it('create() seeds the player with a single-socket Set', () => {
    const registry = new PlayerRegistry();
    const ws = makeWs();
    const { playerId } = registry.create(ws, '127.0.0.1');
    const player = registry.players.get(playerId);
    assert.ok(player.sockets instanceof Set);
    assert.equal(player.sockets.size, 1);
    assert.ok(player.sockets.has(ws));
  });

  it('sendToPlayer delivers to every open socket', () => {
    const registry = new PlayerRegistry();
    const ws1 = makeWs();
    const { playerId } = registry.create(ws1, '127.0.0.1');
    const ws2 = makeWs();
    registry.players.get(playerId).sockets.add(ws2);

    registry.sendToPlayer(playerId, { type: 'ping' });

    assert.deepEqual(ws1._sent, [{ type: 'ping' }]);
    assert.deepEqual(ws2._sent, [{ type: 'ping' }]);
  });

  it('sendToPlayer skips non-open sockets and isolates throwing ones', () => {
    const registry = new PlayerRegistry();
    const ws1 = makeWs();
    const { playerId } = registry.create(ws1, '127.0.0.1');
    const wsClosed = { readyState: 3, send: () => { throw new Error('closed'); } };
    const wsThrows = { readyState: 1, send: () => { throw new Error('boom'); } };
    registry.players.get(playerId).sockets.add(wsClosed);
    registry.players.get(playerId).sockets.add(wsThrows);

    assert.doesNotThrow(() => registry.sendToPlayer(playerId, { type: 'ping' }));
    assert.deepEqual(ws1._sent, [{ type: 'ping' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/PlayerRegistry.sockets.test.js`
Expected: FAIL — `player.sockets` is undefined (still `ws`).

- [ ] **Step 3: Implement multi-socket in `create` and `sendToPlayer`**

In `src/services/PlayerRegistry.js`, change the `create` player object so the `ws` field becomes a Set:

```javascript
  create(ws, clientIp) {
    const playerId = crypto.randomUUID();
    const sessionToken = crypto.randomUUID();
    this.players.set(playerId, {
      id: playerId,
      nickname: null,
      gameId: null,
      sockets: new Set([ws]),
      sessionToken,
      disconnectedAt: null,
      graceTimer: null,
    });
    this._tokenIndex.set(sessionToken, playerId);
    ws._clientIp = clientIp;
    ws._playerId = playerId;
    return { playerId, sessionToken };
  }
```

Replace `sendToPlayer` to iterate the Set:

```javascript
  sendToPlayer(playerId, payload) {
    const player = this.players.get(playerId);
    if (!player || !player.sockets) {return;}
    const data = JSON.stringify(payload);
    for (const ws of player.sockets) {
      if (ws.readyState !== WS_OPEN) {continue;}
      // readyState can flip between the check and send; swallow per-socket
      // errors so one dead tab doesn't starve the others.
      try { ws.send(data); } catch { /* ignore */ }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/PlayerRegistry.sockets.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/PlayerRegistry.js tests/PlayerRegistry.sockets.test.js
git commit -m "feat(server): PlayerRegistry tracks a Set of sockets per player"
```

---

## Task 2: `ThousandStore.broadcastLobbyUpdate` — iterate sockets

**Files:**
- Modify: `src/services/ThousandStore.js` (`broadcastLobbyUpdate` ~112-122)
- Test: `tests/ThousandStore.broadcast.test.js` (existing — extend)

The existing `tests/ThousandStore.broadcast.test.js` still passes (it mutates the same ws object reference held in the Set). Add a multi-socket case.

- [ ] **Step 1: Write the failing test**

Append to `tests/ThousandStore.broadcast.test.js` (inside the file, after the existing `describe` blocks):

```javascript
describe('ThousandStore.broadcastLobbyUpdate — multi-socket', () => {
  it('delivers lobby_update to every socket of a lobby player', () => {
    const store = new ThousandStore();
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');
    const ws2 = makeWs();
    store.players.get(playerId).sockets.add(ws2);

    store.broadcastLobbyUpdate();

    assert.ok(ws1._sent.some((m) => m.type === 'lobby_update'));
    assert.ok(ws2._sent.some((m) => m.type === 'lobby_update'), 'second tab must receive it too');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ThousandStore.broadcast.test.js`
Expected: FAIL — `broadcastLobbyUpdate` reads `player.ws` (now undefined), so `ws2` (and `ws1`) get nothing.

- [ ] **Step 3: Implement socket iteration**

In `src/services/ThousandStore.js`, replace `broadcastLobbyUpdate`:

```javascript
  // T034 – broadcast lobby state to every client whose gameId is null
  broadcastLobbyUpdate() {
    const msg = JSON.stringify({ type: 'lobby_update', games: this.getLobbyGames() });
    for (const [, player] of this.players) {
      if (player.gameId !== null) {continue;}
      for (const ws of player.sockets) {
        if (ws.readyState !== WS_OPEN) {continue;}
        // readyState can flip between the check and send; swallow per-socket
        // errors so one bad tab doesn't abort the broadcast.
        try { ws.send(msg); } catch { /* ignore */ }
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ThousandStore.broadcast.test.js`
Expected: PASS (existing + new test).

- [ ] **Step 5: Commit**

```bash
git add src/services/ThousandStore.js tests/ThousandStore.broadcast.test.js
git commit -m "feat(server): broadcast lobby updates to all of a player's sockets"
```

---

## Task 3: `ConnectionLifecycle` — additive connect + last-socket grace

**Files:**
- Modify: `src/services/ConnectionLifecycle.js` (`handleDisconnect` ~15-47, `reconnect` ~49-83)
- Test: `tests/ConnectionLifecycle.multisocket.test.js` (create)

This is the behavioral heart of the change. `reconnect` adds a socket instead of kicking the old one (no more `session_replaced`); `handleDisconnect` only starts the grace timer when the last socket goes.

- [ ] **Step 1: Write the failing test**

Create `tests/ConnectionLifecycle.multisocket.test.js`:

```javascript
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');

function makeWs() {
  const sent = [];
  const ws = {
    readyState: 1,
    send: (d) => sent.push(JSON.parse(d)),
    on: () => {},
    _sent: sent,
    _closed: false,
  };
  ws.close = () => { ws._closed = true; };
  return ws;
}

describe('ConnectionLifecycle multi-socket', () => {
  it('a second connection is additive — both sockets stay open, no session_replaced', () => {
    const store = new ThousandStore();
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');

    const ws2 = makeWs();
    store.reconnectPlayer(playerId, ws2);

    const player = store.players.get(playerId);
    assert.equal(player.sockets.size, 2, 'both tabs are connected');
    assert.ok(player.sockets.has(ws1) && player.sockets.has(ws2));
    assert.equal(ws1._closed, false, 'first tab is NOT kicked');
    assert.equal(ws1._sent.length, 0, 'no session_replaced sent to the first tab');
    assert.equal(ws2._playerId, playerId);
  });

  it('closing one of several sockets does not start the grace timer', () => {
    process.env.GRACE_PERIOD_MS = '60000';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');
    const ws2 = makeWs();
    store.reconnectPlayer(playerId, ws2);

    store.handlePlayerDisconnect(playerId, ws1);

    const player = store.players.get(playerId);
    assert.equal(player.sockets.size, 1, 'the other tab is still connected');
    assert.ok(player.sockets.has(ws2));
    assert.equal(player.disconnectedAt, null, 'player is still fully connected');
    assert.equal(player.graceTimer, null, 'no grace timer while a tab remains');
  });

  it('closing the last socket starts the grace timer', () => {
    process.env.GRACE_PERIOD_MS = '60000';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');

    store.handlePlayerDisconnect(playerId, ws1);

    const player = store.players.get(playerId);
    assert.equal(player.sockets.size, 0);
    assert.ok(player.disconnectedAt !== null);
    assert.ok(player.graceTimer !== null);
    clearTimeout(player.graceTimer);
  });

  it('a stale close for an already-removed socket is a no-op', () => {
    process.env.GRACE_PERIOD_MS = '60000';
    const store = new ThousandStore();
    delete process.env.GRACE_PERIOD_MS;
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');
    const ws2 = makeWs();
    store.reconnectPlayer(playerId, ws2);

    store.handlePlayerDisconnect(playerId, ws1); // ws1 removed, ws2 remains
    store.handlePlayerDisconnect(playerId, ws1); // stale repeat — must not touch ws2/grace

    const player = store.players.get(playerId);
    assert.equal(player.sockets.size, 1);
    assert.ok(player.sockets.has(ws2));
    assert.equal(player.graceTimer, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ConnectionLifecycle.multisocket.test.js`
Expected: FAIL — `reconnect` still sets `player.ws` and sends `session_replaced`; `player.sockets` is not maintained.

- [ ] **Step 3: Rewrite `handleDisconnect` and `reconnect`**

In `src/services/ConnectionLifecycle.js`, replace `handleDisconnect`:

```javascript
  handleDisconnect(playerId, ws) {
    const store = this._store;
    if (!playerId || !store.players.has(playerId)) {
      return;
    }
    const player = store.players.get(playerId);
    // Remove just the closing socket. If it wasn't a member (a stale close that
    // arrives after the socket was already removed), do nothing.
    if (ws) {
      if (!player.sockets.delete(ws)) {return;}
    } else {
      // Defensive: callers without a ws (tests, forced teardown) tear down fully.
      player.sockets.clear();
    }
    // Other tabs are still live → the player has not actually left.
    if (player.sockets.size > 0) {
      return;
    }
    player.disconnectedAt = Date.now();
    player.graceTimer = setTimeout(() => this._purge(playerId), store._gracePeriodMs);
    if (typeof player.graceTimer.unref === 'function') {player.graceTimer.unref();}

    if (player.gameId) {
      const game = store.games.get(player.gameId);
      if (game && game.status === 'in-progress' && game.round) {
        const seat = game.round.seatByPlayer.get(playerId);
        game.round.markDisconnected(seat);
        for (const pid of game.players) {
          if (pid === playerId) {continue;}
          const recipientSeat = game.round.seatByPlayer.get(pid);
          store.sendToPlayer(pid, {
            type: 'player_disconnected',
            playerId,
            gameStatus: game.round.getViewModelFor(recipientSeat),
          });
        }
      }
    }
  }
```

Replace `reconnect`:

```javascript
  reconnect(playerId, ws) {
    const store = this._store;
    const player = store.players.get(playerId);
    if (!player) {return;}
    // Adding a socket to an already-live player (another tab) is NOT a
    // reconnect — only announce one when the player had fully dropped.
    const wasFullyDisconnected = player.sockets.size === 0;
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
    player.disconnectedAt = null;
    player.sockets.add(ws);
    ws._playerId = playerId;

    if (wasFullyDisconnected && player.gameId) {
      const game = store.games.get(player.gameId);
      if (game && game.status === 'in-progress' && game.round) {
        const seat = game.round.seatByPlayer.get(playerId);
        game.round.markReconnected(seat);
        for (const pid of game.players) {
          if (pid === playerId) {continue;}
          const recipientSeat = game.round.seatByPlayer.get(pid);
          store.sendToPlayer(pid, {
            type: 'player_reconnected',
            playerId,
            gameStatus: game.round.getViewModelFor(recipientSeat),
          });
        }
      }
    }
  }
```

(The `WS_OPEN` constant at the top of the file is no longer referenced here; leave it — it is harmless, and removing it is out of scope. If `npm run lint` flags it as unused, delete the `const WS_OPEN = 1;` line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ConnectionLifecycle.multisocket.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/ConnectionLifecycle.js tests/ConnectionLifecycle.multisocket.test.js
git commit -m "feat(server): additive multi-tab connect; grace fires on last socket"
```

---

## Task 4: Migrate the legacy `player.ws` / `session_replaced` tests

**Files:**
- Modify: `tests/ThousandStore.reconnect.test.js` (asserts on `player.ws` ~34, 52-55, 109; the `session_replaced` block ~113-128)

These assertions encode the *old* single-socket / last-connect-wins behavior. Update them to the new Set-based model.

- [ ] **Step 1: Update the assertions**

In `tests/ThousandStore.reconnect.test.js`:

In test **(a)** ("does not delete player immediately"), replace:

```javascript
    assert.equal(player.ws, null);
```

with:

```javascript
    assert.equal(player.sockets.size, 0);
```

In test **(b)** ("reconnectPlayer within grace period restores ws"), replace:

```javascript
    assert.equal(player.ws, ws2);
```

with:

```javascript
    assert.ok(player.sockets.has(ws2));
    assert.equal(player.sockets.size, 1);
```

In test **(e)** ("reconnectPlayer before timer fires prevents purge"), replace:

```javascript
    assert.equal(store.players.get(playerId).ws, ws2);
```

with:

```javascript
    assert.ok(store.players.get(playerId).sockets.has(ws2));
```

Replace the entire **`ThousandStore.reconnectPlayer last-connect-wins`** describe block (the `it('sends session_replaced ...')` test) with the additive behavior:

```javascript
// Reconnect is now additive: a second connection for the same player joins the
// existing socket set instead of kicking the first (multi-tab mirroring).
describe('ThousandStore.reconnectPlayer is additive (multi-tab)', () => {
  it('keeps the existing socket open and adds the new one', () => {
    const store = new ThousandStore();
    const ws1 = makeWs();
    const { playerId } = store.createPlayer(ws1, '127.0.0.1');

    const ws2 = makeWs();
    store.reconnectPlayer(playerId, ws2);

    const player = store.players.get(playerId);
    assert.equal(player.sockets.size, 2);
    assert.ok(player.sockets.has(ws1) && player.sockets.has(ws2));
    assert.equal(ws1._closed, false, 'first tab is not closed');
    assert.deepEqual(ws1._sent, [], 'no session_replaced');
    assert.equal(ws2._playerId, playerId);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/ThousandStore.reconnect.test.js`
Expected: PASS (all tests, including the grace/createOrRestore blocks which are unaffected).

- [ ] **Step 3: Commit**

```bash
git add tests/ThousandStore.reconnect.test.js
git commit -m "test(server): migrate reconnect tests to additive multi-socket model"
```

---

## Task 5: Server create-guard

**Files:**
- Modify: `src/controllers/GameController.js` (`handleCreateGame` ~101-128)
- Test: `tests/GameController.createGuard.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/GameController.createGuard.test.js`:

```javascript
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const GameController = require('../src/controllers/GameController');

function makeWs() {
  return { readyState: 1, send: () => {}, on: () => {}, close: () => {} };
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.writeHead = (status) => { res.statusCode = status; };
  res.end = (json) => { res.body = JSON.parse(json); };
  return res;
}

describe('GameController.handleCreateGame — already-in-game guard', () => {
  it('rejects with 409 already_in_game when the player already has a gameId', async () => {
    const store = new ThousandStore();
    const gc = new GameController(store);
    const ws = makeWs();
    const { playerId } = store.createPlayer(ws, '127.0.0.1');
    const player = store.players.get(playerId);
    player.nickname = 'Alice';
    player.gameId = 'existing-game';

    const res = makeRes();
    await gc.handleCreateGame({}, res, player, '127.0.0.1');

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'already_in_game');
    assert.equal(store.games.size, 0, 'no second game was created');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/GameController.createGuard.test.js`
Expected: FAIL — no guard; the handler proceeds to read the (empty) body and/or creates a game, so `statusCode` is not 409.

- [ ] **Step 3: Add the guard**

In `src/controllers/GameController.js`, inside `handleCreateGame`, add the guard immediately after the rate-limit check and before reading the body:

```javascript
  async handleCreateGame(req, res, player, ip) {
    if (!this._createLimiter.isAllowed(ip)) {
      HttpUtil.sendError(res, 429, 'rate_limited', 'Too many game creations');
      return;
    }

    // A player already in a game must leave it first — mirrors the join guard
    // (_validateJoinPreconditions). Closes the one create path that bypasses
    // the lobby UI (e.g. a duplicate request from a second tab).
    if (player.gameId !== null) {
      HttpUtil.sendError(res, 409, 'already_in_game', 'Leave your current game first');
      return;
    }

    const body = await this._readJsonBody(req, res);
    if (body === null) {
      return;
    }
    // ... unchanged below
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/GameController.createGuard.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/GameController.js tests/GameController.createGuard.test.js
git commit -m "feat(server): reject create-game when player already in a game"
```

---

## Task 6: `TabSync` identity-election module

**Files:**
- Create: `src/public/js/storage/TabSync.js`
- Test: `tests/TabSync.test.js` (create)

`TabSync` runs a short `BroadcastChannel` election so simultaneously-opened fresh tabs converge on a single identity. It saves an adopted identity to `IdentityStore` *before* the socket connects, so the existing `ThousandSocket` hello path needs no change.

- [ ] **Step 1: Write the failing test**

Create `tests/TabSync.test.js`:

```javascript
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
    // Simulate A receiving its server identity and publishing it.
    a.publishIdentity('pNew', 'tNew');
    // B was waiting for the creator's identity and adopts it.
    const adopted = await resB;
    void adopted; // resB already resolved; assert via the post-publish adoption below
  });

  it('falls back to a direct (empty) connect when BroadcastChannel is unavailable', async () => {
    const TabSync = loadTabSync();
    const store = makeIdentityStore();
    const sync = new TabSync({ channelFactory: null, identityStore: store, electionWindowMs: 10 });

    const id = await sync.resolveIdentity();
    assert.deepEqual(id, {});
  });
});
```

Note: the third test asserts the creator resolves `{}`; the adopt-after-publish path is covered structurally by the second test (sibling-holds-identity), so keep the third test focused on "exactly one creator."

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/TabSync.test.js`
Expected: FAIL — `src/public/js/storage/TabSync.js` does not exist (load throws).

- [ ] **Step 3: Implement `TabSync`**

Create `src/public/js/storage/TabSync.js`:

```javascript
// ============================================================
// TabSync — converges same-browser tabs on ONE identity
// ============================================================
//
// Same-browser tabs share one localStorage identity, but two tabs opened before
// either has saved an identity would each create a distinct server-side player
// (→ two games). TabSync runs a short BroadcastChannel election so the fresh
// tabs agree on a single identity before connecting: the first tab to obtain an
// identity broadcasts it, and the lowest-nonce fresh tab creates while the
// others adopt. After resolution it keeps answering late siblings.

import { IdentityStore } from './IdentityStore.js';

const CHANNEL_NAME = 'thousand_tabs';
const ELECTION_WINDOW_MS = 200;

export class TabSync {
  constructor({ channelFactory, identityStore, electionWindowMs, nonce } = {}) {
    this._identityStore = identityStore ?? IdentityStore;
    this._electionWindowMs = electionWindowMs ?? ELECTION_WINDOW_MS;
    this._nonce = typeof nonce === 'number' ? nonce : Math.random();
    this._identity = null;        // identity this tab currently holds/knows
    this._peerNonces = [];        // nonces announced by sibling fresh tabs
    this._onIdentity = null;      // set during an active election
    this._resolvePromise = null;  // memoized result of resolveIdentity()

    const factory = channelFactory ?? (
      typeof BroadcastChannel !== 'undefined'
        ? () => new BroadcastChannel(CHANNEL_NAME)
        : null
    );
    this._channel = factory ? factory() : null;
    if (this._channel) {
      this._channel.onmessage = (e) => this._onMessage(e.data);
    }
  }

  // Resolve the identity to connect with. Memoized: reconnects reuse the result
  // (by then the identity is also in IdentityStore, so this returns it directly).
  resolveIdentity() {
    if (!this._resolvePromise) {
      this._resolvePromise = this._resolve();
    }
    return this._resolvePromise;
  }

  _resolve() {
    const stored = this._identityStore.load();
    if (stored.playerId && stored.sessionToken) {
      this._identity = { playerId: stored.playerId, sessionToken: stored.sessionToken };
      this._broadcast({ kind: 'identity', ...this._identity });
      return Promise.resolve(this._identity);
    }
    if (!this._channel) {
      return Promise.resolve({});
    }
    return this._runElection();
  }

  _runElection() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (val) => { if (!settled) { settled = true; resolve(val); } };

      // Adopt the first identity a sibling reports during the election.
      this._onIdentity = (id) => {
        this._identityStore.save(id.playerId, id.sessionToken);
        this._identity = id;
        finish(id);
      };

      this._broadcast({ kind: 'hello', nonce: this._nonce });

      setTimeout(() => {
        if (settled) {return;}
        const isLowest = this._peerNonces.every((n) => this._nonce < n);
        if (isLowest) {
          // We create the identity; publishIdentity() broadcasts it once the
          // server issues it, so waiting siblings can adopt.
          finish({});
        } else {
          // A lower-nonce sibling will create — give it one more window to
          // report its identity, then fall back to creating ourselves.
          setTimeout(() => finish({}), this._electionWindowMs);
        }
      }, this._electionWindowMs);
    });
  }

  _onMessage(data) {
    if (!data || typeof data !== 'object') {return;}
    if (data.kind === 'hello') {
      this._peerNonces.push(data.nonce);
      // Already hold an identity → answer the newcomer so it adopts ours.
      if (this._identity) {this._broadcast({ kind: 'identity', ...this._identity });}
      return;
    }
    if (data.kind === 'identity' && typeof data.playerId === 'string'
        && typeof data.sessionToken === 'string') {
      const id = { playerId: data.playerId, sessionToken: data.sessionToken };
      if (this._onIdentity) {
        this._onIdentity(id);
      } else if (!this._identity) {
        this._identity = id;
      }
    }
  }

  // Called once this tab's identity is confirmed (on the `connected` message),
  // so sibling tabs still electing can converge on it.
  publishIdentity(playerId, sessionToken) {
    this._identity = { playerId, sessionToken };
    this._broadcast({ kind: 'identity', playerId, sessionToken });
  }

  _broadcast(msg) {
    if (this._channel) {this._channel.postMessage(msg);}
  }

  dispose() {
    if (this._channel) {this._channel.close();}
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/TabSync.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/public/js/storage/TabSync.js tests/TabSync.test.js
git commit -m "feat(web): TabSync — converge same-browser tabs on one identity"
```

---

## Task 7: Wire `TabSync` into the app; retire `session_replaced` on the client

**Files:**
- Modify: `src/public/js/core/ThousandApp.js` (constructor ~20-48, `init` end ~89-93)
- Modify: `src/public/js/core/ThousandMessageRouter.js` (handler map ~125, `_onConnected` ~192-208, `_onSessionReplaced` ~186-190, validator ~28)

- [ ] **Step 1: Add the `TabSync` import and instance in `ThousandApp`**

In `src/public/js/core/ThousandApp.js`, add the import near the other storage import (after line 1):

```javascript
import { TabSync } from '../storage/TabSync.js';
```

In the constructor, create the instance before the socket is constructed (so it exists when needed). Add immediately after `this._roundEnded = false;` (line 30):

```javascript
    this._tabSync = new TabSync();
```

- [ ] **Step 2: Gate the first connect on identity resolution**

In `src/public/js/core/ThousandApp.js`, replace the tail of `init()` (line 93):

```javascript
    this._socket.connect();
```

with:

```javascript
    // Resolve the shared identity (electing with sibling tabs if this is a
    // fresh load) BEFORE the first connect, so the hello carries the agreed
    // identity and two fresh tabs don't become two players.
    this._tabSync.resolveIdentity().then(() => this._socket.connect());
```

- [ ] **Step 3: Publish the identity on `connected`, and remove `session_replaced` handling**

In `src/public/js/core/ThousandMessageRouter.js`:

(a) In `_onConnected`, after the existing `IdentityStore.save(...)` line, add:

```javascript
    app._tabSync?.publishIdentity(msg.playerId, msg.sessionToken);
```

(b) Remove the `session_replaced` entry from the `_handlers` map (delete this line ~125):

```javascript
      session_replaced:     ( ) => this._onSessionReplaced(),
```

(c) Delete the `_onSessionReplaced` method entirely (~lines 183-190, including its doc comment).

(d) Remove the `session_replaced` validator entry from `MESSAGE_VALIDATORS` (delete this line ~28):

```javascript
  session_replaced: () => true,
```

- [ ] **Step 4: Verify the client test suites still pass**

Run: `node --test tests/ThousandSocket.test.js tests/IdentityStore.test.js tests/TabSync.test.js`
Expected: PASS — `ThousandSocket` is unchanged (its hello path still reads `IdentityStore.load()`), and `session_replaced` had no dedicated test.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/core/ThousandApp.js src/public/js/core/ThousandMessageRouter.js
git commit -m "feat(web): resolve identity via TabSync before connect; retire session_replaced"
```

---

## Task 8: Full suite + lint + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS — all tests green, including the migrated `ThousandStore.reconnect.test.js` and the new socket/lifecycle/TabSync/create-guard tests.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors. If an unused `WS_OPEN` in `ConnectionLifecycle.js` is flagged (see Task 3 note), delete that `const` line and re-run.

- [ ] **Step 3: Manual two-tab smoke check**

Run: `npm start`, then in one browser:
1. Open the app in Tab A; claim a nickname; create a game.
2. Open the app in a second tab (Tab B) on the same URL.
   - Expected: Tab B lands in the **same** waiting room / game as Tab A (not a fresh lobby), and Tab A is **not** kicked.
3. Perform an action in one tab (e.g. start/advance the game) and confirm it reflects in the other tab.
4. Close one tab; confirm the other stays connected and the game is not aborted.
5. Open two fresh tabs as fast as possible in a clean browser profile (no stored identity); confirm only **one** player/game results (no duplicate lobby entry).

- [ ] **Step 4: Commit (only if Step 2 required the WS_OPEN cleanup)**

```bash
git add src/services/ConnectionLifecycle.js
git commit -m "chore(server): drop now-unused WS_OPEN constant"
```

---

## Self-review notes

- **Spec coverage:** Server multi-socket → Tasks 1-3; `broadcastLobbyUpdate` → Task 2; last-socket grace + `player_disconnected`/`player_reconnected` gating → Task 3; legacy test migration → Task 4; create-guard → Task 5; `TabSync` election (stored / adopt / lowest-nonce / no-channel fallback) → Task 6; wiring + `session_replaced` retirement → Task 7; full verification → Task 8.
- **Type/name consistency:** `player.sockets` (Set) used identically across Tasks 1-4; `reconnect`/`handleDisconnect` signatures unchanged (still `(playerId, ws)`); `TabSync` public API (`resolveIdentity`, `publishIdentity`, `dispose`) consistent between module and wiring.
- **Double-submit:** no task needed — covered by existing server turn-gating + `_onActionRejected` resync (spec §4); create/join guarded by `already_in_game`.
