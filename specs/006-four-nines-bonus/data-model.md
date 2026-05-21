# Phase 1 Data Model: Four Nines Bonus

This feature adds a few fields to existing feature-005 entities; it introduces no new persistent entity. All state is in-memory and lost on server restart.

---

## Round (extended)

New per-round fields (reset each round, like the rest of `Round`):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `fourNinesAward` | `{ seat: 0\|1\|2, amount: 100 } \| null` | `null` | Set once, at the `card-exchange → trick-play` transition, if exactly one player's 8-card hand holds all four 9s (FR-001/FR-002). Drives the summary line item (FR-008) and the history entry (FR-009). |
| `fourNinesAckPending` | `boolean` | `false` | `true` from the moment the award is made until all three players acknowledge. While `true`, `play_card` (the first lead) is rejected (FR-003, R-103). |
| `fourNinesAcks` | `Set<0\|1\|2>` | `∅` | Seats that have acknowledged the modal. Sticky across disconnect (mirrors `continue_to_next_round`). Gate clears when `size === 3`. |

**Validation / invariants**:
- `fourNinesAward` is set **at most once per round** (FR-005). A second detection attempt is a no-op.
- The award is only set when `findFourNinesSeat(hands, deck)` returns a non-null seat at the transition.
- `fourNinesAckPending === true` ⟹ `fourNinesAward !== null`.
- The first `play_card` of the round is accepted only when `fourNinesAward === null` OR `fourNinesAckPending === false`.

**State transition (round-start path)**:
```
... selling/declarer-decision → card-exchange
  exchange_pass (1st)  → still card-exchange
  exchange_pass (2nd)  → trick-play
        ├─ findFourNinesSeat(hands) == null → first lead immediately operable (unchanged 005 path)
        └─ findFourNinesSeat(hands) == seat →
               Game.applyFourNinesBonus(seat)        # +100 banked now
               Round.fourNinesAward = { seat, 100 }
               Round.fourNinesAckPending = true
               broadcast four_nines_awarded
               (first lead gated)
                   acknowledge_four_nines ×3 (sticky)
                       → fourNinesAckPending = false → first lead operable
```

## Game (extended)

| Field / method | Type | Notes |
|----------------|------|-------|
| `applyFourNinesBonus(seat)` | method | `cumulativeScores[seat] += 100`. Records the award onto the in-progress round-history accumulation so the final-results history (FR-009) can attribute the +100. Does **not** touch `roundDeltas`, barrel state, or victory (those run at round end via the unchanged `applyRoundEnd`). |
| `cumulativeScores[seat]` | integer | Existing field; now also bumped mid-round by the bonus. Read by the status bar/scoreboard (FR-018) so the +100 shows during trick play. |

**Invariants**:
- The +100 is added exactly once per occurrence and is **never** part of `roundDeltas` (R-102). Post-round cumulative for the awarded seat = `cumulativeBefore + 100 + roundDelta[seat]`.
- Barrel `onBarrel` recompute and victory check at round end operate on the post-bonus cumulative without special-casing (Decision 4).

## Round Summary view-model (extended)

The per-player summary row (feature 005 FR-015) gains an optional contribution:

| Field | Type | Notes |
|-------|------|-------|
| `fourNinesBonus` | `100 \| 0` (or omit when 0) | Shown as a **distinct labelled line item** ("Four nines: +100") separate from trick points, marriage bonus, and the made/missed round delta (FR-008). Only the awarded seat's row carries it. |

The summary's `cumulativeAfter` for the awarded seat already includes the +100 (it was banked at trick-play start), so the running total reconciles as: `trick/marriage breakdown → made/missed delta → + four-nines bonus → cumulativeAfter`.

## Final Results history (extended)

The per-round history entry (feature 005 FR-017) for a round in which the bonus fired carries the `fourNinesAward` so the affected player's **running cumulative** for that round is auditable — rendered as a distinct contribution/annotation on that round's row (FR-009).

## Reconnect snapshot (extended — FR-010)

`Round.getSnapshotFor(viewerSeat)` adds, while the gate is open:

| Field | Notes |
|-------|-------|
| `fourNinesAward` | `{ seat, amount }` so the reconnecting client can render the modal text. |
| `fourNinesAckPending` | Whether the gate is still open. |
| `viewerHasAcknowledged` | Whether *this* viewer's ack is already recorded (sticky press) — so a reconnecting player who already acked does not see the button as un-pressed. |

Cumulative scores in the snapshot already reflect the banked +100. No collected-card or hand identities beyond the existing 005 rules are added.
