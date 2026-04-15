# HTTP API Contract: Card Game 1000 — Lobby

**Date**: 2026-04-14 | **Last Updated**: 2026-04-15 | **Branch**: `001-card-game-lobby`

All endpoints are served by `src/server.js` on `http://localhost:3000` (default port). JSON bodies use `Content-Type: application/json`.

---

## Static Assets

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/` | `200` — `index.html` |
| `GET` | `/css/index.css` | `200` — `index.css` |
| `GET` | `/js/<module>.js` | `200` — JS module (ES module, not bundled) |

---

## Player Endpoints

### `POST /api/nickname`

Claims a unique nickname for a connected player before they enter the lobby. The player must already have an active WebSocket connection (to obtain a `playerId`).

**Request body**:
```json
{ "nickname": "Alice", "playerId": "uuid-..." }
```

**Response `200`**:
```json
{ "nickname": "Alice" }
```

**Response `400`** — missing/invalid nickname or unknown `playerId`:
```json
{ "error": "invalid_request", "message": "Nickname must be 3–20 characters" }
```

**Response `409`** — another connected player already holds this nickname:
```json
{ "error": "duplicate_nickname", "message": "That nickname is already taken" }
```

Nickname uniqueness is case-insensitive and scoped to currently connected players only.

---

## Game Endpoints

### `GET /api/games`

Returns the list of public games currently in `waiting` status.

**Response `200`**:
```json
{
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

Private games and non-waiting games are excluded. `players` is an array of nicknames (for tooltip display in the UI).

---

### `POST /api/games`

Creates a new game. The creating player becomes the host.

**Request body**:
```json
{ "type": "public" | "private", "nickname": "Alice", "playerId": "uuid (optional — links to existing WS session)" }
```

**Response `201`**:
```json
{
  "gameId": "a3f9c1",
  "inviteCode": "A3FX9C",
  "playerId": "uuid-..."
}
```

`inviteCode` is present for private games, `null` for public. `playerId` is the server-assigned ID the client must use in future requests.

**Response `400`** — invalid body:
```json
{ "error": "invalid_request", "message": "nickname must be 3–20 characters" }
```

---

### `POST /api/games/:id/join`

Joins an existing public game by its ID.

**Request body**:
```json
{ "nickname": "Bob", "playerId": "uuid (optional)" }
```

**Response `200`**:
```json
{ "gameId": "a3f9c1" }
```

**Response `404`** — game not found or is private:
```json
{ "error": "not_found", "message": "Game not found" }
```

**Response `409`** — game is full or no longer waiting:
```json
{ "error": "game_full", "message": "Game is full" }
```

---

### `POST /api/games/join-invite`

Joins a private game using an invite code.

**Request body**:
```json
{ "code": "A3FX9C", "nickname": "Charlie", "playerId": "uuid (optional)" }
```

**Response `200`**:
```json
{ "gameId": "a3f9c1" }
```

**Response `404`** — invite code not found or expired:
```json
{ "error": "not_found", "message": "Invalid invite code" }
```

**Response `409`** — game is full:
```json
{ "error": "game_full", "message": "Game is full" }
```

---

### `POST /api/games/:id/leave`

Voluntarily leaves a waiting game. Triggers the same server-side logic as a WebSocket disconnect for the leaving player.

**Request body**:
```json
{ "playerId": "uuid-..." }
```

**Response `200`**:
```json
{}
```

**Response `404`** — game or player not found:
```json
{ "error": "not_found", "message": "Game or player not found" }
```

If the leaving player was the host:
- Remaining players receive a `game_disbanded` WebSocket message.
- The game is deleted.

If a non-host player leaves:
- Remaining players receive a `player_left` WebSocket message.
- The game persists.

---

## Error Shape

All error responses follow this shape:

```json
{ "error": "<error_code>", "message": "<human-readable description>" }
```

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `invalid_request` | 400 | Missing or malformed fields |
| `not_found` | 404 | Game or invite code does not exist |
| `game_full` | 409 | No seats available |
| `duplicate_nickname` | 409 | Nickname already claimed by another connected player |
| `internal_error` | 500 | Unexpected server fault |
