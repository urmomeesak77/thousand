# Phase 1 Contracts: REST + WebSocket changes

No **new** message *types*. The 4-player variant changes the **sizes/cardinality** carried inside existing REST bodies and WS payloads. This document records the contract deltas only.

## REST: `POST /api/games` (create game)

**[CHANGED]** `requiredPlayers` now accepts **3 or 4** (previously 3 only).

Request body (unchanged shape):
```json
{ "type": "public" | "private", "nickname": "string", "requiredPlayers": 3 | 4 }
```
- Default when omitted: `3` (back-compatible).
- Validation (`validateRequiredPlayers`): reject anything other than 3 or 4 → `400 invalid_request`, message `"Player count must be 3 or 4"`.

Response (unchanged): `201 { gameId, inviteCode }`.

Join flows (`/join`, `/join-invite`) unchanged: capacity check `players.size >= requiredPlayers` already honors 4; the room starts when `players.size === requiredPlayers`.

## WS: `game_joined` / `player_joined`

Unchanged shape. `requiredPlayers` (already present in `game_joined`) is `4` for a 4-player room; the waiting room renders "(N needed to start)" from it.

## WS: `round_started` / `round_state_snapshot`

`seats` layout — **[CHANGED]** cardinality:
```jsonc
{
  "self": <seat>,
  "left": <seat>,
  "across": <seat>,   // [NEW] present only when playerCount === 4
  "right": <seat>,
  "dealer": <seat>,
  "players": [ { "seat", "playerId", "nickname" }, ... ]  // length === playerCount
}
```
- 3-player payload is **unchanged** (no `across` key; `players` length 3).
- Clients must treat the opponent set as "all `players` seats except `self`", ordered clockwise (`left`, `across?`, `right`) — not as a fixed left/right pair.

`gameStatus` view-model — **[CHANGED]** map cardinality (keys span `0 … playerCount-1`):
- `cumulativeScores`, `collectedTrickCounts`, `roundPoints`, `barrelMarkers`, `opponentHandSizes`, `scoreHistory[].perPlayer` — now have `playerCount` entries.
- `currentTrick` — reaches `playerCount` entries during a trick (4 for 4-player).
- `exchangePassesCommitted` — counts up to `playerCount - 1`.
- All field *names* and per-entry shapes unchanged.

`dealSequence` (deal animation) — **[CHANGED]** length equals deck size (24 or 32); `to` values span `seat0 … seat{playerCount-1}` and `talon`.

## WS: trick / crawl / four-nines (unchanged types, generalized counts)

- `play_card`, `card_played`, `trick_resolved`: a trick now completes at `playerCount` cards.
- `crawl_commit` / `crawl_committed` / `crawl_revealed`: crawl resolves at `playerCount` commits; `commits` array in `crawl_revealed` has `playerCount` entries for 4-player.
- `acknowledge_four_nines`: gate closes when all `playerCount` players have acknowledged.

No envelope/field-name changes; validators (`validateCrawlCommit`, `validateAcknowledgeFourNines`) unchanged.

## Contract test coverage

- `tests/validators.test.js`: `requiredPlayers` accepts 3 and 4, rejects 2/5/"x".
- `tests/round-messages.fourplayer.test.js`: a 4-player `round_started` has `seats.players.length === 4`, includes `across`, and `currentTrick` reaches length 4 during play; 3-player payload remains free of `across`.
