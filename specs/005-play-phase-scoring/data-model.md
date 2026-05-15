# Data Model: Play Phase, Scoring, Multi-Round & Victory

Extends the feature-004 data model. Everything in feature 004's `data-model.md` remains in force unless explicitly superseded here.

---

## Server: Game (new — persists across rounds)

A new `Game` instance is attached to each lobby-side `game` record as `game.session` (the existing `game.round` continues to be replaced each round). Created at the moment `store.startRound(gameId)` first runs (i.e., when the 3rd player is admitted); destroyed when the game record is purged (per FR-029).

```js
{
  gameId: string,                                  // back-reference for convenience
  seatOrder: [playerId, playerId, playerId],       // pinned at game-start; never rotates (only `dealerSeat` rotates)
  dealerSeat: 0 | 1 | 2,                           // round-1 starts at 0 (the host, per feature 004 FR-003); rotates +1 clockwise per round (FR-016)
  currentRoundNumber: 1..N,                        // 1-indexed; increments on FR-016 transition

  cumulativeScores: { [seatIdx]: integer },        // may be negative
  barrelState: {
    [seatIdx]: { onBarrel: boolean, barrelRoundsUsed: 0 | 1 | 2 }
  },
  consecutiveZeros: { [seatIdx]: 0 | 1 | 2 },

  continuePresses: Set<seatIdx>,                   // tracks who has pressed Continue on the current round summary (FR-016); sticky across disconnect (FR-025)

  history: RoundHistoryEntry[],                    // append-only; one entry per finished round (Decision 9); broadcast in `final_results` (FR-017)

  gameStatus: 'in-progress' | 'game-over' | 'aborted',
}
```

### `RoundHistoryEntry`

One entry appended to `Game.history` at every round-end (right after `Round` computes deltas, before `Round` is replaced):

```js
{
  roundNumber: 1..N,
  declarerSeat: 0 | 1 | 2,
  declarerNickname: string,
  bid: 100..300,
  perPlayer: {
    [seatIdx]: {
      trickPoints: integer,                                       // sum of card values from won tricks
      marriageBonus: integer,                                     // sum of declared-marriage bonuses
      delta: integer,                                             // total delta applied to cumulative (incl. penalties)
      cumulativeAfter: integer,                                   // running total after this round
      penalties: Array<'barrel-3rd-round' | 'three-zeros'>        // 0..2 entries; each represents a -120 penalty
    }
  }
}
```

### State machine (`gameStatus`)

```
[not-created]         --3rd player admitted, store.startRound(gameId)--> [in-progress]
[in-progress]         --any player's new cumulative ≥ 1000 at round-end--> [game-over]   (FR-017; broadcast final_results, purge)
[in-progress]         --active-player grace expires mid-round--> [aborted]               (FR-025; broadcast round_aborted, purge)
[in-progress]         --any player's grace expires on round-summary screen--> [aborted]  (FR-025; broadcast game_aborted, purge)
```

Note: `gameStatus` is internal accounting; the lobby-side `game.status` (`'waiting'` | `'in-progress'`) is unchanged. `gameStatus` exists so transition handlers can short-circuit late-arriving messages without crashing.

### Invariants

- `cumulativeScores`, `barrelState`, `consecutiveZeros`, and `continuePresses` are mutated only by `Game.applyRoundEnd(roundDeltas)` and `Game.recordContinuePress(seat)`. Direct mutation from `Round` is forbidden.
- `dealerSeat` is mutated only by `Game.startNextRound()` (called once per Continue-set-of-three, per FR-016).
- `Game.history.length === currentRoundNumber - 1` whenever the current `Round` is mid-round (the current round's entry is appended only at round-end).
- After `applyRoundEnd`: for every seat, `barrelState[seat].onBarrel === (cumulativeScores[seat] >= 880 && cumulativeScores[seat] < 1000)`. (See FR-021 transitions.)

---

## Server: Round (extended)

Extends the feature-004 Round. New phases enter at the existing `play-phase-ready` insertion point (which is now no longer reached during normal play — FR-001 replaces it with `card-exchange`).

```js
{
  // existing feature-004 fields unchanged:
  phase, dealerSeat, seatOrder, seatByPlayer, deck, hands, talon, exposedSellCards,
  currentTurnSeat, currentHighBid, bidHistory, passedBidders, passedSellOpponents,
  declarerSeat, attemptCount, attemptHistory, isPausedByDisconnect, disconnectedSeats,
  _lastSellBidderSeat,

  // new fields:
  trickNumber: 0 | 1..8,                                 // 0 before trick play; 1..8 during; 8 at round-end
  currentTrickLeaderSeat: 0 | 1 | 2 | null,              // null outside trick play
  currentTrick: [{ seat: 0|1|2, cardId: int }, ...],     // 0–3 entries; cleared after resolve
  currentTrumpSuit: '♣' | '♠' | '♥' | '♦' | null,        // null until first marriage declared
  declaredMarriages: [
    { playerSeat: 0|1|2, suit: '♣'|'♠'|'♥'|'♦', bonus: 40|60|80|100, trickNumber: 2..6 },
    ...
  ],
  collectedTricks: { [seatIdx]: number[] },              // map seat → array of cardIds collected; never sent to clients
  exchangePassesCommitted: 0 | 1 | 2,                    // 0..2 — number of card-exchange passes committed so far this round
  roundScores: { [seatIdx]: int } | null,                // populated at FR-013 compute
  roundDeltas: { [seatIdx]: int } | null,                // populated at FR-014 compute (after Game.applyRoundEnd)
  summary: RoundSummary | null,                          // populated after FR-013 + FR-014
}
```

The existing `phase` enum is extended:

```
phase ∈ {
  'dealing', 'bidding', 'post-bid-decision',
  'selling-selection', 'selling-bidding',
  'card-exchange',          // NEW — replaces 'play-phase-ready' as the exit from post-bid-decision via start_game
  'trick-play',             // NEW
  'round-summary',          // NEW — replaces the abrupt 'play-phase-ready' terminal screen
  'aborted'                 // round-only abort (mid-round grace expiry)
}
```

Note: the feature-004 `'play-phase-ready'` state is **no longer reached during normal play** — FR-001 sends rounds directly into `'card-exchange'` instead. The state may still appear on the round-aborted path (the existing `RoundReadyScreen` is reused as the abort screen).

### State machine (Round, extended)

```
[post-bid-decision] --declarer: Start the Game (start_game)-->     [card-exchange]      (NEW; replaces direct → play-phase-ready)
[card-exchange]     --declarer commits 2nd pass-->                 [trick-play]         (trickNumber := 1)
[trick-play]        --8th trick resolves-->                        [round-summary]      (FR-013 + FR-014 compute)
[round-summary]     --all 3 pressed Continue + no victory-->       Game.startNextRound() creates a fresh Round (back to [dealing])
[round-summary]     --all 3 pressed Continue + any seat ≥ 1000-->  Game → 'game-over' (broadcast final_results, purge)
[any]               --active-player grace expires-->               [aborted]            (broadcast round_aborted, purge game)
[round-summary]     --any player's grace expires-->                (broadcast game_aborted, purge game; the Round itself is left in 'round-summary' but the game is purged)
```

### Phase invariants (new)

- **`card-exchange`**: `hands[declarerSeat].length` starts at 10 and ends at 8; opponents' hands grow from 7 to 8. `currentTurnSeat = declarerSeat`; `exchangePassesCommitted ∈ {0, 1}` during the phase, becomes `2` at exit. No `currentTrick`, no `trickNumber > 0`.
- **`trick-play`**: every player holds 8 cards at entry. `currentTrickLeaderSeat = declarerSeat` at entry (trick 1); `currentTurnSeat = currentTrickLeaderSeat` until the lead is played, then rotates clockwise. `trickNumber ∈ [1, 8]`. Mid-trick: `currentTrick.length ∈ {1, 2, 3}`; on `length === 3`, server resolves and clears. `currentTrumpSuit` may be `null` (no marriage yet) or any suit (most recent declaration). `collectedTricks[seat].length` is a multiple of 3 (each won trick adds 3 cards).
- **`round-summary`**: `currentTurnSeat = null`. `trickNumber = 8`. All hands empty. `summary` populated. `Round` is otherwise frozen — no state-changing actions affect it; only `Game.continuePresses` mutates.

### Per-trick winner determination (FR-008)

```js
function winnerOf(trick, ledSuit, trumpSuit) {
  const trumpCards = trick.filter(c => c.suit === trumpSuit);
  const candidates = trumpCards.length > 0 ? trumpCards : trick.filter(c => c.suit === ledSuit);
  return candidates.reduce((a, b) => RANK_ORDER[a.rank] > RANK_ORDER[b.rank] ? a : b);
}

const RANK_ORDER = { '9': 0, 'J': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5 };
```

### Card-point values (FR-013)

| Rank | Points |
|---|---|
| A  | 11 |
| 10 | 10 |
| K  | 4 |
| Q  | 3 |
| J  | 2 |
| 9  | 0 |

### Marriage bonuses (FR-009 / FR-010)

| Suit | Bonus |
|---|---|
| ♣ Clubs | 100 |
| ♠ Spades | 80 |
| ♥ Hearts | 60 |
| ♦ Diamonds | 40 |

---

## Trick (logical view-only — not a server class)

`Trick` is a transient projection of three consecutive cards plus a winner. No standalone server class — the server stores `currentTrick` (the in-progress one) on `Round`, and the resolved cards immediately move to `collectedTricks[winnerSeat]`. The shape is documented here for the contracts:

```js
{
  trickNumber: 1..8,
  leaderSeat: 0..2,
  cards: [{ seat: 0..2, cardId: int, rank: string, suit: string }, ...],   // ordered by play (lead first)
  winnerSeat: 0..2 | null,                                                  // populated on resolve
}
```

---

## Marriage Declaration (immutable record)

Appended to `Round.declaredMarriages` whenever a player chooses Declare and play (FR-010). Cannot be retracted.

```js
{
  playerSeat: 0..2,
  suit: '♣' | '♠' | '♥' | '♦',
  bonus: 100 | 80 | 60 | 40,
  trickNumber: 2..6,
}
```

Broadcast to all 3 clients via `marriage_declared` immediately on creation.

---

## Round Summary (view-model)

Built once at round-end (FR-015) and sent as part of `round_summary`. Same shape sent to all 3 clients; each viewer's own `collectedCards` is the only per-viewer-filtered part (FR-019).

```js
{
  roundNumber: 1..N,
  declarerSeat: 0..2,
  declarerNickname: string,
  bid: 100..300,
  declarerMadeBid: boolean,                                  // true iff Round.roundScores[declarerSeat] >= bid
  perPlayer: {
    [seatIdx]: {
      nickname: string,
      seat: 0..2,
      trickPoints: int,                                      // FR-013: sum of collected-card values
      marriageBonus: int,                                    // sum of declared-marriage bonuses
      roundTotal: int,                                       // trickPoints + marriageBonus (pre-made/missed for declarer)
      delta: int,                                            // FR-014: applied to cumulative
      cumulativeAfter: int,                                  // post-delta running total
      penalties: Array<{ kind: 'barrel-3rd-round' | 'three-zeros', amount: -120 }>
    }
  },
  // Per-recipient field — only the viewer's own collected cards are populated:
  viewerCollectedCards: [{ rank: string, suit: string }, ...],

  victoryReached: boolean,                                    // true iff any seat's cumulativeAfter ≥ 1000
}
```

### Operable-controls rule (FR-015)

- If `victoryReached === false`: the only operable control is **Continue to Next Round** (US3).
- If `victoryReached === true`: clients render the summary briefly and then the server emits `final_results`; no Continue control on the summary screen in that case. (The summary screen's "operable control" effectively becomes nothing — the next message replaces it.)

---

## Final Results (view-model)

Built once when any seat reaches ≥ 1000 (FR-017). Broadcast to all 3 clients as `final_results` with the same shape for everyone (the per-round history table contains no card identities, so no per-viewer filter).

```js
{
  winnerSeat: 0..2,                                                              // resolved per Decision 11
  winnerNickname: string,
  finalRanking: [
    { seat: 0..2, nickname: string, cumulativeScore: int, isWinner: boolean },   // sorted descending by cumulativeScore
    { ... },
    { ... }
  ],
  history: RoundHistoryEntry[],                                                  // full Game.history at time of broadcast
}
```

The post-broadcast cleanup (FR-029) purges the `Game` record.

---

## Updated visibility table

Extends feature 004's per-viewer visibility table with the new phases. The unchanged rows are not repeated.

| Phase | Each opponent's hand | Cards-in-current-trick | Cards collected by viewer | Cards collected by others | Notes |
|---|---|---|---|---|---|
| `card-exchange` | own-hand-only to that viewer (each opponent sees their own; receivers gain 1 card mid-phase) | n/a | n/a | n/a | Identity of a passed card sent **only** to (a) the recipient on landing animation, (b) the declarer throughout. The third opponent NEVER learns the identity (FR-019). |
| `trick-play` (in-progress trick) | own-hand-only to that viewer | identities visible to **all 3 viewers** for as long as the card is in the centre | accumulated server-side; viewers see only the **count** via `collectedTrickCounts` | viewers see only the count, never identities | Once the trick resolves and the 3 cards animate to the winner's collected slot, all 3 clients drop the identities from `cardsById` (FR-019). |
| `round-summary` | n/a (all hands empty) | n/a | identities sent to each viewer for **their own** collected cards (so they can verify their trick points) | NEVER | Each viewer sees only their own collected cards' identities; others' are aggregate counts only. (FR-019 final clause.) |
| `final-results` | n/a | n/a | n/a | n/a | The view-model contains no card identities. |

---

## GameStatus view-model (extended)

Extends feature 004's view-model with the new fields required by FR-018. Same shape sent to all 3 clients; `viewerIsActive` differs per recipient.

```js
{
  // existing feature-004 fields (carried through):
  phase, activePlayer, viewerIsActive, currentHighBid, declarer, passedPlayers,
  sellAttempt, disconnectedPlayers,

  // new fields:
  trickNumber: 1..8 | null,                                       // null outside trick-play
  currentTrumpSuit: '♣' | '♠' | '♥' | '♦' | null,                 // FR-018 — "No trump" rendered client-side when null
  cumulativeScores: { [seatIdx]: integer },                       // FR-018 — visible at all times; 0/0/0 in round 1
  barrelMarkers: {
    [seatIdx]: { onBarrel: boolean, barrelRoundsUsed: 0..2 } | undefined
  },
  collectedTrickCounts: { [seatIdx]: 0..8 },                      // FR-008 — shown on every client; never identities
  exchangePassesCommitted: 0 | 1 | 2 | null,                      // null outside card-exchange
  continuePressedSeats: number[] | null,                          // seats that have pressed Continue on the current round-summary; null outside round-summary
  roundNumber: 1..N,                                              // current round number (Game.currentRoundNumber)
}
```

The `phase` enum string used by the view-model:

```
phase ∈ {
  'Dealing', 'Bidding', 'Declarer deciding', 'Selling',
  'Card exchange',          // NEW
  'Trick play',             // NEW
  'Round complete',         // NEW — corresponds to Round.phase = 'round-summary'
  'Game over',              // NEW — Game.gameStatus === 'game-over', final_results broadcast
  'Round aborted',          // existing
  'Game aborted',           // NEW — Game.gameStatus === 'aborted' via FR-025 between-rounds path
}
```

### Validation rules (additions)

- `trickNumber`: present iff `phase === 'Trick play'`.
- `currentTrumpSuit`: null iff no marriage has been declared this round so far; otherwise the suit of the most recent declaration.
- `cumulativeScores`: always present from the moment the game screen appears (round 1 bidding shows {0, 0, 0}).
- `barrelMarkers[seat]`: present iff `Game.barrelState[seat].onBarrel === true`. Absent (or undefined) for seats not on barrel.
- `exchangePassesCommitted`: 0 or 1 during `Card exchange`; absent (null) otherwise.
- `continuePressedSeats`: present iff `phase === 'Round complete'`; lists the seats that have pressed Continue so far.
- `roundNumber`: always present from round 1 onwards.

---

## Per-viewer reconnect snapshot (FR-026 extensions)

Extends feature 004's `round_state_snapshot` for the new phases. The snapshot is the single point of truth — `Round.getSnapshotFor(viewerSeat)` reads the per-viewer visibility table above and assembles the payload.

### Card-exchange snapshot adds:

```js
{
  exchangePassesCommitted: 0 | 1,
  myHand: [...identities],                       // 10 (declarer) or 7/8 (opponents); always full identities for the viewer
  receivedFromExchange: [{ id, rank, suit }] | null,    // if the viewer is an opponent and a card has already been passed to them, identity included
}
```

### Trick-play snapshot adds:

```js
{
  trickNumber: 1..8,
  currentTrickLeaderSeat: 0..2,
  currentTrick: [{ seat, cardId, rank, suit }, ...],    // 0..3 entries; identities always visible (centre cards are face-up to all)
  currentTrumpSuit: '♣' | '♠' | '♥' | '♦' | null,
  declaredMarriages: [...],                              // public — broadcast at declaration time anyway
  collectedTrickCounts: { [seatIdx]: 0..8 },             // counts only
  myHand: [...identities],                               // viewer's remaining hand
}
```

### Round-summary snapshot adds:

```js
{
  summary: RoundSummary,                          // identical to the broadcast `round_summary` payload
  continuePressedSeats: number[],                 // seats that pressed Continue before this reconnect
}
```

### Final-results snapshot adds:

```js
{
  finalResults: FinalResults,                     // identical to the broadcast `final_results` payload
}
```

In every case, the rule from feature 004 holds: NO identity of a card outside the recipient's currently-visible scope is included.

---

## Client: `cardsById` map — additions

Same shape as feature 004's `Map<id, { rank, suit } | null>`. New mutation patterns:

- **Card-exchange (declarer)**: own 2 outgoing cards stay in `cardsById` during the animation (declarer remains the source of truth for them on their own client). On animation land, the declarer drops them from `cardsById`. (The cards are now in opponents' hands; the declarer's view loses identity per FR-019.)
- **Card-exchange (recipient)**: the new incoming card is added to `cardsById` with full identity when the flip-to-face-up animation completes.
- **Card-exchange (third opponent)**: the passed card is never added to `cardsById` (the third opponent only sees a card-back fly between seats; no id is even allocated for visibility).
- **Trick play**: when a card is played to the centre, all 3 clients add its identity to `cardsById` (already present for the player; new entry for the other two). When the trick resolves and the 3 cards animate to the winner's collected stack, all 3 clients drop those identities on animation land.
- **Round-summary**: each viewer's own collected-cards identities are added to `cardsById` for the duration of the summary screen (so the summary view can render them). They are dropped when the next phase begins (Continue press → new round; or `final_results` → game-over). Other viewers' collected cards are never added.

---

## Access patterns (additions)

| Operation | How | Complexity |
|---|---|---|
| Look up game session from a WS message | `game = store.games.get(player.gameId); session = game.session` | O(1) |
| Apply an action to a trick | `round.playCard(seat, cardId, opts)` | O(1) hand mutation + O(1) trick mutation; O(3) resolve scan when trick fills |
| Compute round scores at round-end | `Scoring.roundScores(round, marriages)` | O(24) — iterates collected cards |
| Compute round deltas at round-end | `Scoring.roundDeltas(roundScores, declarerSeat, bid, penalties)` | O(3) |
| Apply deltas to game state | `Game.applyRoundEnd(deltas)` | O(3) — updates cumulativeScores, barrelState, consecutiveZeros, appends history entry |
| Record a Continue press | `Game.recordContinuePress(seat)` | O(1) |
| Determine winner at game-end | `Scoring.determineWinner(game)` | O(3) |
| Build round-summary view-model | `round.buildSummary(game)` | O(3) per-player + O(24) trick-points |
| Build final-results view-model | `Scoring.buildFinalResults(game)` | O(rounds) — history pass-through |
