# Contract: Serialized Player `isBot` Field

To satisfy FR-012 (bots clearly labelled) and FR-013 (individually distinguishable), the
player view-models that clients render must carry an `isBot` flag. This is the only
client-facing payload change in the feature.

## Changed: `PlayerRegistry.serializePlayers(game)`

Today returns `[{ nickname }]`. Extend to:

```json
[ { "nickname": "kashka", "isBot": false },
  { "nickname": "Robo-Ada", "isBot": true } ]
```

`isBot` is derived from each player record (`!!player.isBot`). Order continues to follow
`game.players` iteration (seat/join order).

## Messages that carry the extended array (no new message types)

| Message | Direction | Change |
|---------|-----------|--------|
| `game_joined` | server→client | `players[]` entries gain `isBot` |
| `player_joined` | server→client | `players[]` entries gain `isBot` (fired when a bot is added) |
| `player_left` | server→client | `players[]` / remaining list gains `isBot` (fired when a bot is removed) |
| `lobby_update` | server→client | lobby list `players` (names) unchanged; bot names appear like any other — acceptable for v1 (lobby shows names only) |

## Client rendering (WaitingRoom.js)

- A seat whose player `isBot` renders a visible badge (e.g. `🤖` / "BOT") next to the name.
- The distinct themed name (`Robo-Ada`, `Robo-Max`, …) provides individual distinguishability.
- Host-only controls: an **Add Bot** button while the table is not full, and a **Remove**
  affordance on each bot seat. Non-hosts see badges but no controls (FR-005).
- In-game seat labels (`RoundSnapshot.buildSeatLayout` → `players[].nickname`) already show the
  themed name; the badge styling is reused where the seat name is rendered. If an explicit
  in-game `isBot` flag is wanted on `seats.players[]`, add it the same derived way; otherwise the
  themed-name convention is sufficient.

## Non-goals

- No change to `IdentityStore` / session tokens (bots have none).
- No new WebSocket message types — only the additive `isBot` field on existing player arrays.
