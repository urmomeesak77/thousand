# WS Message Contracts: Four Nines Bonus

Messages added or modified by this feature. Everything else from features 004/005 is unchanged. Per-viewer card-identity filtering rules (FR-019) are unchanged except for the one intentional disclosure noted below (FR-003 / research Decision 6).

---

## Server → Client (new)

### `four_nines_awarded`

Broadcast to all three clients at the `card-exchange → trick-play` transition when exactly one player's 8-card hand holds all four 9s (FR-001, FR-002, FR-003). Opens the blocking modal and gates the first trick lead.

```json
{
  "type": "four_nines_awarded",
  "seat": 1,
  "nickname": "kashka",
  "amount": 100,
  "cumulativeScores": { "0": 120, "1": 410, "2": 95 }
}
```

| Field | Type | Notes |
|-------|------|-------|
| seat | integer | Seat of the awarded player. |
| nickname | string | Awarded player's nickname (for the modal text). |
| amount | integer | Always `100`. |
| cumulativeScores | object | Post-bonus cumulative totals for all three seats, so the status bar / scoreboard reflect the +100 immediately (FR-018). |

**Client behaviour**: render the `FourNinesPrompt` blocking modal ("{nickname} holds four nines: +100"); the **Acknowledge** button is the only operable control; all trick-play controls are suppressed until the gate closes (FR-003, FR-020). Update the always-visible cumulative display.

**Disclosure note**: this message reveals that `seat` holds all four 9s. This is the single intentional exception to FR-019, analogous to a declared marriage (research Decision 6). No other identities are sent.

### `four_nines_ack_progress` (optional / may be folded into `phase_changed`)

Broadcast after each acknowledgment so clients can show "Waiting for N of 3…".

```json
{ "type": "four_nines_ack_progress", "acknowledgedSeats": [1], "remaining": 2 }
```

When `remaining` reaches 0 the server unlocks the first lead and emits the normal `trick_play_started` (held back until now) so the declarer's lead becomes operable. (Implementations may instead carry ack progress on `phase_changed`; the contract requirement is only that the first lead is gated until all three acks are recorded.)

---

## Client → Server (new)

### `acknowledge_four_nines`

Submitted by each player to dismiss the four-nines modal (FR-003). Processed only while a four-nines gate is open for the sender's game.

```json
{ "type": "acknowledge_four_nines" }
```

**Processing preconditions** (consistent with the 005 action gate):
- sender has a `gameId`, `game.session` exists and is `in-progress`, `game.round` exists;
- `Round.fourNinesAckPending === true`;
- per-player 250 ms throttle permits (FR-027 extended to this message).

**Server behaviour**: add the sender's seat to `Round.fourNinesAcks` (idempotent — a duplicate ack from the same seat is a no-op, FR-005). Broadcast `four_nines_ack_progress`. When `fourNinesAcks.size === 3`, set `fourNinesAckPending = false` and broadcast the held-back `trick_play_started` so the first lead becomes operable. The press is **sticky**: if an acknowledged player disconnects, the recorded ack persists and the gate can still complete once the other seats ack, subject to the disconnected seat's grace window (mirrors `continue_to_next_round`, 005 FR-025).

**Rejection**: if `fourNinesAckPending` is false (no open gate), the message is ignored (no `action_rejected` toast — there is nothing to acknowledge).

---

## Modified message behaviour

### `exchange_pass` (second commit)

Feature 005 transitioned `phase` to `trick-play` and immediately broadcast `trick_play_started` on the second `exchange_pass`. Now, on that transition the server additionally runs four-nines detection (`findFourNinesSeat(hands, deck)`):

- **No four-nines**: behaviour unchanged — `trick_play_started` is broadcast and the declarer's lead is operable.
- **Four-nines found**: call `Game.applyFourNinesBonus(seat)`, set `Round.fourNinesAward` + open the ack-gate, broadcast `four_nines_awarded`, and **withhold** `trick_play_started` until all three `acknowledge_four_nines` arrive.

### `play_card` (first lead, while gate open)

While `Round.fourNinesAckPending === true`, a `play_card` from the declarer is rejected with `action_rejected` to the sender only ("Acknowledge the four-nines bonus first") and does not mutate state (R-103). Once the gate clears, `play_card` behaves exactly as in feature 005.

### `round_summary`

The per-player summary payload gains an optional `fourNinesBonus: 100` field on the awarded seat's row (FR-008). Absent/zero for everyone else.

### `final_results`

Each per-round history entry for a round in which the bonus fired carries the `fourNinesAward` so the awarded player's running cumulative for that round is auditable (FR-009).
