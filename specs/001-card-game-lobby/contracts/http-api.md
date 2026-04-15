# HTTP API Contract: Card Game 1000 — Lobby

**Date**: 2026-04-14 | **Branch**: `001-card-game-lobby`

All endpoints are served by `server.js` on `http://localhost:3000` (default port). JSON bodies use `Content-Type: application/json`.

---

## Static Assets

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/` | `200` — `index.html` |
| `GET` | `/css/index.css` | `200` — `index.css` |
| `GET` | `/js/<module>.js` | `200` — JS module (ES module, not bundled) |

---

## Game Endpoints

### `GET /api/games`

Returns the list of public games currently in `waiting` status.

**Response `200`**:
```json
{
  "games": [
    { "id": "a3f9c1", "playerCount": 2, "maxPlayers": 4 }
  ]
}
```

Private games and non-waiting games are excluded.

---

### `POST /api/games`

Creates a new game. The creating player becomes the host.

**Request body**:
```json
{ "type": "public" | "private", "nickname": "Alice", "playerId": "uuid (optional — reconnect hint)" }
```

**Response `201`**:
```json
{
  "gameId": "a3f9c1",
  "inviteCode": "A3FX9C",   // present only for private games, null for public
  "playerId": "uuid-..."    // server-assigned player ID; store client-side to link future requests to the same WS session
}
```

**Response `400`** — invalid body (missing fields, invalid type, blank nickname):
```json
{ "error": "invalid_request", "message": "nickname is required" }
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

**Response `409`** — game is full or no longer waiting:
```json
{ "error": "game_full", "message": "Game is full" }
```

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
| `internal_error` | 500 | Unexpected server fault |
