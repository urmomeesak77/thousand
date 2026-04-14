# WebSocket Message Contract: Card Game 1000 — Lobby

**Date**: 2026-04-14 | **Branch**: `001-card-game-lobby`

WebSocket endpoint: `ws://localhost:3000/ws`

All messages are JSON strings. The `type` field is present on every message and acts as the discriminator.

---

## Connection Lifecycle

1. Client opens WebSocket to `/ws`.
2. Server assigns a player ID and registers the connection.
3. Server immediately sends a `lobby_update` with the current public games list.
4. On disconnect, server removes the player and cleans up any empty waiting game they hosted.

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

### `lobby_update`

Sent to **all clients currently in the lobby** (i.e., not yet in a game) whenever any public game is created, filled, or removed. Also sent immediately upon connection.

```json
{
  "type": "lobby_update",
  "games": [
    { "id": "a3f9c1", "playerCount": 2, "maxPlayers": 4 },
    { "id": "b7d2e0", "playerCount": 1, "maxPlayers": 4 }
  ]
}
```

Only public games in `waiting` status are included. Empty array `[]` means no open games.

---

### `game_joined`

Sent to a specific client after they successfully join or create a game (via HTTP). Signals the client to transition from the lobby view to the game waiting room view.

```json
{
  "type": "game_joined",
  "gameId": "a3f9c1",
  "players": [
    { "id": "p1uuid", "nickname": "Alice" },
    { "id": "p2uuid", "nickname": "Bob" }
  ]
}
```

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

Sent to **all players in a game** when a player disconnects.

```json
{
  "type": "player_left",
  "playerId": "p2uuid",
  "players": [
    { "id": "p1uuid", "nickname": "Alice" }
  ]
}
```

If the host disconnects and no players remain, the game is deleted server-side with no further message.

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
