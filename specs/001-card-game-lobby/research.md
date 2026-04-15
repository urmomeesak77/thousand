# Research: Card Game 1000 — Lobby & Game Creation

**Date**: 2026-04-14 | **Branch**: `001-card-game-lobby`

## Decision 1: Real-Time Lobby Updates

**Decision**: WebSocket via the `ws` npm package.

**Rationale**: The lobby must reflect game state changes within 5 seconds (SC-003) without user-initiated refresh. Three options were evaluated:

| Option | Latency | Bidirectional | Extra Package | Notes |
|--------|---------|---------------|---------------|-------|
| Short polling (setInterval + fetch) | 3–10s | No | None | Meets latency bar at cost of constant requests; wastes server resources |
| Server-Sent Events (SSE) | < 1s | No (server→client only) | None | Works with raw `http`; sufficient for lobby phase but not game phase |
| WebSocket (`ws` package) | < 1s | Yes | `ws` | One protocol serves lobby and gameplay; justified by constitution "unless a feature genuinely needs them" |

WebSocket is chosen because the game phase (future feature) requires bidirectional communication. Establishing it now avoids a protocol swap mid-project. The `ws` package is the single external dependency.

**Alternatives rejected**:
- SSE: Would need a second protocol for gameplay; adds complexity later.
- Polling: Wastes resources; degraded experience under load.

---

## Decision 2: Player Session Identity

**Decision**: WebSocket connection ID as player identity. Nickname is provided on lobby load and passed with all HTTP actions.

**Rationale**: The spec assumes no accounts (see Assumptions). A per-connection UUID generated server-side when the WebSocket handshake completes is sufficient. No cookies, no tokens, no localStorage beyond the nickname preference.

**Alternatives rejected**:
- Cookie-based session: Adds server-side session management for no extra benefit at this scale.
- localStorage UUID: Works but requires client-side generation; connection ID is simpler and server-authoritative.

---

## Decision 3: Invite Code Generation

**Decision**: 6-character uppercase alphanumeric code generated with Node's built-in `crypto.randomBytes`.

**Rationale**: `crypto.randomBytes(3)` → hex string → uppercase gives 16^6 ≈ 16 million possibilities. At < 100 concurrent games collision probability is negligible. Server checks for uniqueness at creation time and retries if needed (effectively never). Zero external packages required.

**Format example**: `A3FX9C`

**Alternatives rejected**:
- UUID: Too long to share verbally or type manually.
- Sequential numbers: Guessable; would allow joining private games by incrementing.

---

## Decision 4: In-Memory State Management

**Decision**: Three `Map` objects (`games`, `players`, `inviteCodes`) encapsulated in a `ThousandStore` class (`src/services/ThousandStore.js`), with WebSocket connection handling co-located there.

**Rationale**: No persistence is required (games are ephemeral, no accounts). A `Map` supports O(1) lookup by ID and iteration for lobby listing. Grouping state + the WebSocket/broadcast logic into a single class keeps server.js thin and makes the store independently testable. This departs from the original "plain Map in server.js" plan but stays consistent with constitution Principle III — the class holds no business abstractions, just the Maps and the methods that operate on them together.

**State cleared**: Server restart clears all games. Acceptable for v1.

**Alternatives rejected**:
- Flat JSON file: Adds I/O complexity; no benefit without persistence requirement.
- Module-level Maps in server.js: Retained as the initial approach during design; moved into a class during implementation to allow dependency injection for tests.

---

## Decision 5: Maximum Players Per Game

**Decision**: 4 players maximum (spec assumption confirmed).

**Rationale**: The card game 1000 is traditionally played by 2–4 players. Setting `maxPlayers = 4` as the server constant allows flexibility without complicating the UI. The game is considered "waiting" until the host starts it or it fills.
