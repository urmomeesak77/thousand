# Phase 1 Data Model: Game History Panel

## Entity: HistoryEntry

A single recorded game event. Plain serializable object (ships inside the snapshot view-model). Ordering is positional (array index = chronological order; newest appended last, FR-002/FR-014).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `seq` | integer | yes | Monotonic per-game sequence number (0-based). Stable ordering key; survives reconnect. |
| `kind` | string enum | yes | One of: `bid`, `pass`, `marriage`, `trick`, `round-score`, `four-nines`, `barrel`, `zeros`. |
| `roundNumber` | integer | yes | The game round the event belongs to (for round grouping / "last round" reads, FR-007). |
| `seat` | integer \| null | conditional | The acting/affected seat. Null for events that span all seats (`round-score`). |
| `data` | object | yes | Kind-specific payload (see below). Empty object for `pass`. |

Players are referenced by **seat** only; display names are resolved client-side from `seats.players` at render time (FR-016), so a name change or unknown name never corrupts a stored entry.

### `data` payload by `kind`

| kind | data fields | Example display (resolved client-side) |
|------|-------------|------------------------------------------|
| `bid` | `{ amount }` | "Ada bid 110" |
| `pass` | `{}` | "Bot-Eve passed" |
| `marriage` | `{ suit, bonus }` | "Ada declared ♥ marriage (+100)" |
| `trick` | `{ trickNumber }` | "Trick 3 won by Cara" |
| `round-score` | `{ perSeat: { <seat>: delta }, declarerSeat, bid }` | "Round 4: Ada +120, Bot-Eve −60, Cara 0" |
| `four-nines` | `{ amount }` | "Ada — four nines bonus +100" |
| `barrel` | `{ amount }` | "Cara — barrel penalty −120" |
| `zeros` | `{ amount }` | "Bot-Eve — three zeros penalty −120" |

`suit` values reuse existing card suit tokens; the client maps them to symbols via the existing `SUIT_LETTER` / `cardSymbols.js`.

### Validation / invariants

- `seq` strictly increases by 1 per appended entry within a game; never reused.
- `kind` must be one of the enum values; unknown kinds are not produced by the server.
- `seat` is within `0..playerCount-1` when non-null.
- `round-score.perSeat` contains every active seat (3 or 4 keys, FR-017).
- Entries are append-only; never mutated or removed during a game (FR-019).

## Entity: GameHistory (server, `src/services/GameHistory.js`)

Owns the ordered entry list for one `Game` session.

| Member | Type | Notes |
|--------|------|-------|
| `_entries` | `HistoryEntry[]` | Append-only, uncapped (FR-019). |
| `_seq` | integer | Next sequence number. |

Methods (each a thin append; ~one statement of work each, Constitution IX):

- `recordBid(seat, amount, roundNumber)`
- `recordPass(seat, roundNumber)`
- `recordMarriage(seat, suit, bonus, roundNumber)`
- `recordTrick(winnerSeat, trickNumber, roundNumber)`
- `recordRoundScore(roundNumber, perSeat, declarerSeat, bid)`
- `recordSpecial(kind, seat, amount, roundNumber)` — `kind ∈ {four-nines, barrel, zeros}`
- `toView()` → returns a shallow-cloned array of entries for the snapshot (the `actionHistory` field).

Lifetime: created in the `Game` constructor (one per game); a new game ⇒ a fresh empty `GameHistory` (FR: log starts empty per game session).

## Entity: View Preference (client only)

The player's collapsed/expanded choice for the panel. Not part of game state.

| Aspect | Value |
|--------|-------|
| Storage | `localStorage` key `thousand_history_open` (`"true"`/`"false"`), best-effort try/catch. |
| Default when unset | Responsive: `window.innerWidth > SMALL_SCREEN_PX` (expanded on larger screens, collapsed on small), FR-010a. |
| Persistence | Survives reload/reconnect (FR-010). |

## Transport surface

- The snapshot view-model (`RoundSnapshot.buildViewModel`) gains one field:
  - `actionHistory: HistoryEntry[]` — the full game log, identical for all viewers, present on every `round_state_snapshot` (and therefore on reconnect). Defaults to `[]` when no session/history exists.

No new WebSocket message types; no persisted/on-disk schema.
