# Tasks: Card Game 1000 — Lobby & Game Creation

**Input**: Design documents from `specs/001-card-game-lobby/`
**Branch**: `001-card-game-lobby`
**Tests**: Required — minimum 90% coverage (frontend + backend, per constitution)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared dependency)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Path Conventions

Web app layout: `server.js`, `public/`, `tests/` at repository root.

---

## Phase 1: Setup

**Purpose**: Create project scaffold and install dependencies.

- [x] T001 Create `package.json` with `ws` (production) and `jsdom` (dev, for frontend tests) dependencies
- [x] T002 Create folder structure: `public/` and `tests/` directories at repo root
- [x] T003 [P] Create `public/lobby.html` skeleton (doctype, meta viewport, linked CSS/JS, empty body)
- [x] T004 [P] Create `public/lobby.css` skeleton (CSS reset, responsive viewport meta, mobile-first base)
- [x] T005 [P] Create `public/lobby.js` skeleton (DOMContentLoaded wrapper, placeholder comments)
- [x] T006 [P] Create `server.js` skeleton (require http/ws/crypto, port constant, empty request handler)
- [x] T007 [P] Create `tests/server.test.js` skeleton (node:test imports, describe blocks matching HTTP contract)
- [x] T008 [P] Create `tests/lobby.test.js` skeleton (node:test + jsdom setup, describe blocks matching US1–3)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core server infrastructure and shared in-memory state that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T009 Implement static file server in `server.js` — serve `public/` files by path, set correct `Content-Type` headers, return 404 for unknown paths
- [x] T010 Initialize in-memory state in `server.js`: `const games = new Map()`, `const players = new Map()`, `const inviteCodes = new Map()`
- [x] T011 Implement WebSocket server upgrade in `server.js` — attach `ws.WebSocketServer` to the HTTP server on `handleUpgrade`, assign UUID player ID on connect, register player in `players` map, remove player on close
- [x] T012 Implement JSON request body parser helper in `server.js` — reads `req` stream, returns parsed object; used by all POST handlers
- [x] T013 [P] Implement JSON response helpers in `server.js` — `sendJSON(res, status, body)`, `sendError(res, status, code, message)`

**Checkpoint**: Server starts, serves `lobby.html`, accepts WebSocket connections, state maps initialized.

---

## Phase 3: User Story 1 — Join a Random Game (Priority: P1) 🎯 MVP

**Goal**: Player enters nickname, sees a list of public waiting games, clicks Join, enters the game.

**Independent Test**: Open `http://localhost:3000`, enter a nickname, see game list (empty or populated). In a second tab, create a game via `POST /api/games`; first tab sees it. Click Join → game screen (or "Game is full" if race).

### Tests for User Story 1

> **Write these first — verify they FAIL before implementing**

- [x] T014 [P] [US1] Write `GET /api/games` test in `tests/server.test.js` — assert response is 200 JSON with `games` array, only public+waiting games included, no `inviteCode` field exposed
- [x] T015 [P] [US1] Write `POST /api/games/:id/join` tests in `tests/server.test.js` — 200 on success, 404 on missing game, 409 on full game, 409 on private game
- [x] T016 [P] [US1] Write lobby game-list render test in `tests/lobby.test.js` — jsdom renders `lobby.html`, inject `lobby_update` message, assert correct number of game rows appear in DOM

### Implementation for User Story 1

- [x] T017 [P] [US1] Implement `GET /api/games` handler in `server.js` — filter `games` map to `type=public, status=waiting`, return `[{ id, playerCount, maxPlayers }]`
- [x] T018 [P] [US1] Implement `POST /api/games/:id/join` handler in `server.js` — validate game exists + is public + has a seat; add player; return `{ gameId }`; respond 404/409 on failures
- [x] T019 [US1] Build `public/lobby.html` — nickname form section, empty game list `<ul id="game-list">`, Join buttons per row; no inline JS or CSS
- [x] T020 [US1] Build `public/lobby.css` — responsive layout using CSS Grid/Flexbox; mobile-first breakpoints (`max-width: 480px`, `max-width: 768px`); minimum 44px touch targets for buttons; relative units throughout (rem/em/%)
- [x] T021 [US1] Implement `public/lobby.js` — nickname submission, `POST /api/games/:id/join` on Join click, render `game_list` section, handle 409 "Game is full" error toast

**Checkpoint**: US1 fully functional. A player can open the app, enter a nickname, and join a public game.

---

## Phase 4: User Story 2 — Create Private Game + Invite Code (Priority: P2)

**Goal**: Player creates a private game, receives an invite code, friend enters the code to join — private game never appears in public lobby.

**Independent Test**: Player A creates a private game → receives code `A3FX9C`. Player B opens lobby — game does NOT appear in list. Player B enters code → both are in the same game. `GET /api/games` never shows private games.

### Tests for User Story 2

> **Write these first — verify they FAIL before implementing**

- [x] T022 [P] [US2] Write `POST /api/games` tests in `tests/server.test.js` — 201 on public (no inviteCode in response), 201 on private (inviteCode present, 6-char uppercase alphanum), 400 on missing fields
- [x] T023 [P] [US2] Write `POST /api/games/join-invite` tests in `tests/server.test.js` — 200 on valid code, 404 on unknown code, 409 on full game
- [x] T024 [P] [US2] Write private-game-not-in-lobby test in `tests/server.test.js` — create private game, assert `GET /api/games` returns empty array
- [x] T025 [P] [US2] Write frontend create-game modal test in `tests/lobby.test.js` — jsdom clicks "New Game", modal appears with Public/Private choice; select Private; assert invite code section renders after creation

### Implementation for User Story 2

- [x] T026 [P] [US2] Implement invite code generator in `server.js` — `crypto.randomBytes(3).toString('hex').toUpperCase()`, retry loop checks `inviteCodes` map for uniqueness
- [x] T027 [P] [US2] Implement `POST /api/games` handler in `server.js` — parse `{ type, nickname }`, create game with generated ID, for private games generate + store invite code, add host as first player, return `{ gameId, inviteCode }`
- [x] T028 [US2] Implement `POST /api/games/join-invite` handler in `server.js` — look up invite code in `inviteCodes` map, validate game has a seat + is waiting, add player, return `{ gameId }`
- [x] T029 [US2] Add "New Game" button + modal to `public/lobby.html` — Public/Private radio, confirm button, invite code display section, "Join with Code" input + button
- [x] T030 [US2] Style modal + invite code section in `public/lobby.css` — overlay modal centered on all screen sizes, responsive form inputs, copy-button affordance for invite code
- [x] T031 [US2] Implement create-game + join-invite flows in `public/lobby.js` — open modal, POST to create, display invite code; handle join-invite POST, route to game on success

**Checkpoint**: US1 + US2 both work. Host can create a private game, share the code, and friend can join. `GET /api/games` never leaks private games.

---

## Phase 5: User Story 3 — Real-Time Lobby Updates (Priority: P3)

**Goal**: Lobby game list updates automatically within 5 seconds when any game opens, fills, or closes — no manual refresh needed.

**Independent Test**: Open two browser tabs on `/`. Tab 1 creates a game via the UI — Tab 2 sees it appear within 5 seconds without reload. Tab 1 joins the game — Tab 2 sees it disappear.

### Tests for User Story 3

> **Write these first — verify they FAIL before implementing**

- [x] T032 [P] [US3] Write `lobby_update` broadcast test in `tests/server.test.js` — connect two WebSocket clients, have one trigger a game change via HTTP, assert both receive `lobby_update` with updated list within 1 second
- [x] T033 [P] [US3] Write player-disconnect cleanup test in `tests/server.test.js` — connect host WS, create game, disconnect host WS, assert game removed from `games` map and `GET /api/games` returns empty

### Implementation for User Story 3

- [x] T034 [US3] Implement `broadcastLobbyUpdate()` helper in `server.js` — iterate `players` map, find all clients with `gameId === null` (in lobby), send `{ type: "lobby_update", games: [...] }` to each open socket
- [x] T035 [US3] Wire `broadcastLobbyUpdate()` calls in `server.js` — call after: game created, player joins game, game deleted
- [x] T036 [US3] Implement player-disconnect handler in `server.js` — if player was host of a `waiting` game with no other players: delete game + clean up `inviteCodes` entry; call `broadcastLobbyUpdate()`
- [x] T037 [US3] Send initial `lobby_update` on WebSocket connect in `server.js` — immediately push current public waiting games to newly connected client
- [x] T038 [US3] Handle `lobby_update` message in `public/lobby.js` — diff incoming games list against rendered DOM, add/remove rows without full re-render

**Checkpoint**: All three user stories functional. Lobby stays live across multiple tabs.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Error states, validation, edge cases, and final quality pass.

- [x] T039 [P] Implement nickname validation in `server.js` — reject blank or < 3 / > 20 char nicknames on all POST endpoints with 400 `invalid_request`
- [x] T040 [P] Implement race-condition guard in `server.js` — re-check seat count inside join handler after lock (check game still `waiting` and not full before mutating)
- [x] T041 [P] Implement `game_joined` WS message dispatch in `server.js` — after HTTP join succeeds, find player's WS connection by ID and send `{ type: "game_joined", gameId, players }`
- [x] T042 [P] Implement `player_joined` WS broadcast in `server.js` — when a second+ player joins, notify all existing players in that game
- [x] T043 [P] Add error toast display in `public/lobby.js` — show `error.message` for WS error messages and failed HTTP responses; auto-dismiss after 4 seconds
- [x] T044 [P] Add empty-state message in `public/lobby.html` + `public/lobby.js` — "No open games yet. Create one!" shown when `lobby_update` arrives with empty array
- [x] T045 [P] Style error toasts and empty state in `public/lobby.css` — accessible color contrast, visible on all screen sizes
- [x] T046 Run coverage report (`node --test --experimental-test-coverage tests/*.test.js`) — verify ≥ 90% line coverage for `server.js` and `public/lobby.js`
- [x] T047 End-to-end validation per `quickstart.md` — `npm install && node server.js`, manually test all three user stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — all T001–T008 can start immediately
- **Foundational (Phase 2)**: Requires Phase 1 complete — blocks all user story work
- **User Stories (Phase 3–5)**: All require Phase 2 complete; can proceed in priority order or in parallel
- **Polish (Phase 6)**: Requires all user story phases complete

### User Story Dependencies

- **US1 (P1)**: Requires Foundational only — no inter-story dependencies
- **US2 (P2)**: Requires Foundational — independent of US1 (different endpoints + UI sections)
- **US3 (P3)**: Requires Foundational — depends on US1 game creation being in place (game list must exist to broadcast)

### Within Each User Story

- Tests (`T0xx [US?]`) → write first, confirm they fail
- Server handlers → before client JS (contract-first)
- HTML structure → before CSS and JS
- Core happy-path → before error handling (Phase 6)

### Parallel Opportunities

All tasks marked `[P]` within the same phase can run simultaneously. Key opportunities:

- **Phase 1**: T003–T008 all parallel (separate files)
- **Phase 2**: T012 + T013 parallel (helpers vs state)
- **US1 tests**: T014 + T015 + T016 all parallel
- **US1 implementation**: T017 + T018 parallel (different endpoints)
- **US2 tests**: T022–T025 all parallel
- **US2 implementation**: T026 + T027 parallel

---

## Parallel Example: User Story 1

```bash
# Tests (write first, verify fail):
Task T014: GET /api/games test → tests/server.test.js
Task T015: POST /api/games/:id/join tests → tests/server.test.js
Task T016: lobby game-list render test → tests/lobby.test.js

# Server handlers (parallel):
Task T017: GET /api/games handler → server.js
Task T018: POST /api/games/:id/join handler → server.js

# Frontend (sequential within — HTML before CSS/JS):
Task T019: lobby.html structure
Task T020: lobby.css responsive styles
Task T021: lobby.js join flow
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 (tests → server handlers → HTML → CSS → JS)
4. **STOP and VALIDATE**: `npm install && node server.js` — join a game manually
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational → server boots, serves static files
2. US1 complete → player can join public games (MVP)
3. US2 complete → player can create private games + invite
4. US3 complete → lobby updates live without refresh
5. Polish → error handling, coverage gate, edge cases

---

## Notes

- `[P]` = different files, can run in parallel without merge conflicts
- `[USn]` = traceability to user story n from spec.md
- Tests must be written **before** implementation and confirmed failing
- Coverage gate: `≥ 90%` for `server.js` + `public/lobby.js` (T046)
- Touch target minimum: 44px height/width (constitution VI — responsive)
- Commit after each phase checkpoint
