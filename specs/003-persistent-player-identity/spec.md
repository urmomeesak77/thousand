# Feature Specification: Persistent Player Identity

**Feature Branch**: `003-persistent-player-identity`  
**Created**: 2026-04-28  
**Status**: Draft  
**Input**: User description: "bind a browser to one persistent identity using localStorage + a server-side grace period"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Refresh Restores Identity (Priority: P1)

A player sets their nickname and joins a game lobby. They accidentally refresh the page. On reload, the browser sends stored credentials; the server recognizes the player and restores their nickname and game membership without any re-entry.

**Why this priority**: Core pain point — losing identity on refresh makes the app feel broken. Fixes the most critical user-facing bug.

**Independent Test**: Open lobby, enter nickname, refresh page. Player name and game membership reappear within 2 seconds. Delivers value as a standalone fix.

**Acceptance Scenarios**:

1. **Given** player has a stored identity in local storage and is in a game, **When** player refreshes the page, **Then** a "Reconnecting…" overlay is shown immediately and dismissed within 2 seconds once the server confirms identity, revealing restored nickname and game membership.
2. **Given** player has a stored identity and is in the lobby (not in a game), **When** player refreshes, **Then** the "Reconnecting…" overlay is shown then dismissed, leaving the player in the lobby with their nickname restored.
3. **Given** player has no stored identity (first visit or cleared storage), **When** player loads the page, **Then** no reconnect overlay is shown; player gets a fresh identity and is prompted to set a nickname.

---

### User Story 2 — Reconnect After Temporary Disconnect (Priority: P2)

A player's connection drops (network blip, laptop lid close). Within the grace period, they reopen the tab or their connection restores. The server still holds their record; reconnect succeeds and the player's seat in any active game is preserved.

**Why this priority**: Prevents players from being kicked from games due to momentary drops, which would be disruptive to other players.

**Independent Test**: Disconnect WS, wait < grace period, reconnect. Player record and game seat intact.

**Acceptance Scenarios**:

1. **Given** player is in an active game and disconnects, **When** player reconnects within the grace period, **Then** player's game membership is fully restored.
2. **Given** player disconnects and the grace period expires before reconnect, **When** player eventually reconnects, **Then** player is treated as a new session (fresh identity, no game membership).
3. **Given** player is in the lobby (no game) and disconnects, **When** player reconnects within the grace period, **Then** player's nickname is restored.

---

### User Story 3 — No Cross-Browser Impersonation (Priority: P3)

A player's stored credentials (playerId) are visible in browser devtools. Another person copies the playerId and tries to join as that player from a different browser. Without the matching sessionToken, the server rejects the attempt and returns a fresh identity instead.

**Why this priority**: Security baseline — prevents trivial identity theft in a shared/LAN gaming context.

**Independent Test**: Submit known playerId with wrong token → server issues new identity, does not restore prior player's state.

**Acceptance Scenarios**:

1. **Given** a valid playerId with an incorrect sessionToken, **When** client sends reconnect credentials, **Then** server rejects the token and issues a new identity.
2. **Given** a valid playerId + sessionToken from a different browser (not the originating one), **When** client reconnects, **Then** server accepts the credentials (token is valid) and transfers the session to the new connection.

---

### Edge Cases

- What happens when localStorage is cleared mid-session? Player gets treated as a new visitor on next load.
- What happens when the server restarts? All in-memory records are lost; all clients get fresh identities on reconnect (acceptable for in-memory-only state).
- What happens when the same identity connects from two browser tabs simultaneously? Second connection replaces the first (last-connect-wins).
- What happens when a player's grace period expires while they are actively reconnecting? Race condition resolved server-side: if reconnect arrives before cleanup runs, player is restored.
- What happens to the game when a lobby player is purged? Player is removed silently; other lobby members see an updated player list. Mid-game purge behavior is out of scope here.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a unique player identity (ID + secret token) on first visit and store it in the browser's persistent local storage.
- **FR-002**: System MUST send stored credentials to the server on every connection attempt (first visit and reconnect).
- **FR-003**: Server MUST validate submitted credentials: if ID exists and token matches, restore the player record; if ID is unknown or token mismatches, issue a fresh identity.
- **FR-004**: Server MUST keep a disconnected player's record alive for a grace period after WebSocket disconnect. The grace period is configurable via the `GRACE_PERIOD_MS` environment variable (default: 30 000 ms).
- **FR-005**: Server MUST restore a reconnecting player's nickname and game membership if they reconnect within the grace period.
- **FR-006**: Server MUST release a player's record and free their game seat if the grace period expires without reconnect. For lobby players, purge is non-disruptive: no notification banner is shown to remaining members, and the lobby player list updates passively to reflect the removal. For mid-game purge, the default behavior is to evict the disconnected player and trigger the existing game-resolution path (`_resolveGameAfterExit`); refined user-visible treatment (pause, cancel, or continue messaging) is phase-dependent and deferred to a future game-rules spec.
- **FR-007**: System MUST prevent a player from holding more than one active connection at a time; a second connection with valid credentials replaces the first (last-connect-wins).
- **FR-008**: System MUST NOT share or infer identity across different browser storage contexts (incognito / different browser / cleared storage = new identity).

### Key Entities

- **Client Identity** (browser localStorage): playerId (unique, opaque), sessionToken (secret, unguessable), cached nickname (server is source of truth).
- **PlayerRecord** (server-side, lives in `ThousandStore.players`): playerId, sessionToken, nickname, current WebSocket (or `null` during grace period), disconnect timestamp, grace-period timer handle, gameId.
- **Game Membership**: reference from PlayerRecord to current game and player seat (nullable).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Player who refreshes the page sees a "Reconnecting…" overlay immediately on load; overlay dismisses and full UI is restored within 2 seconds.
- **SC-002**: Player who disconnects and reconnects within the grace period loses no game state 100% of the time.
- **SC-003**: Submitting a valid playerId with a mismatched token never grants access to the original player's state.
- **SC-004**: A player absent longer than the grace period is treated as a new visitor on reconnect — their prior seat is freed before the next player can occupy it.
- **SC-005**: Opening the game in a new incognito window always produces a distinct player identity, never reusing an existing one.

## Assumptions

- Grace period default is 30 seconds; value is configurable in server config without a code change.
- localStorage is available and enabled in the browser; no cookie fallback is required.
- Session tokens are held in server memory only — they are not persisted to disk and are lost on server restart (acceptable given current in-memory architecture).
- Multi-tab behavior: last-connect-wins — the second tab's connection supersedes the first; the first tab receives a disconnect signal.
- Identity is browser-scoped and anonymous — no username/password login is in scope for this feature.
- The feature applies to the lobby and any active game; no distinction between lobby-only and in-game reconnect handling.
- Protocol-level handshake details — including the server-side timeout that closes a connection if no `hello` arrives shortly after WS open — are defined in plan.md, not spec.md.

## Clarifications

### Session 2026-04-28

- Q: What happens to the active game when a disconnected player is purged after grace period expires? → A: Depends on game phase — lobby: player removed silently, others unaffected; active game: behavior (pause/cancel/continue) is out of scope, defined in a future game-rules spec.
- Q: What does the player see during the reconnect handshake? → A: Explicit "Reconnecting…" overlay shown immediately on page load, dismissed once server confirms identity.
