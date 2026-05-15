# WS Message Contracts: Play Phase, Scoring, Multi-Round & Victory

All messages added or modified by this feature. Existing message shapes (feature 004) not listed here are unchanged.

Per-viewer payload variants are called out under each message. The server's responsibility is to filter card identities so no viewer ever receives the rank/suit of a card not currently visible to them (FR-019; see `data-model.md` visibility table).

---

## Client → Server (new)

All four action messages below are processed only if:
- the sender has a `gameId`, `game.session` exists, `game.round` exists, and `game.session.gameStatus === 'in-progress'`;
- the sender's per-player 250 ms throttle (`new RateLimiter(250, 1).isAllowed(playerId)`) permits;
- the sender's seat matches the active-player requirement for the current `phase` (per the FR-026 / FR-020 gating).

Violations either drop silently (throttle) or return an `action_rejected` toast to the sender.

### `exchange_pass`

Submitted by the declarer during the `card-exchange` phase to commit one card → one opponent. Sent twice per round (one per direction).

```json
{ "type": "exchange_pass", "cardId": 5, "to": 1 }
```

| Field  | Type    | Required | Notes |
|--------|---------|----------|-------|
| type   | string  | yes      | `"exchange_pass"` |
| cardId | integer | yes      | Must currently be in the declarer's hand. |
| to     | integer | yes      | One of the two non-declarer seat indices. Must NOT already have received a pass this round (FR-003). |

**Server behaviour** (FR-002, FR-003): validate (a) card in hand, (b) `to` ∈ {non-declarer seats}, (c) `to` not used in a prior pass this round. On accept: move the card from `hands[declarerSeat]` into `hands[to]`; increment `exchangePassesCommitted`; broadcast `card_passed` (with identity filtered per FR-019) + `phase_changed`. If this was the second pass, transition `phase` to `trick-play`, set `trickNumber = 1`, `currentTrickLeaderSeat = declarerSeat`, `currentTurnSeat = declarerSeat`, and broadcast `trick_play_started` + `phase_changed`. On reject: `action_rejected` to the sender only.

### `play_card`

Submitted by the active player during the `trick-play` phase. Combined with an optional `declareMarriage` flag for the marriage-declaration path (Decision 5).

```json
{ "type": "play_card", "cardId": 12, "declareMarriage": true }
```

| Field            | Type    | Required | Notes |
|------------------|---------|----------|-------|
| type             | string  | yes      | `"play_card"` |
| cardId           | integer | yes      | Must currently be in the sender's hand. |
| declareMarriage  | boolean | no       | If `true`: the played card MUST be a K or Q whose suit pairs with the other rank held by the sender; trick number MUST be in [2, 6]; sender MUST be leading. Combined declaration + play (FR-009 / FR-010). Defaults to `false`. |

**Server behaviour** (FR-007, FR-008, FR-010): validate (a) sender's seat === `currentTurnSeat`, (b) card in hand, (c) follow-suit / trump-priority rule per FR-007, (d) if `declareMarriage === true`: also re-validate marriage conditions (FR-010 a / b). On accept:
- If `declareMarriage === true`: add `{ playerSeat, suit, bonus, trickNumber }` to `Round.declaredMarriages`; set `Round.currentTrumpSuit = suit`; broadcast `marriage_declared` + `trump_changed` to all 3.
- Always: append the card to `Round.currentTrick`; remove from sender's hand; broadcast `card_played` (with full identity to all 3) + `phase_changed`.
- If `Round.currentTrick.length === 3`: resolve per FR-008 (`winnerOf`); move the 3 cards into `Round.collectedTricks[winnerSeat]`; increment `trickNumber`; set `currentTrickLeaderSeat = winnerSeat`; clear `currentTrick`; broadcast `trick_resolved`. If this was trick 8: transition `phase` to `round-summary`; compute scores + deltas; apply via `Game.applyRoundEnd`; broadcast `round_summary` + `phase_changed`. Otherwise broadcast `phase_changed` with the next trick's leader as `activePlayer`.

On reject: `action_rejected` to the sender only. If `declareMarriage` was set but the marriage conditions fail, the card is NOT played — the entire action rejects atomically (per Decision 5).

### `continue_to_next_round`

Submitted by any player on the `round-summary` screen (US3, FR-016).

```json
{ "type": "continue_to_next_round" }
```

**Server behaviour** (FR-016, FR-025): validate `Round.phase === 'round-summary'` and `Game.gameStatus === 'in-progress'`. Add the sender's seat to `Game.continuePresses`. Broadcast `continue_press_recorded` + `phase_changed` (so all 3 clients see the updated `continuePressedSeats`). If `continuePresses.size === 3`:
- Compute the new dealer seat (`(currentDealer + 1) % 3`).
- Increment `Game.currentRoundNumber`.
- Clear `Game.continuePresses`.
- Instantiate a new `Round` with the rotated dealer seat.
- Broadcast `next_round_started` (carries the new `round_started` payload for each viewer, per-viewer filtered, with `roundNumber` and the rotated seat layout).

Idempotent under duplicate clicks (the press is added to a Set; a duplicate is a no-op but does NOT reject — the press persists per FR-025 sticky-press semantics).

### `back_to_lobby`

Submitted by any player on either the `final-results` screen (FR-017) or the `round-aborted` / `game-aborted` screens. **No server action** other than acknowledging the press for telemetry-purposes — the game record has already been purged on the terminal broadcast (FR-029). The client transitions to the lobby locally on press.

For consistency with feature 004's per-player Back-to-Lobby behaviour, the server treats this message as a no-op. Listed here for protocol completeness only — implementations MAY omit sending it entirely (the existing client navigation is purely local).

---

## Server → Client (new)

Unless noted, broadcast to all 3 players in the game.

### `card_exchange_started`

Sent immediately after `start_game` is processed and the round transitions from `post-bid-decision` to `card-exchange`. (Some implementations may collapse this into `phase_changed` — but a dedicated event makes the client transition explicit.)

```json
{
  "type": "card_exchange_started",
  "declarerId": "...",
  "gameStatus": { "...": "phase: 'Card exchange'" }
}
```

**Per-viewer payload**: identical to all 3 viewers; `viewerIsActive` differs per recipient in the embedded `gameStatus`.

**Client behaviour**: mount the CardExchangeView. For the declarer: render the 10-card hand with tap-to-select; on select, show the two destination buttons "Pass to {left}" / "Pass to {right}". For the opponents: render "Waiting for {declarerNickname} to pass cards…". No animation yet.

---

### `card_passed`

Sent immediately after each `exchange_pass` action commits server-side. One message per pass; two messages per round.

```json
{
  "type": "card_passed",
  "fromSeat": 0,
  "toSeat": 1,
  "cardId": 5,
  "identity": { "rank": "Q", "suit": "♠" },
  "exchangePassesCommitted": 1,
  "gameStatus": { "...": "..." }
}
```

| Field | Type | Notes |
|---|---|---|
| fromSeat | integer | Always the declarer seat. |
| toSeat | integer | The recipient seat. |
| cardId | integer | Card id (stable for the round). |
| identity | `{ rank, suit }` \| omitted | **Sent only to (a) the recipient and (b) the declarer.** Omitted to the third opponent (FR-019). |
| exchangePassesCommitted | 0 \| 1 \| 2 | The new count after this pass. Becomes `2` on the second pass. |

**Client behaviour**: animate the card flying from the declarer's hand area to the recipient's hand area. To the declarer: face-up throughout. To the third opponent: card-back throughout. To the recipient: card-back during motion, **flip to face-up at the destination**. On animation land:
- Declarer drops the identity from `cardsById`.
- Recipient adds the identity to `cardsById`.
- Third opponent never touches `cardsById` for this card.

If `exchangePassesCommitted === 2`, the server's next message is `trick_play_started` (below) — the client should mount the trick-play view on receipt.

---

### `trick_play_started`

Sent once per round, immediately after the second `card_passed`.

```json
{
  "type": "trick_play_started",
  "trickNumber": 1,
  "leaderSeat": 0,
  "gameStatus": { "...": "phase: 'Trick play', trickNumber: 1" }
}
```

**Client behaviour**: transition from CardExchangeView to TrickPlayView. The leader's client renders the lead-trick prompt; opponents render "Waiting for {leaderNickname} to lead…".

---

### `card_played`

Sent immediately after each `play_card` action commits server-side (excluding marriage-declaration which has its own additional events — see below).

```json
{
  "type": "card_played",
  "seat": 1,
  "cardId": 12,
  "identity": { "rank": "10", "suit": "♥" },
  "trickNumber": 1,
  "cardsInTrick": 2,
  "gameStatus": { "...": "..." }
}
```

| Field | Type | Notes |
|---|---|---|
| seat | integer | Seat that played the card. |
| cardId | integer | |
| identity | `{ rank, suit }` | **Sent to ALL 3 viewers** — the card is face-up in the centre. |
| trickNumber | 1..8 | |
| cardsInTrick | 1 \| 2 \| 3 | The new length after this play. |

**Client behaviour**: animate the card from the player's hand slot to the centre slot. All 3 clients add the identity to `cardsById` (already present for the player). Opponents see the card flip face-up on landing.

If `cardsInTrick === 3`, the server's next message is `trick_resolved` (below) — the client should NOT clear the centre yet; the resolve message will trigger the move-to-stack animation.

---

### `marriage_declared`

Sent immediately when a player confirms Declare and play (FR-010). Precedes the corresponding `card_played` in the same action.

```json
{
  "type": "marriage_declared",
  "playerSeat": 0,
  "playerNickname": "Alice",
  "suit": "♥",
  "bonus": 60,
  "trickNumber": 2,
  "newTrumpSuit": "♥",
  "gameStatus": { "...": "currentTrumpSuit: '♥', ..." }
}
```

**Client behaviour**: show a brief banner / flourish ("Alice declared marriage in Hearts!") and update the status display's trump indicator. The player's round-total chip flashes with `+60`. No card movement yet — the subsequent `card_played` animates the K or Q to the centre.

---

### `trump_changed`

Sent when the trump suit changes mid-round (always paired with a `marriage_declared` — they may be combined into one message in implementation, but they're listed separately here for protocol clarity).

```json
{
  "type": "trump_changed",
  "newTrumpSuit": "♣",
  "gameStatus": { "...": "currentTrumpSuit: '♣', ..." }
}
```

**Client behaviour**: update the status display's trump indicator. Card-disable logic on opponents' clients re-evaluates (the new trump may change which cards are operable on the next turn).

Implementations MAY fold this into `marriage_declared` (the suit fields are redundant); document either way in the implementation. The protocol-level guarantee is: by the time `card_played` for the marriage lead arrives, `gameStatus.currentTrumpSuit` matches the declared suit on every client.

---

### `trick_resolved`

Sent when the 3rd card of a trick is played.

```json
{
  "type": "trick_resolved",
  "trickNumber": 1,
  "winnerSeat": 0,
  "winningCardId": 5,
  "trickCardIds": [5, 11, 18],
  "collectedTrickCounts": { "0": 1, "1": 0, "2": 0 },
  "gameStatus": { "...": "..." }
}
```

| Field | Type | Notes |
|---|---|---|
| trickNumber | 1..8 | The trick that just resolved. |
| winnerSeat | integer | |
| winningCardId | integer | The card that won, for client emphasis during the resolve animation. |
| trickCardIds | int[3] | The 3 card ids that played, in play order. |
| collectedTrickCounts | object | Map seat → 0..8; the running count of tricks won. |

**Client behaviour**: after a brief pause (~350 ms — see Decision 10), animate the 3 cards from the centre to the winner's collected-stack slot. Cards animate face-up during the flight; **flip to face-down at the destination**. On animation land:
- All 3 clients drop the 3 identities from `cardsById`.
- The winner's collected-stack badge updates from `collectedTrickCounts`.
- The lead-prompt for the next trick becomes operable for the winner.

If `trickNumber === 8`, the server's next message is `round_summary` (below) — the client transitions to the RoundSummaryScreen after the collect animation lands.

---

### `round_summary`

Sent once per round, immediately after the 8th `trick_resolved` and after server-side scoring (FR-013 + FR-014 + barrel/three-zero penalties FR-023/FR-024) completes.

```json
{
  "type": "round_summary",
  "summary": {
    "roundNumber": 1,
    "declarerSeat": 0,
    "declarerNickname": "Alice",
    "bid": 120,
    "declarerMadeBid": true,
    "perPlayer": {
      "0": { "nickname": "Alice", "seat": 0, "trickPoints": 60, "marriageBonus": 60, "roundTotal": 120, "delta": 120, "cumulativeAfter": 120, "penalties": [] },
      "1": { "nickname": "Bob",   "seat": 1, "trickPoints": 30, "marriageBonus": 0,  "roundTotal": 30,  "delta": 30,  "cumulativeAfter": 30,  "penalties": [] },
      "2": { "nickname": "Carol", "seat": 2, "trickPoints": 30, "marriageBonus": 0,  "roundTotal": 30,  "delta": 30,  "cumulativeAfter": 30,  "penalties": [] }
    },
    "victoryReached": false
  },
  "viewerCollectedCards": [
    { "rank": "A", "suit": "♣" },
    { "rank": "10", "suit": "♣" }
  ],
  "gameStatus": { "...": "phase: 'Round complete', ..." }
}
```

**Per-viewer payload**: the `summary` object is identical for all 3 viewers. The `viewerCollectedCards` field is **per-viewer** and contains only that viewer's own collected cards' identities (FR-019). Other viewers' collected cards' identities are NEVER sent.

**Client behaviour**: mount the RoundSummaryScreen with the summary view-model. The viewer's own row shows their collected cards as a clickable "view" affordance (or the summary may simply list them — implementation choice). The operable control:
- If `summary.victoryReached === false`: a single **Continue to Next Round** button (FR-015).
- If `summary.victoryReached === true`: brief display, then the server emits `final_results` and the client transitions.

The server emits `final_results` on the SAME tick as `round_summary` if a victory is reached, so the client SHOULD render the summary and the final-results screen back-to-back. Implementations MAY add a brief pause (~1.5 s) before mounting the final-results screen so the summary is visible.

---

### `continue_press_recorded`

Sent each time a `continue_to_next_round` is processed.

```json
{
  "type": "continue_press_recorded",
  "seat": 1,
  "continuePressedSeats": [1, 2],
  "gameStatus": { "...": "continuePressedSeats: [1, 2], ..." }
}
```

**Client behaviour**: mark the press indicator next to the matching seat on the summary screen ("Continued ✓"). When the local viewer's seat appears in the array, their own Continue button becomes non-operable (already pressed) but the screen remains visible until the third press triggers `next_round_started`.

---

### `next_round_started`

Sent when the third `continue_to_next_round` lands (FR-016). Replaces the existing `round_started` for round 2+ (same shape, but with the new dealer seat and round number).

```json
{
  "type": "next_round_started",
  "roundNumber": 2,
  "seats": { "self": 0, "left": 1, "right": 2, "dealer": 1, "players": ["..."] },
  "dealSequence": ["..."],
  "gameStatus": { "...": "phase: 'Dealing', roundNumber: 2, ..." }
}
```

| Field | Type | Notes |
|---|---|---|
| roundNumber | integer | The new round number. |
| seats | object | Same shape as `round_started.seats`, with the **rotated** `dealer` seat. |
| dealSequence | array | Same shape as `round_started.dealSequence`; per-viewer-filtered identities. |
| gameStatus | object | Carries the rotated `dealerSeat`, the new `roundNumber`, the **carried-over** `cumulativeScores` and `barrelMarkers`. |

**Client behaviour**: identical to `round_started` (mount the deal animation), with the cumulative scores from the prior round visible from the first frame.

---

### `final_results`

Sent when any player's new cumulative reaches ≥ 1000 (FR-017). One broadcast; same shape to all 3 viewers (no card identities).

```json
{
  "type": "final_results",
  "finalResults": {
    "winnerSeat": 0,
    "winnerNickname": "Alice",
    "finalRanking": [
      { "seat": 0, "nickname": "Alice", "cumulativeScore": 1020, "isWinner": true  },
      { "seat": 1, "nickname": "Bob",   "cumulativeScore":  650, "isWinner": false },
      { "seat": 2, "nickname": "Carol", "cumulativeScore":  330, "isWinner": false }
    ],
    "history": [
      {
        "roundNumber": 1,
        "declarerSeat": 0,
        "declarerNickname": "Alice",
        "bid": 120,
        "perPlayer": {
          "0": { "trickPoints": 60, "marriageBonus": 60, "delta": 120, "cumulativeAfter": 120, "penalties": [] },
          "1": { "trickPoints": 30, "marriageBonus": 0,  "delta": 30,  "cumulativeAfter": 30,  "penalties": [] },
          "2": { "trickPoints": 30, "marriageBonus": 0,  "delta": 30,  "cumulativeAfter": 30,  "penalties": [] }
        }
      },
      "..."
    ]
  },
  "gameStatus": { "...": "phase: 'Game over', ..." }
}
```

The server purges the game record (FR-029) immediately after broadcasting.

**Client behaviour**: mount the FinalResultsScreen. Render the `finalRanking` rows with the winner highlighted; render the `history` as a scrollable table. The only operable control is **Back to Lobby**, navigated individually per FR-029.

---

### `game_aborted`

Sent when any player's grace period expires while on the `round-summary` screen (FR-025 between-rounds path).

```json
{
  "type": "game_aborted",
  "reason": "player_grace_expired",
  "disconnectedNickname": "Bob",
  "gameStatus": { "...": "phase: 'Game aborted', ..." }
}
```

**Client behaviour**: mount the `RoundReadyScreen` in its abort variant (same UI as feature 004's `round_aborted`, but with the message "Game aborted — {disconnectedNickname} did not reconnect"). Single Back-to-Lobby button.

The server purges the game record (FR-029) immediately after broadcasting.

---

### Modified: `phase_changed` (carried-through field set extended)

The `phase_changed` message shape is unchanged but its embedded `gameStatus` view-model gains the new fields documented in `data-model.md` (`trickNumber`, `currentTrumpSuit`, `cumulativeScores`, `barrelMarkers`, `collectedTrickCounts`, `exchangePassesCommitted`, `continuePressedSeats`, `roundNumber`).

The `phase` field's enum gains the new labels: `'Card exchange'`, `'Trick play'`, `'Round complete'`, `'Game over'`, `'Game aborted'`.

---

### Modified: `round_state_snapshot` (reconnect — extended for new phases)

Same message shape; new optional fields added per the per-phase reconnect requirements (FR-026, see `data-model.md`):

- `phase: 'Card exchange'` snapshot adds `exchangePassesCommitted`, `myHand` (declarer's full 10 or 9 or 8 depending on commits; opponent's 7 or 8 with the received card identity included if applicable), and `receivedFromExchange` (if recipient).
- `phase: 'Trick play'` snapshot adds `trickNumber`, `currentTrickLeaderSeat`, `currentTrick` (with full identities for cards currently in the centre), `currentTrumpSuit`, `declaredMarriages`, `collectedTrickCounts`, `myHand`.
- `phase: 'Round complete'` snapshot adds `summary` (full RoundSummary), `viewerCollectedCards` (per-viewer-filtered), `continuePressedSeats`.
- `phase: 'Game over'` snapshot adds `finalResults`.

In every case, no identity of a card outside the recipient's currently-visible scope is included (FR-019).

The `talonIds` and `dealSequence` fields from feature 004 are absent for any `phase ∉ { 'Dealing', 'Bidding', 'Declarer deciding', 'Selling' }` — the talon is gone by `card-exchange` time.

---

### Unchanged: `bid_accepted`, `pass_accepted`, `talon_absorbed`, `sell_started`, `sell_exposed`, `sell_resolved`, `action_rejected`, `player_disconnected`, `player_reconnected`, `lobby_update`, `connected`

Shapes unchanged. Two behavioural changes worth noting:

- **`bid_accepted`** (FR-022): the server-side validator now consults `Game.barrelState[seat].onBarrel` and rejects bids below 120 from barrel players with reason `"Players on barrel must bid at least 120."`. This applies in both `bid` and `sell_bid` flows.
- **`round_aborted`**: shape unchanged. The cleanup behaviour is now governed by FR-029 (purge on broadcast) rather than feature 004's FR-032 — but for the `round_aborted` path the practical effect is identical.

---

## Removed / superseded

### `play_phase_ready` (feature 004) — **no longer emitted during normal play**

The `play_phase_ready` event was the temporary handoff used at the end of feature 004 when the play phase was unimplemented. With this feature, `start_game` instead transitions the round into `card-exchange` and emits `card_exchange_started` (above). The `play_phase_ready` message shape is preserved in the protocol for backwards compatibility with the existing client code paths that handle it, but the server MUST NOT emit it in any normal flow. The associated `RoundReadyScreen` is retained for use as the abort screen on the `round_aborted` / `game_aborted` paths only.
