# Contract: Action History (snapshot field + entry schema)

This feature adds **no new WebSocket message type**. It extends the existing
`round_state_snapshot` view-model with one field and defines the entry schema
recorded server-side.

## Snapshot field contract

`round_state_snapshot.gameStatus.actionHistory`

```jsonc
// gameStatus (per-viewer view-model from RoundSnapshot.buildViewModel)
{
  // ...existing fields (phase, activePlayer, scoreHistory, ...)
  "actionHistory": [ /* HistoryEntry, chronological, newest last */ ]
}
```

- Present on **every** `round_state_snapshot` and on any view-model build
  (including reconnect via `getViewModelFor`).
- **Identical for all seats** — contains only public information.
- Defaults to `[]` when the game has no session/history yet.
- Append-only and uncapped across the whole game session.

## HistoryEntry schema

```jsonc
{
  "seq": 0,                 // integer, 0-based, strictly +1 per entry, never reused
  "kind": "bid",            // "bid"|"pass"|"marriage"|"trick"|"round-score"|"four-nines"|"barrel"|"zeros"
  "roundNumber": 1,         // integer >= 1
  "seat": 0,                // integer 0..playerCount-1, or null for round-score
  "data": { }               // kind-specific (below)
}
```

### `data` by `kind`

```jsonc
"bid":         { "amount": 110 }
"pass":        { }
"marriage":    { "suit": "hearts", "bonus": 100 }
"trick":       { "trickNumber": 3 }
"round-score": { "perSeat": { "0": 120, "1": -60, "2": 0 }, "declarerSeat": 0, "bid": 110 }
"four-nines":  { "amount": 100 }
"barrel":      { "amount": -120 }
"zeros":       { "amount": -120 }
```

## Producer obligations (server)

| Trigger | Producer | Entry kind |
|---------|----------|------------|
| Auction bid accepted | `RoundActionHandler` (bid path) | `bid` |
| Auction pass | `RoundActionHandler.handlePass` | `pass` |
| Marriage declared | `TrickPlayActionHandler` / `RoundActionBroadcaster._broadcastMarriage` | `marriage` |
| Trick resolved | `RoundActionBroadcaster.broadcastPlayCardResults` (`winnerSeat`) | `trick` |
| Round end scored | `RoundActionBroadcaster.computeRoundEnd` | `round-score` |
| Four-nines bonus banked | `Game.applyFourNinesBonus` | `four-nines` |
| Barrel penalty applied | `Game.applyRoundEnd` (barrel branch) | `barrel` |
| Three-zeros penalty applied | `Game.applyRoundEnd` (zeros branch) | `zeros` |

Producers MUST record exactly one entry per discrete event, in resolution
order, with a strictly increasing `seq`.

## Consumer obligations (client)

`HistoryPanel.render(actionHistory, seats)` MUST:

- Render entries in array order, newest at the **bottom**, and pin the scroll to
  the bottom on each render (chat-style).
- Resolve seat → display name from `seats.players` at render time; fall back to a
  stable seat label (e.g. "Seat 2") when no nickname is available.
- Show an empty-state row when `actionHistory` is empty.
- Never grow the panel's outer box as entries accumulate (inner scroll only).

## Backward compatibility

`actionHistory` is additive. Clients that ignore it are unaffected; the field is
always an array (never absent for a started round, never `null`).
