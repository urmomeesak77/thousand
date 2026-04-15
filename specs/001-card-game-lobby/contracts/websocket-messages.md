# WebSocket Message Contract: Card Game 1000 — Lobby

**Date**: 2026-04-14 | **Last Updated**: 2026-04-15 | **Branch**: `001-card-game-lobby`

WebSocket endpoint: `ws://localhost:3000/ws`

All messages are JSON strings. The `type` field is present on every message and acts as the discriminator.

---

## Connection Lifecycle

1. Client opens WebSocket to `/ws`.
2. Server assigns a player ID and registers the connection.
3. Server immediately sends `connected` with the assigned player ID.
4. Server immediately sends `lobby_update` with the current public games list.
5. On disconnect, server removes the player and:
   - If the player was **not in a game**: no further action.
   - If the player was **in a game as a non-host**: remaining players receive `player_left`; game persists.
   - If the player was the **host with no other players**: game is deleted silently.
   - If the player was the **host with remaining players**: remaining players receive `game_disbanded`; game is deleted.

---

## Client → Server Messages

### `ping`

Keepalive to prevent idle connection drops.

```json
{ "type": "ping" }
```

Server does not respond (no `pong` needed; connection staying open is the signal).

---

## Server → Client Messages

### `connected`

Sent to the newly connected client immediately after the WebSocket handshake. Delivers the server-assigned player ID that the client must include in subsequent HTTP request bodies.

```json
{ "type": "connected", "playerId": "uuid-..." }
```

---

### `lobby_update`

Sent to **all clients currently in the lobby** (i.e., not yet in a game) whenever any public game is created, filled, or removed. Also sent immediately upon connection.

```json
{
  "type": "lobby_update",
  "games": [
    {
      "id": "a3f9c1",
      "playerCount": 2,
      "maxPlayers": 4,
      "owner": "Alice",
      "createdAt": 1744747200000,
      "players": ["Alice", "Bob"]
    }
  ]
}
```

Only public games in `waiting` status are included. Empty array `[]` means no open games. `players` contains nicknames of current members (used for hover tooltip in the UI).

---

### `game_joined`

Sent to a specific client after they successfully join or create a game (via HTTP). Signals the client to transition from the lobby view to the game waiting room.

```json
{
  "type": "game_joined",
  "gameId": "a3f9c1",
  "createdAt": 1744747200000,
  "players": [
    { "id": "p1uuid", "nickname": "Alice" },
    { "id": "p2uuid", "nickname": "Bob" }
  ]
}
```

`createdAt` is a Unix timestamp (ms) used by the client to display elapsed waiting time.

---

### `player_joined`

Sent to **all players already in a game** when a new player joins their game.

```json
{
  "type": "player_joined",
  "player": { "id": "p3uuid", "nickname": "Charlie" },
  "players": [
    { "id": "p1uuid", "nickname": "Alice" },
    { "id": "p2uuid", "nickname": "Bob" },
    { "id": "p3uuid", "nickname": "Charlie" }
  ]
}
```

---

### `player_left`

Sent to **all remaining players in a game** when a non-host player disconnects or leaves voluntarily.

```json
{
  "type": "player_left",
  "playerId": "p2uuid",
  "nickname": "Bob",
  "players": [
    { "id": "p1uuid", "nickname": "Alice" }
  ]
}
```

Not sent when the host leaves — see `game_disbanded` instead.

---

### `game_disbanded`

Sent to **all remaining players** when the host disconnects or leaves while other players are still in the waiting room. The client should return the player to the lobby.

```json
{ "type": "game_disbanded", "reason": "host_left" }
```

---

### `error`

Sent to a specific client when a server-side error occurs that is not covered by HTTP response codes (e.g., a race condition after the HTTP join response was already sent).

```json
{
  "type": "error",
  "code": "game_full",
  "message": "Game is full"
}
```

| Code | Meaning |
|------|---------|
| `game_full` | Seat taken between HTTP response and WS routing |
| `game_closed` | Game was deleted between join attempt and routing |
| `invalid_message` | Unrecognized message type from client |
