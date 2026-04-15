# Data Model: Card Game 1000 — Lobby & Game Creation

**Date**: 2026-04-14 | **Branch**: `001-card-game-lobby`

All state is in-memory on the server. No persistence layer.

---

## Entity: Game

Represents one game session (lobby phase only; gameplay fields are out of scope).

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (6-char hex) | Unique game identifier, server-generated |
| `type` | `"public"` \| `"private"` | Public games appear in lobby; private do not |
| `hostId` | string | Player ID of the creator |
| `players` | `Set<string>` | Player IDs currently in the game |
| `maxPlayers` | number | Always `4` for v1 |
| `status` | `"waiting"` \| `"playing"` \| `"finished"` | Current game phase |
| `inviteCode` | string \| `null` | 6-char uppercase alphanumeric; `null` for public games |

### State Transitions

```
[created]
    │
    ▼
 waiting ──(all seats filled or host starts)──► playing
    │
    └──(host disconnects, no other players)──► [deleted]

playing ──(game ends)──► finished ──► [deleted from memory]
```

### Validation Rules

- `players.size` must never exceed `maxPlayers`
- `inviteCode` must be unique across all active games at creation time
- A game in `playing` or `finished` status cannot accept new players
- The host (`hostId`) must always be in `players` while the game is `waiting`

---

## Entity: Player

Represents a connected client. Exists only while the WebSocket connection is open.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Server-assigned on WebSocket connect |
| `nickname` | string | Chosen by player on lobby load (3–20 chars) |
| `gameId` | string \| `null` | ID of current game; `null` if in lobby |
| `ws` | WebSocket | Live socket reference (server-side only, not serialized) |

### Validation Rules

- `nickname` must be 3–20 characters, non-empty after trim
- A player can only be in one game at a time (`gameId` is exclusive)
- Player record is deleted when the WebSocket closes

---

## Entity: InviteCode

Not a separate data structure — embedded as the `inviteCode` field on a `Game`.

| Property | Value |
|----------|-------|
| Format | 6-char uppercase alphanumeric (`[A-Z0-9]{6}`) |
| Generation | `crypto.randomBytes(3).toString('hex').toUpperCase()` |
| Lifetime | Active while parent game is in `waiting` status |
| Expiry | Deleted when game starts (`playing`) or game is removed |
| Uniqueness | Checked against all active games at creation time; regenerated on collision |

---

## Server-Side State Shape

State lives in `ThousandStore` (`src/services/ThousandStore.js`), instantiated once in `src/server.js` and injected into `RequestHandler`.

```js
class ThousandStore {
  constructor() {
    this.games = new Map();       // Map<gameId, Game>
    this.players = new Map();     // Map<playerId, Player>
    this.inviteCodes = new Map(); // Map<inviteCode, gameId>  — fast lookup for join-by-code
  }
}
```

---

## Serialized Lobby Payload (WebSocket push)

When pushing lobby updates to clients, only public waiting games are sent, and sensitive/internal fields are stripped:

```json
{
  "type": "lobby_update",
  "games": [
    {
      "id": "a3f9c1",
      "playerCount": 2,
      "maxPlayers": 4
    }
  ]
}
```
