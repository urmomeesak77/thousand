# Same-browser multi-tab as one player — design

Date: 2026-06-04

## Problem

A single user opening the game twice in the same browser can end up as **two
separate players** and start **two games**. Two mechanics combine to cause this:

1. **Fresh-load identity race.** Same-browser tabs share one `localStorage`
   identity (`thousand_identity`). But two tabs opened before either has saved
   an identity both send an empty `hello`. The server's
   `PlayerRegistry.createOrRestore` sees an invalid (empty) identity shape on
   each and `create()`s a **distinct player** for each tab. One browser is now
   two players, each free to create/join its own game.

2. **Last-connect-wins kills, doesn't mirror.** When a second tab *does* share a
   stored identity, the server (`ConnectionLifecycle.reconnect`) kicks the first
   tab's socket (`session_replaced`) and the first tab stops
   (`ThousandMessageRouter._onSessionReplaced` → `socket.disconnect()`). So a
   second tab silently terminates the first rather than mirroring it.

The server already guards *joins* (`_validateJoinPreconditions` returns
`already_in_game` when `player.gameId !== null`) but **`handleCreateGame` has no
such guard**, so a single player can create a game while already in one.

## Goal

Make one browser behave as exactly one player, with **all of that player's tabs
live and fully interactive** — an action in any tab is reflected in every tab in
real time.

Out of scope: cross-browser / cross-device sync (identity is per-`localStorage`,
so this only concerns tabs within the same browser). Changing
`MAX_CONNECTIONS_PER_IP`.

## Design

### 1. Server — multiple sockets per player

The player, not the socket, is the unit. `Player.ws` (single socket) becomes
`Player.sockets` (a `Set`). All server→client routing already keys off
`playerId` (`sendToPlayer`, `broadcastLobbyUpdate`, snapshots), so once a player
can hold several sockets, **mirroring falls out for free** — every tab receives
every broadcast and snapshot.

- **`PlayerRegistry.create`** initializes `sockets: new Set([ws])`.
- **`PlayerRegistry.sendToPlayer`** and **`ThousandStore.broadcastLobbyUpdate`**
  iterate `sockets` and send to each socket whose `readyState === OPEN`,
  swallowing per-socket errors (as today, so one dead socket doesn't abort the
  rest).
- **`ConnectionLifecycle.reconnect` → additive `addConnection`**: *adds* the new
  ws to `player.sockets` instead of kicking the existing one. Clears the grace
  timer and resets `disconnectedAt`. Broadcasts `player_reconnected` **only if
  the player was fully disconnected** (sockets had been empty / in grace);
  adding a second tab to an already-live player must not emit a spurious
  reconnect.
- **`ConnectionLifecycle.handleDisconnect`**: removes the closing ws from
  `player.sockets`.
  - If sockets remain (other tabs still live) → return without touching
    `disconnectedAt`, grace, or game state.
  - Only when the **last** socket closes does it set `disconnectedAt`, start the
    grace timer, and broadcast `player_disconnected`. The entire existing
    grace / round-abort / game-abort behavior is preserved unchanged — it now
    keys off "last tab gone" rather than "the one socket gone."
  - The stale-socket guard (old `player.ws !== ws` check) becomes "act only if
    the ws was actually a member of the set" (`sockets.delete(ws)` returned
    true).
- **`session_replaced` is retired**: the server no longer emits it, and the
  client handler + validator entry are removed. With multi-socket there is no
  remaining scenario that needs it (a second device sharing a token simply
  becomes another mirrored socket).

### 2. Client — `TabSync` identity election

New module `src/public/js/storage/TabSync.js`. Fixes the fresh-load race at its
source using a `BroadcastChannel('thousand_tabs')` so two simultaneous fresh
tabs converge on a single identity instead of creating two players.

Resolution flow, run once before the first `hello`:

- **Stored identity exists** → use it and connect (server treats it as an
  additive reconnect). Also broadcast it so any sibling still electing adopts it.
- **No stored identity** → run a short election with a **~200 ms** window
  (applies to fresh first-load only, never to restore):
  - Announce a random nonce on the channel; collect siblings' announcements.
  - If a sibling already holds an identity, it replies with it → **adopt** that
    identity and connect (restored).
  - Otherwise the **lowest-nonce** fresh tab proceeds to connect-and-create; the
    other fresh tabs wait for the winner's `identity` broadcast and adopt it. A
    fallback timeout guards against the winner never reporting (e.g. it was
    closed mid-election) → re-elect or create.
- On every `connected` message, the receiving tab broadcasts the resolved
  identity so late/waiting siblings converge.
- **Fallback:** if `BroadcastChannel` is unavailable, skip the election and
  behave exactly as today (no worse than current).

Wiring: `ThousandSocket` awaits `TabSync` identity resolution before sending
`hello`; `ThousandMessageRouter._onConnected` notifies `TabSync` so it can
broadcast the identity to siblings.

### 3. Server — create-guard (defense in depth)

`GameController.handleCreateGame`: if `player.gameId !== null`, respond
`409 already_in_game` ("Leave your current game first"), mirroring the existing
join precondition. Closes the one per-player two-games path that bypasses the
lobby UI, independent of the tab work above.

### 4. Double-submit from interactive tabs

No new mechanism required. Turn-based WS actions (`bid`, `play_card`, …) are
already server-gated and the client self-heals via a snapshot resync on
rejection (`ThousandMessageRouter._onActionRejected`). The non-idempotent REST
paths (create/join) are both now guarded by `already_in_game`. A duplicate
action arriving from a second tab after state has advanced is rejected and
triggers a harmless resync.

## Testing

**Server**
- `PlayerRegistry`: `create` seeds one socket; a second connection adds a
  socket; `sendToPlayer` reaches every open socket; `remove` clears them.
- `ConnectionLifecycle`: disconnecting one of several sockets does **not** start
  grace or emit `player_disconnected`; disconnecting the **last** socket starts
  grace and emits `player_disconnected`; `addConnection` clears grace and emits
  `player_reconnected` only when returning from fully-disconnected.
- Integration: two sockets bound to the same player both receive a broadcast
  (e.g. `lobby_update`, `bid_accepted`).
- `GameController.handleCreateGame` rejects with `already_in_game` when the
  player already has a `gameId`.

**Client (jsdom)**
- `TabSync`: adopts a sibling's broadcast identity instead of creating; two
  fresh tabs electing simultaneously yield exactly one creator; absence of
  `BroadcastChannel` falls back to direct connect.

## Files touched

- `src/services/PlayerRegistry.js` — `sockets` Set; `sendToPlayer` iterates.
- `src/services/ConnectionLifecycle.js` — `addConnection` (additive) +
  last-socket grace in `handleDisconnect`.
- `src/services/ThousandStore.js` — `broadcastLobbyUpdate` iterates sockets.
- `src/services/ConnectionManager.js` — hello path uses additive reconnect;
  stop relying on `session_replaced`.
- `src/controllers/GameController.js` — create-guard.
- `src/public/js/storage/TabSync.js` — **new** identity-election module.
- `src/public/js/network/ThousandSocket.js` — resolve identity via `TabSync`
  before `hello`.
- `src/public/js/core/ThousandMessageRouter.js` — remove `session_replaced`
  handler/validator; notify `TabSync` on `connected`.
- `src/public/js/core/ThousandApp.js` / `src/public/js/index.js` — wire
  `TabSync`.

## Decisions

- **Retire `session_replaced` entirely** — confirmed; multi-socket leaves no
  scenario needing it.
- **Election window ~200 ms**, fresh first-load only.
