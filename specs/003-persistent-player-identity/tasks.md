# Tasks: Persistent Player Identity

**Input**: Design documents from `/specs/003-persistent-player-identity/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ws-messages.md ✓, quickstart.md ✓

**Organization**: Grouped by user story. US1 (P1) = refresh restores identity; US2 (P2) = reconnect after disconnect; US3 (P3) = no cross-browser impersonation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in same phase)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend the existing data model and scaffold new class files before any story work begins.

- [X] T001 Extend PlayerRecord in `ThousandStore.createPlayer` to initialise three new fields — `ws` (keep existing assignment), `disconnectedAt: null`, `graceTimer: null` — in `src/services/ThousandStore.js`. **Precondition**: verify `createPlayer` already emits `playerId` and `sessionToken` (FR-001). If `sessionToken` is missing, generate it inline using `crypto.randomUUID()` (the `crypto` module is already imported per plan.md Technical Context) and include it in the returned record before adding the three new fields.
- [X] T002 [P] Create `IdentityStore` class in `src/public/js/IdentityStore.js` with three **static** methods (the class has no instance state — its only "state" is the localStorage entry, which is already a singleton): `static save(playerId, sessionToken, nickname)` writes `{playerId,sessionToken,nickname}` as JSON to `localStorage.thousand_identity`; `static load()` returns parsed object or `{}` if key absent/invalid; `static clear()` removes the key. Callers use class-name access: `IdentityStore.load()`, `IdentityStore.save(...)`, `IdentityStore.clear()`. Note: `clear()` has no application caller in this feature — it is a debug/manual-reset utility kept for symmetry with `save`/`load` and for use from devtools when reproducing first-visit flows.
- [X] T003 [P] Create `ReconnectOverlay` class in `src/public/js/ReconnectOverlay.js` with a constructor accepting a DOM element reference, and `show()` / `hide()` methods that toggle a `hidden` class on that element

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the `hello` handshake end-to-end — server credential validation + client credential sending. All user stories require this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add `createOrRestorePlayer(ws, clientIp, playerId, sessionToken)` to `ThousandStore` in `src/services/ThousandStore.js` — if `playerId` exists in `this.players` and `player.sessionToken === sessionToken`, return `{ playerId, sessionToken, restored: true, nickname: player.nickname, gameId: player.gameId }`; otherwise call `createPlayer(ws, clientIp)` and return `{ playerId, sessionToken, restored: false, nickname: null, gameId: null }`. Note: `this.players` contains both connected AND grace-period players (ws=null); the lookup correctly restores either. Do not assign `ws` to the player record here — that is `reconnectPlayer`'s responsibility (T022).
- [X] T005 Refactor `ConnectionManager.handleConnection` in `src/services/ConnectionManager.js` — remove the immediate `createPlayer` + `ws.send('connected')` call; instead start a 5-second timeout (store handle on `ws._helloTimer`) that closes the socket with code 1008 if no `hello` message arrives; keep all other setup (ip count, clients set, isAlive, pong, close handler) structurally unchanged for now — the close handler is updated in T009 (last task of Phase 2) to cancel `ws._helloTimer` and use `ws._playerId`
- [X] T006 Add `hello` handling to `ConnectionManager._handleMessage` in `src/services/ConnectionManager.js` — on first `hello`: cancel `ws._helloTimer`, call `this._store.createOrRestorePlayer(ws, clientIp, msg.playerId, msg.sessionToken)`, set `ws._playerId = result.playerId`, send `{ type: 'connected', playerId, sessionToken, restored, nickname }`, then send `{ type: 'lobby_update', games }`; guard against duplicate hello by checking `ws._playerId` is not already set
- [X] T007 Update `MESSAGE_VALIDATORS` in `src/public/js/ThousandApp.js` — extend `connected` validator to also accept `restored` (boolean) and `nickname` (string or null); add `session_replaced` validator returning `true`
- [X] T008 Update `ThousandSocket.connect()` in `src/public/js/ThousandSocket.js` — import `IdentityStore`; in `ws.onopen`, send `JSON.stringify({ type: 'hello', ...IdentityStore.load() })` (spreads `playerId`/`sessionToken` if present, harmlessly spreads empty object on first visit)
- [X] T009 Update close handler in `ConnectionManager.handleConnection` in `src/services/ConnectionManager.js` — (a) add `clearTimeout(ws._helloTimer)` at the top of the close callback to prevent the hello timeout firing on a dead socket; (b) change `this._store.handlePlayerDisconnect(playerId)` to `this._store.handlePlayerDisconnect(ws._playerId)` — `ws._playerId` is set in T006 for players who completed the hello handshake; `undefined` for clients that disconnected before hello, which `handlePlayerDisconnect` ignores safely

**Checkpoint**: Server accepts `hello`, validates/creates identity, sends `connected { restored, nickname }`. Client sends credentials on every connect.

---

## Phase 3: User Story 1 — Refresh Restores Identity (Priority: P1) 🎯 MVP

**Goal**: Player refreshes the page; sees "Reconnecting…" overlay immediately; overlay dismisses and nickname + lobby are restored within 2 seconds.

**Independent Test**: Open lobby, enter nickname, refresh page. "Reconnecting…" overlay appears, then disappears, and the player's nickname is visible in the lobby within 2 seconds.

### Tests for User Story 1

- [X] T010 [P] [US1] Write `tests/ThousandStore.reconnect.test.js` — three cases: (a) `createOrRestorePlayer` with unknown playerId → `restored: false`; (b) known playerId + matching token → `restored: true`, nickname preserved; (c) known playerId + wrong token → `restored: false`, original player record unchanged

- [X] T011 [P] [US1] Write `tests/ConnectionManager.hello.test.js` — test `handleConnection` + hello flow using a mock ws: (a) no hello within 5 s → socket closed 1008; (b) hello with no creds → `connected { restored: false }` sent; (c) hello with valid creds → `connected { restored: true, nickname }` sent; (d) duplicate hello ignored; (e) **SC-001 timing assertion** — measure elapsed time between server receipt of a valid `hello` and dispatch of `connected`; assert < 2000 ms (server-side budget; full client-perceived budget verified manually in quickstart)

### Implementation for User Story 1

- [X] T017 [US1] Import `IdentityStore` and `ReconnectOverlay` at the top of `src/public/js/ThousandApp.js` (must precede T014–T016 since they reference both classes)
- [X] T012 [P] [US1] Add reconnect overlay element to `src/public/index.html` — a `<div id="reconnect-overlay" class="hidden">` containing a `<p>Reconnecting…</p>` message, placed before the `#nickname-screen` div
- [X] T013 [P] [US1] Add reconnect overlay styles to `src/public/css/index.css` — `#reconnect-overlay`: fixed fullscreen, dark semi-transparent background, centred message text; use existing CSS variable palette; responsive (works on mobile)
- [X] T014 [US1] Wire `ReconnectOverlay` in `ThousandApp.init()` in `src/public/js/ThousandApp.js` — instantiate `new ReconnectOverlay($('reconnect-overlay'))`; before calling `this._socket.connect()`, call `this._reconnectOverlay.show()` if `IdentityStore.load().playerId` is truthy; otherwise leave hidden
- [X] T015 [US1] Handle `restored: true` in `ThousandApp._handleMessage('connected')` in `src/public/js/ThousandApp.js` — call `IdentityStore.save(msg.playerId, msg.sessionToken, msg.nickname)`, set `this._nickname = msg.nickname`, update `#player-name-display`, call `this._reconnectOverlay.hide()`, call `this._showScreen('lobby-screen')`, call `this._gameList.startElapsedTimer()`
- [X] T016 [US1] Handle `restored: false` in `ThousandApp._handleMessage('connected')` in `src/public/js/ThousandApp.js` — call `IdentityStore.save(msg.playerId, msg.sessionToken, null)`, call `this._reconnectOverlay.hide()` (noop if never shown), call `this._showScreen('nickname-screen')`; also update existing token/api wiring (`this._playerId`, `this._sessionToken`, `this._api.setSessionToken`)

**Checkpoint**: User Story 1 is fully functional. Refresh restores nickname and shows lobby correctly.

---

## Phase 4: User Story 2 — Reconnect After Temporary Disconnect (Priority: P2)

**Goal**: Player's WS drops; reconnects within 30 s; nickname and game membership fully restored.

**Independent Test**: Disconnect WS (e.g. server restart or network blip simulation), wait under 30 s, reconnect. Player record intact; if player was in a game, game screen is restored.

### Tests for User Story 2

- [X] T018 [P] [US2] Extend `tests/ThousandStore.reconnect.test.js` with grace period tests — (a) `handlePlayerDisconnect` starts timer, does not immediately delete record; (b) `reconnectPlayer` within grace period → record restored, timer cancelled, `ws` updated; (c) grace timer expiry → player record deleted, lobby updated; (d) player in game: expiry removes player from game and calls `_resolveGameAfterExit`; (e) race condition: call `reconnectPlayer` synchronously before the grace timer fires (use fake timers) — verify player is restored, `clearTimeout` prevents the purge from running, and the player record is intact after the timer would have fired

- [X] T019 [P] [US2] Extend `tests/ThousandStore.reconnect.test.js` with last-connect-wins test — `reconnectPlayer` called when player already has live ws → `session_replaced` sent to old ws, old ws closed, new ws attached

### Implementation for User Story 2

- [X] T020 [US2] Add `_purgePlayer(playerId)` private method to `ThousandStore` in `src/services/ThousandStore.js` — contains the delete-and-notify logic currently in `handlePlayerDisconnect` (delete from map, resolve game exit via `_resolveGameAfterExit`). The existing `_resolveGameAfterExit` → `broadcastLobbyUpdate()` path is what makes remaining lobby members see the removal — satisfies FR-006 (lobby player list updates passively, no notification banner).
- [X] T021 [US2] Add `_gracePeriodMs` to `ThousandStore` constructor in `src/services/ThousandStore.js` — default `process.env.GRACE_PERIOD_MS ? Number(process.env.GRACE_PERIOD_MS) : 30_000`. Must precede T022 (timer references this field).
- [X] T022 [US2] Rewrite `ThousandStore.handlePlayerDisconnect(playerId)` in `src/services/ThousandStore.js` — early-return if `!playerId || !this.players.has(playerId)` (handles pre-hello disconnects passed `undefined` from T009); otherwise set `player.ws = null`, `player.disconnectedAt = Date.now()`; start `setTimeout(() => this._purgePlayer(playerId), this._gracePeriodMs)` stored as `player.graceTimer`; do NOT delete the record immediately
- [X] T023 [US2] Add `reconnectPlayer(playerId, ws)` to `ThousandStore` in `src/services/ThousandStore.js` — cancel `player.graceTimer` via `clearTimeout`, reset `disconnectedAt` to null, assign new `ws`, and set `ws._playerId = player.id` (required by the close handler in T009 to identify this player on future disconnect); if `player.ws` was already open (readyState OPEN), send `{ type: 'session_replaced' }` and close it first (last-connect-wins)
- [X] T024 [US2] Update `ConnectionManager._handleMessage` hello branch in `src/services/ConnectionManager.js` — when `result.restored === true`, call `this._store.reconnectPlayer(result.playerId, ws)` (T023) to attach the new ws and cancel any grace timer; then send `connected`
- [X] T025 [US2] After sending `connected` for a restored player in `ConnectionManager._handleMessage` in `src/services/ConnectionManager.js` — if `result.gameId` is set, look up the game in `this._store.games`, compose and send `{ type: 'game_joined', gameId, players: this._store.serializePlayers(game), createdAt: game.createdAt }` to restore the game screen
- [X] T026 [US2] Handle `session_replaced` in `ThousandApp._handleMessage` in `src/public/js/ThousandApp.js` — show toast "Connected from another tab or browser — this session ended." (covers both same-browser multi-tab per Edge Cases and cross-browser transfer per US3 acceptance scenario 2).

**Checkpoint**: User Stories 1 + 2 both work. Grace period preserves game seat on reconnect.

---

## Phase 5: User Story 3 — No Cross-Browser Impersonation (Priority: P3)

**Goal**: Submitting a valid playerId with a wrong token never grants access to the original player's state; a fresh identity is issued instead.

**Independent Test**: Submit a known playerId with a wrong sessionToken via a custom hello message. Server sends `connected { restored: false }` with a new identity; original player's nickname and game seat unchanged.

### Tests for User Story 3

- [X] T027 [P] [US3] Write `tests/IdentityStore.test.js` using jsdom — test `save()` writes correct JSON; `load()` returns parsed object; `load()` returns `{}` on missing key; `load()` returns `{}` on corrupted JSON; `clear()` removes key; `save()` overwrites previous value. Note: SC-005 (incognito window always yields a distinct identity) is behaviorally guaranteed by the browser scoping localStorage per storage context; the `load()` returns `{}` on missing key case is the equivalent code path.

- [X] T028 [P] [US3] Add security edge-case tests to `tests/ThousandStore.reconnect.test.js` — (a) valid playerId + wrong token → new playerId issued, original record untouched; (b) valid playerId + valid token but player in grace period → reconnect succeeds; (c) playerId present in hello but sessionToken absent → new identity

### Implementation for User Story 3

- [X] T029 [US3] Add type-guard at the top of `ThousandStore.createOrRestorePlayer` in `src/services/ThousandStore.js` — if `typeof playerId !== 'string' || typeof sessionToken !== 'string'`, skip the Map lookup and call `createPlayer(ws, clientIp)` directly. This prevents prototype-pollution-style payloads (e.g. `{playerId: {}, sessionToken: {}}`) from short-circuiting the lookup branch. **Precondition** (verify before editing — already holds in current code from T004): token comparison in `createOrRestorePlayer` uses strict equality (`===`).

**Checkpoint**: All three user stories functional. Identity theft attempt returns a fresh identity, never the target player's state.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T030 Execute the manual quickstart procedure (`specs/003-persistent-player-identity/quickstart.md`) end-to-end to verify SC-001's client-perceived 2-second budget — measure wall-clock time from page reload to overlay dismissal + lobby render, with `Throttling: Fast 3G` set in DevTools Network. Record the observed time in the PR description; if > 2000 ms, file a follow-up task before merge.
- [X] T031 [P] Run `npm run lint` and fix any ESLint errors introduced by new/modified files
- [X] T032 Run `npm test -- --experimental-test-coverage` and confirm line coverage ≥ 90% per constitution; add targeted tests to close any gaps found — **91% line coverage achieved** (added ConnectionManager heartbeat/IP-limit/rate-limit/game-restoration tests + RateLimiter tests; 95 total tests, 0 failures)
- [X] T033 §IX follow-up — measure final line count of `src/services/ThousandStore.js`. If > 200 lines (per plan.md Known Risks signal), extract session-lifecycle methods (`createOrRestorePlayer`, `reconnectPlayer`, `_purgePlayer`, `_gracePeriodMs`) into a new `PlayerRegistry` class at `src/services/PlayerRegistry.js`, and have `ThousandStore` delegate. Otherwise, document the line count in the PR description and close the signal as accepted. — **194 lines (≤ 200); signal accepted, no extraction needed**
- [X] T034 §IX follow-up — measure the line count of the `hello` branch in `ConnectionManager._handleMessage` after T006 + T024 + T025. If > 20 lines, extract a private `_handleHello(ws, msg)` method on `ConnectionManager` and replace the inline body with a single call. Otherwise, document the line count in the PR description and close the signal as accepted. — **20 lines (not > 20); signal accepted, no extraction needed**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately; T002 and T003 are parallel
- **Phase 2 (Foundational)**: Depends on Phase 1 — T004 → T005 → T006 → T009 (sequential ConnectionManager pipeline); T007, T008 can run in parallel with the T004–T009 pipeline once T001–T003 complete
- **Phase 3 (US1)**: Depends on Phase 2 complete — T017 first (imports), then T012/T013 in parallel, then T014, then T015 → T016 sequential in ThousandApp
- **Phase 4 (US2)**: Depends on Phase 2 complete — T020 → T021 (constructor field) → T022 (handlePlayerDisconnect) → T023 (reconnectPlayer) sequential in ThousandStore; T024–T025 depend on T023
- **Phase 5 (US3)**: Depends on Phase 2 complete — T029 (type-guard) sequential in `createOrRestorePlayer`; T027, T028 are parallel with T029
- **Phase 6 (Polish)**: Depends on all story phases complete; T030 (manual SC-001 verification) runs once US1 frontend is in place; T033 and T034 (decomposition signals) run last

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 — no dependency on US2 or US3
- **US2 (P2)**: Depends on Phase 2 — no dependency on US1 (backend-only changes); can run in parallel with US1 frontend work
- **US3 (P3)**: Depends on Phase 2 — no dependency on US1 or US2

### Parallel Opportunities per Phase

**Phase 2**: T007, T008 (different files: ThousandApp.js, ThousandSocket.js) run in parallel after T001–T003 complete; T004 → T005 → T006 → T009 remain sequential (ThousandStore.js → ConnectionManager.js pipeline).

**Phase 3**: T010, T011 (test files) parallel; T012, T013 (HTML, CSS) parallel with each other and with T010/T011; T017 → T014 → T015 → T016 are sequential changes to ThousandApp.js (T017 first because T014–T016 reference the imported classes).

**Phase 4**: T018, T019 (test extensions) parallel; T020 → T021 → T022 → T023 sequential (ThousandStore); T024, T025, T026 after T023.

**Phase 5**: T027, T028 parallel; T029 sequential after T004 (same file/method).

---

## Parallel Example: Phase 2

```bash
# Sequential (same file, dependent):
T004 → T005 → T006 → T009  (ThousandStore.js → ConnectionManager.js)

# Parallel (different files, no deps on T004–T009 pipeline):
T007  src/public/js/ThousandApp.js       MESSAGE_VALIDATORS update
T008  src/public/js/ThousandSocket.js    send hello on open
```

## Parallel Example: US1 vs US2

Once Phase 2 is complete, US1 (frontend: overlay, ThousandApp) and US2 (backend: grace period, game restoration) touch different files and can be worked in parallel:

```bash
# US1 — frontend focus:
T012, T013  HTML + CSS (parallel)
T017 → T014 → T015 → T016  ThousandApp.js (sequential — imports first)

# US2 — backend focus (parallel with US1):
T020 → T021 → T022 → T023  ThousandStore.js (sequential)
T024 → T025  ConnectionManager.js (sequential)
T026  ThousandApp.js (after US1 imports/T017 + T015–T016 land)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004 → T005 → T006 → T009 pipeline + T007/T008 parallel) — CRITICAL
3. Complete Phase 3: User Story 1 (T010, T011 tests + T017 → T012/T013 → T014 → T015 → T016)
4. **STOP and VALIDATE**: Refresh the lobby page; confirm overlay, nickname restoration, lobby screen
5. Ship if sufficient; US2 and US3 can follow

### Incremental Delivery

1. Phase 1 + Phase 2 → handshake working
2. Phase 3 (US1) → refresh works → deploy/demo MVP
3. Phase 4 (US2) → network disconnect + grace period → deploy
4. Phase 5 (US3) + Phase 6 → security hardened + coverage checked → final release

---

## Notes

- `[P]` tasks operate on different files with no cross-task dependencies at the same phase level
- Tests tagged `[P]` can be written simultaneously with implementation tasks (different files)
- The `hello` timeout (T005) MUST be implemented or all clients will wait forever — do not skip
- Grace period timer handles are stored on the player record; always `clearTimeout` on reconnect to avoid double-purge
- `IdentityStore` is a pure localStorage wrapper — no DOM events; §XI Antlion compliance is not required for it
- WS property assignments (`ws.onopen`, `ws.onmessage`) in `ThousandSocket` are not `addEventListener` calls — §XI compliant
