# Research: Persistent Player Identity

## Decision 1: WS handshake — client-first hello vs server-issued identity

**Decision**: Client sends `{ type: 'hello', playerId?, sessionToken? }` as first WS message; server waits for it before issuing/restoring identity.

**Rationale**: If the server issues a new identity immediately on connect (current behavior), there is a window where the client receives a fresh identity before it can present its stored credentials. Client-first hello eliminates this race: server defers `createOrRestorePlayer` until it receives the first message.

**Alternatives considered**:
- Server sends challenge → client responds: extra round-trip; unnecessary for this threat model
- Credentials in WS URL query string: exposes token in server access logs and browser history
- Credentials in HTTP `Authorization` header during WS upgrade: requires auth middleware; overkill for LAN scope

---

## Decision 2: Grace period timer mechanism

**Decision**: `setTimeout` stored on the player record, started in `ThousandStore.handlePlayerDisconnect`, cancelled in `reconnectPlayer`.

**Rationale**: One timer per disconnected player. No external scheduler. Cancels cleanly on reconnect. Fires a cleanup lambda that removes the record and notifies any affected game.

**Alternatives considered**:
- Periodic scan loop (e.g. every 5 s): wastes cycles; accuracy is ±interval; harder to test
- Redis TTL / DB expiry: adds external dependency; conflicts with in-memory architecture (§III)

---

## Decision 3: Session token security

**Decision**: `crypto.randomUUID()` (128-bit UUID v4) for both `playerId` and `sessionToken`.

**Rationale**: Already used in `ThousandStore.createPlayer`. UUID v4 has 122 bits of entropy, making brute-force guessing infeasible in a LAN context with <100 concurrent players.

**Alternatives considered**:
- `crypto.randomBytes(32).toString('hex')` (256-bit): stronger but unnecessary for this threat model
- Short alphanumeric codes: guessable within seconds

---

## Decision 4: localStorage key structure

**Decision**: Single key `thousand_identity` → JSON `{ playerId, sessionToken, nickname }`.

**Rationale**: Single `getItem` / `setItem` round-trip. `nickname` cached locally so the UI can display the player's name immediately on reload, before the server confirms identity (avoids a blank-name flash during the reconnect overlay).

**Alternatives considered**:
- Separate keys per field: three reads/writes instead of one
- IndexedDB: async API; overkill for three string fields

---

## Decision 5: Game state restoration after reconnect

**Decision**: Server sends the existing `game_joined` message immediately after `connected` when a reconnecting player's `gameId` is non-null.

**Rationale**: Zero new client-side handling. `game_joined` already carries `gameId`, `players`, and `createdAt`. The existing `_handleMessage('game_joined')` in `ThousandApp` already transitions the UI to the game screen.

**Alternatives considered**:
- New `game_state` message type: redundant with `game_joined`; adds a dead code path on the client
- Include game data in `connected`: bloats the handshake; couples identity and game protocols

---

## Decision 6: Multi-tab last-connect-wins

**Decision**: On a new `hello` with valid credentials for a player who already has a live WS connection — send `{ type: 'session_replaced' }` to the old ws, close it, then attach the new ws to the player record.

**Rationale**: Spec requires last-connect-wins (FR-007). Sending `session_replaced` before close gives the old tab a clean signal to show a toast rather than silently losing connection.

**Alternatives considered**:
- Reject second connection: conflicts with FR-007; breaks mobile tab-restore scenarios where the old tab's WS may still be technically open

---

## Decision 7: Reconnecting overlay

**Decision**: `ReconnectOverlay.js` class — shown on page load if `IdentityStore` has stored credentials; dismissed when the `connected` message arrives (whether `restored: true` or `restored: false`).

**Rationale**: Show-on-load-if-creds / dismiss-on-connected is the simplest rule with no edge cases. A page reload and a first visit look identical to the server; the client only shows the overlay when it has reason to expect a reconnect.

**Alternatives considered**:
- Show overlay only on WS reconnect (not page load): page load and reconnect are indistinguishable; adds complexity for no benefit
- Keep overlay up until `game_joined` if in game: unnecessary — `connected` + `game_joined` arrive within milliseconds; the intermediate state is invisible

---

## Decision 8: hello message timeout

**Decision**: Server closes the WS with code 1008 if no `hello` message is received within 5 seconds of connect.

**Rationale**: Prevents connections from hanging in the pre-identity state indefinitely. 5 s is generous for a LAN context but short enough to not accumulate zombie sockets.

**Alternatives considered**:
- No timeout: zombie sockets could accumulate on the server
- Shorter timeout (1 s): too aggressive for slow mobile connections
