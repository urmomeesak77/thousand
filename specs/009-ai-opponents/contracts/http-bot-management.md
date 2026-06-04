# Contract: Bot Management HTTP Endpoints

Host-only, waiting-room-only. Follows the existing `GameController` REST patterns
(JSON body, `HttpUtil.sendJSON` / `sendError`, player resolved from session as in join/leave).

## POST /api/games/:id/bots — add a bot

Adds one bot to the next empty seat.

**Auth/identity**: requester resolved to a `player` (same mechanism as `/leave`).

**Preconditions** (else error):
| Condition | Status | code |
|-----------|--------|------|
| Game not found | 404 | `not_found` |
| Requester is not the host (`game.hostId`) | 403 | `forbidden` |
| Game not `waiting` (already started/over) | 409 | `game_already_started` |
| Table already full (`size >= requiredPlayers`) | 409 | `game_full` |

**Success**: `201 { botId, nickname }`.

**Side effects**:
- `PlayerRegistry.createBot(nickname)` (themed unique name, random `aggressiveness ∈ [0,1]` for the game per FR-016), `gameId` set, added to `game.players`.
- `player_joined` broadcast to existing human players, `players` array now includes the bot
  (each entry carries `isBot`).
- `broadcastLobbyUpdate()`.
- If the add fills the table → `store.startRound(gameId)` (auto-start; identical to last human joining).

## DELETE /api/games/:id/bots/:botId — remove a bot

Removes a specific bot, freeing its seat.

**Preconditions** (else error):
| Condition | Status | code |
|-----------|--------|------|
| Game not found | 404 | `not_found` |
| Requester is not the host | 403 | `forbidden` |
| Game not `waiting` | 409 | `game_already_started` |
| `:botId` not in `game.players`, or not a bot | 404 | `not_found` |

**Success**: `200 {}`.

**Side effects**:
- Remove botId from `game.players`; `PlayerRegistry.remove(botId)`.
- `player_left` broadcast to remaining players (`players` array refreshed).
- `broadcastLobbyUpdate()`.

## Routing (RequestHandler.js)

```
POST   /api/games/:id/bots            → GameController.handleAddBot(req,res,player,gameId)
DELETE /api/games/:id/bots/:botId     → GameController.handleRemoveBot(req,res,player,gameId,botId)
```

Both rate-limited by the existing generic 60-req/min/IP HTTP bucket (no dedicated limiter needed;
add-bot is bounded to ≤ requiredPlayers−1 successes per game anyway).
