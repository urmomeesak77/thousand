# WS Message Contracts: Round Setup, Bidding & Selling the Bid

All messages added or modified by this feature. Existing message shapes not listed here are unchanged.

Per-viewer payload variants are called out under each message. The server's responsibility is to filter card identities so that no viewer ever receives the rank/suit of a card not currently visible to them (FR-022 / FR-023).

---

## New: Client → Server

All seven action messages below are processed only if:
- the sender has a `gameId` and `game.round` exists, and
- the sender's per-player 250 ms throttle (`new RateLimiter(250, 1).isAllowed(playerId)`) permits, and
- the sender's seat is `currentTurnSeat` (or, for `start_game` / `sell_cancel`, the declarer seat) for the current `phase`.

Violations either drop silently (throttle) or return an `action_rejected` toast to the sender.

### `bid`

Submitted by the active bidder during the main bidding phase.

```json
{ "type": "bid", "amount": 120 }
```

| Field  | Type    | Required | Notes |
|--------|---------|----------|-------|
| type   | string  | yes      | `"bid"` |
| amount | integer | yes      | Multiple of 5, ≥ smallest legal bid for the moment, ≤ 300. Smallest legal bid is **100** when no bid has yet been accepted (`Round.currentHighBid === null`) and **`currentHighBid + 5`** thereafter — see FR-008 |

**Server behaviour**: validate per FR-008; on accept, broadcast `bid_accepted` + `phase_changed`. On reject, send `action_rejected` to the actor only.

### `pass`

Submitted by the active bidder during main bidding to pass for the rest of the round, OR by the active opponent during selling-bidding to pass for the rest of the current selling attempt.

```json
{ "type": "pass" }
```

**Server behaviour**: lock the seat per FR-009 (main bidding) or per FR-015 (current selling attempt only). Resolve the phase if only one bidder remains. Broadcast `pass_accepted` + `phase_changed`. The same message type is used in both phases; the server disambiguates by `round.phase`.

### `sell_start`

Submitted by the declarer in `post-bid-decision` to enter the card-selection step.

```json
{ "type": "sell_start" }
```

**Server behaviour**: validate sender === `declarerSeat`, `phase === 'post-bid-decision'`, the sender is the **original** declarer (no prior `attemptHistory` entry with `outcome: 'sold'`), and `attemptCount < 3` (per FR-018). On accept, transition to `selling-selection`, broadcast `sell_started` + `phase_changed`. On reject, send `action_rejected` to the actor only.

### `sell_select`

Submitted by the declarer during the `selling-selection` phase to commit a 3-card exposure.

```json
{ "type": "sell_select", "cardIds": [4, 9, 17] }
```

| Field   | Type        | Required | Notes |
|---------|-------------|----------|-------|
| type    | string      | yes      | `"sell_select"` |
| cardIds | int[3]      | yes      | Three distinct integers; each must be currently in the declarer's hand; the set must differ from every prior selling attempt this round |

**Server behaviour**: pre-condition `phase === 'selling-selection'`; validate per FR-029 (in-hand, distinct, differs-from-prior); on accept, transfer the 3 ids from `hands[declarerSeat]` to `exposedSellCards`, transition to `selling-bidding`, broadcast `sell_exposed` (with identities to all 3 viewers) + `phase_changed`. On reject, send `action_rejected`.

### `sell_cancel`

Submitted by the declarer during `selling-selection` to return to the post-bid decision state without consuming an attempt.

```json
{ "type": "sell_cancel" }
```

**Server behaviour**: transition back to `post-bid-decision`. `attemptCount` is unchanged. Broadcast `phase_changed`.

### `sell_bid`

Submitted by the active non-declarer opponent during `selling-bidding` to buy.

```json
{ "type": "sell_bid", "amount": 125 }
```

Same shape and validation as `bid`, with `currentHighBid` initialised to the round's bid that opened Selling (so the first overbid must be ≥ original + 5).

**Server behaviour**: validate per FR-008 + FR-015 (sender must not be the declarer); on accept, broadcast `bid_accepted` + `phase_changed`. Resolution (sale or retry) happens when the other opponent passes.

### `sell_pass`

Submitted by the active non-declarer opponent to pass on the current selling attempt only.

```json
{ "type": "sell_pass" }
```

**Server behaviour**: lock the seat for this attempt only (eligibility resets next attempt — FR-015). If both opponents have now passed: resolve as `outcome: 'returned'`, increment `attemptCount`, broadcast `sell_resolved` + `phase_changed`. If exactly one opponent has passed and the other has bid at least once: resolve as `outcome: 'sold'`, swap hands, broadcast `sell_resolved` + `phase_changed`.

### `start_game`

Submitted by the declarer in `post-bid-decision` to finalise the round and emit the play-phase handoff.

```json
{ "type": "start_game" }
```

**Server behaviour**: emit `play_phase_ready` to all 3 (FR-019), null out each player's `gameId`, delete the game record (FR-032), broadcast `lobby_update`. Idempotent under duplicate clicks (FR-026).

---

## New: Server → Client

Unless noted, broadcast to all 3 players in the game.

### `round_started`

Sent once, immediately after the 3rd player is admitted. Carries the canonical 24-step deal sequence with per-viewer filtered identities.

```json
{
  "type": "round_started",
  "seats": {
    "self": 0,
    "left": 1,
    "right": 2,
    "dealer": 0,
    "players": [
      { "seat": 0, "playerId": "...", "nickname": "Alice" },
      { "seat": 1, "playerId": "...", "nickname": "Bob" },
      { "seat": 2, "playerId": "...", "nickname": "Carol" }
    ]
  },
  "dealSequence": [
    { "id": 0, "to": "seat0", "rank": "A", "suit": "♣" },
    { "id": 1, "to": "seat1" },
    { "id": 2, "to": "seat2" },
    { "id": 3, "to": "talon", "rank": "10", "suit": "♥" },
    "..."
  ],
  "gameStatus": { /* GameStatus view-model — see data-model.md */ }
}
```

| Field | Type | Notes |
|---|---|---|
| seats.self | integer 0–2 | This recipient's seat index |
| seats.left | integer 0–2 | Per FR-005: the opponent who acts immediately after self in clockwise order |
| seats.right | integer 0–2 | The other opponent |
| seats.dealer | integer (always `0` in this spec) | Per FR-003 the host = 1st joiner = seat 0; in the single-round scope of this spec the Dealer is always the host, so this field is always `0`. The field remains an integer to leave room for future multi-round dealer rotation (out of scope). |
| seats.players[].seat / playerId / nickname | | Public per-seat identity |
| dealSequence[].id | integer 0–23 | Card id (stable for the round) |
| dealSequence[].to | string | `"seat0"`, `"seat1"`, `"seat2"`, or `"talon"` |
| dealSequence[].rank / suit | optional | Included iff this destination is visible to this recipient (own seat OR talon — see Per-viewer payload below) |
| gameStatus | object | Initial view-model with `phase: 'Dealing'` |

**Per-viewer payload**: For each recipient, identities (`rank` + `suit`) are included for steps where `to === 'talon'` OR `to === 'seat' + recipient.seat`. Other steps are id-only.

**Client behaviour**: Replace the current `WaitingRoom` with the `GameScreen`. Seed `cardsById` with every step that includes identity (i.e., own-hand + talon). Animate the 24 steps using `Antlion.onTick`. Disable all action controls until the animation completes (FR-024).

---

### `phase_changed`

Pushed after every state-changing action that succeeds.

```json
{
  "type": "phase_changed",
  "phase": "Bidding",
  "gameStatus": { /* GameStatus view-model */ }
}
```

| Field | Type | Notes |
|---|---|---|
| phase | string | Display phase label (matches `gameStatus.phase`) |
| gameStatus | object | Full view-model — clients render the status bar straight off this |

**Client behaviour**: render the `StatusBar` off `gameStatus`. Compute which UI controls to render based on `phase` + own-seat (per the FR-026 matrix). The `viewerIsActive` flag on `gameStatus` is computed per-recipient.

---

### `bid_accepted`

```json
{ "type": "bid_accepted", "playerId": "...", "amount": 120, "gameStatus": { /* ... */ } }
```

**Client behaviour**: animate any UI flourish for the bid (e.g., a brief chip flash on the bidder's seat). Update `currentHighBid` from `gameStatus`. The active bidder rotates per `gameStatus.activePlayer`.

---

### `pass_accepted`

```json
{ "type": "pass_accepted", "playerId": "...", "gameStatus": { /* ... */ } }
```

**Client behaviour**: render the passed-players list from `gameStatus.passedPlayers`. Hide Bid/Pass on the passed player's client per FR-026.

---

### `talon_absorbed`

Sent at the moment the declarer's hand grows from 7 to 10 (immediately after bidding resolves).

```json
{
  "type": "talon_absorbed",
  "declarerId": "...",
  "talonIds": [3, 11, 21],
  "identities": { "3": { "rank": "10", "suit": "♥" }, "...": { "..." } },
  "gameStatus": { /* ... */ }
}
```

| Field | Type | Notes |
|---|---|---|
| declarerId | string | The declarer's playerId |
| talonIds | int[3] | The card ids that moved from the talon into the declarer's hand |
| identities | object \| omitted | Sent ONLY to the declarer recipient. Maps each id to `{ rank, suit }`. Other recipients receive no `identities` field. |
| gameStatus | object | View-model with `phase: 'Declarer deciding'` |

**Per-viewer payload**: To the declarer, `identities` is included (they already had these face-up but the message confirms ownership). To both opponents, `identities` is omitted — and opponents MUST immediately delete the 3 ids from their `cardsById` map (FR-023), since the talon area becomes empty and those cards are no longer visible to them.

**Client behaviour**: animate the 3 talon sprites flying into the declarer's hand. On animation complete, opponents flip those sprites to card-backs (or render them as part of the declarer's face-down pile). The declarer re-sorts their hand per FR-005.

---

### `sell_started`

Sent when the declarer presses Sell-the-Bid and enters the card-selection step.

```json
{ "type": "sell_started", "gameStatus": { /* phase: 'Selling' */ } }
```

No card movement yet. Client renders the `SellSelectionControls` for the declarer and "Waiting for declarer to choose…" for the opponents.

---

### `sell_exposed`

Sent when the declarer commits a 3-card exposure (after the server validates the `sell_select` message).

```json
{
  "type": "sell_exposed",
  "declarerId": "...",
  "exposedIds": [4, 9, 17],
  "identities": { "4": { "rank": "Q", "suit": "♠" }, "9": { "...": "..." }, "17": { "..." } },
  "gameStatus": { /* ... */ }
}
```

**Per-viewer payload**: `identities` is included for ALL 3 recipients (the exposed cards become visible to everyone per FR-022).

**Client behaviour**: animate the 3 selected sprites from the declarer's hand to the centre. Opponents flip those sprites face-up at landing. The two non-declarer opponents see operable `SellBidControls` per FR-026 (the active one operable, the other disabled).

---

### `sell_resolved`

Sent when the selling-bidding phase ends — either by sale or by both opponents passing.

```json
{
  "type": "sell_resolved",
  "outcome": "sold",
  "oldDeclarerId": "...",
  "newDeclarerId": "...",
  "exposedIds": [4, 9, 17],
  "gameStatus": { /* phase: 'Declarer deciding' */ }
}
```

| Field | Type | Notes |
|---|---|---|
| outcome | `"sold"` \| `"returned"` | |
| oldDeclarerId | string | |
| newDeclarerId | string \| omitted | Present iff `outcome === 'sold'` |
| exposedIds | int[3] | The 3 cards that were in the centre |

**Per-viewer payload, outcome = 'returned'**: identities of `exposedIds` are dropped from `cardsById` on both opponents (the cards return to the declarer's hidden hand). The declarer keeps them.

**Per-viewer payload, outcome = 'sold'**: identities of `exposedIds` are dropped from `cardsById` on the OLD declarer and the opponent who didn't buy. The new declarer (the buyer) keeps them.

**Client behaviour**: animate the 3 centre sprites either back to the old declarer's hand (returned) or to the new declarer's hand (sold). On animation complete, drop identities per the per-viewer rule above. Re-sort the receiving player's hand per FR-005.

---

### `play_phase_ready`

Sent when the declarer presses Start-the-Game.

```json
{
  "type": "play_phase_ready",
  "declarerId": "...",
  "finalBid": 120,
  "gameStatus": { /* phase: 'Round ready to play' */ }
}
```

The server simultaneously deletes the game record (FR-032).

**Client behaviour**: render `RoundReadyScreen` with the "Round ready to play — next phase coming soon" message and a single operable Back-to-Lobby button.

---

### `round_aborted`

Sent when any player's grace period expires without reconnection — FR-021 (a) active-player disconnect or (b) non-active-player disconnect — or when a player explicitly leaves an in-progress game. Applied symmetrically.

```json
{
  "type": "round_aborted",
  "reason": "player_grace_expired",
  "disconnectedNickname": "Bob",
  "gameStatus": { /* phase: 'Round aborted' */ }
}
```

| Field                 | Type   | Notes |
|-----------------------|--------|-------|
| reason                | string | Enum: `"player_grace_expired"` (grace-period expiry per FR-021) \| `"player_left"` (player explicitly left the game while in-progress). Reserved for future causes (e.g., `"server_error"`). |
| disconnectedNickname  | string | Nickname of the player whose grace expired (or who left) — used by the abort screen message ("Round aborted — {nickname} did not reconnect"). |
| gameStatus            | object | View-model with `phase: 'Round aborted'`. |

The server simultaneously deletes the game record (FR-032).

**Client behaviour**: render `RoundReadyScreen` with the abort message and Back-to-Lobby.

---

### `action_rejected`

Sent ONLY to the actor whose action was rejected (FR-031). Never broadcast.

```json
{ "type": "action_rejected", "reason": "Bid must be a multiple of 5" }
```

| Field | Type | Notes |
|---|---|---|
| reason | string | Concise human-readable explanation; client routes to `Toast.show()` |

Throttle drops (FR-030) do NOT produce this message — they are silent.

---

### `round_state_snapshot`

Sent ONLY to a reconnecting player whose game is in `in-progress` status. Replaces the existing feature-003 `game_joined` follow-up for in-progress games.

```json
{
  "type": "round_state_snapshot",
  "phase": "Selling",
  "gameStatus": { /* ... */ },
  "seats": { /* ... — same shape as round_started.seats */ },
  "myHand": [{ "id": 4, "rank": "Q", "suit": "♠" }, "..."],
  "exposed": [{ "id": 17, "rank": "K", "suit": "♣" }, "..."],
  "opponentHandSizes": { "1": 7, "2": 7 },
  "exposedSellCardIds": [4, 9, 17],
  "talonIds": [3, 11, 21],
  "dealSequence": [{ "id": 0, "to": "seat1" }, { "id": 1, "to": "seat2", "rank": "K", "suit": "♣" }, "..."]
}
```

| Field | Type | Notes |
|---|---|---|
| phase | string | Same enum as `gameStatus.phase` |
| gameStatus | object | View-model |
| seats | object | Same shape as `round_started.seats` — recipient's `self`/`left`/`right`/`dealer` |
| myHand | array | Recipient's hand, with identities |
| exposed | array \| omitted | Present iff `phase === 'Selling'` and we are in the selling-bidding sub-phase. Each entry has full identity (rank, suit) — exposed cards are visible to all viewers. |
| opponentHandSizes | object | Map `seatIdx → handSize`, identities never included |
| talonIds | int[] \| omitted | Present iff `round.talon.length > 0` (i.e., not yet absorbed). Identities are NOT included — the talon is rendered face-down per the post-launch product change (see FR-006 / commit `dad1b57`). |
| exposedSellCardIds | int[] \| omitted | Present iff `round.exposedSellCards.length > 0`. Companion id-only field to `exposed` so the client can lay out face-back sprites before mapping identities. |
| dealSequence | array \| omitted | Present iff `phase === 'Bidding'` AND `currentHighBid === null` (i.e., the reconnect arrived during pre-first-bid bidding); the client replays the deal animation rather than snapping. Each step has `{ id, to }`; `rank` and `suit` are included only on steps where `to === 'seat' + recipient.seat`. Animating a partially-played round would be jarring, so this field is intentionally suppressed once the first bid has landed. |

**Per-viewer payload**: every identity in this message MUST come from the recipient's currently-visible scope per the per-viewer visibility table in `data-model.md`. The server MUST NOT send identities for cards that have left the recipient's visible scope at any prior point in the round.

**Client behaviour**: render the layout immediately with NO animation (FR-027). Re-create `cardsById` from `myHand` + `talon?` + `exposed?`. Initialise sprites for opponents' hands from `opponentHandSizes`. Resume normal animation behaviour for any subsequent messages.

---

### `player_disconnected`

```json
{ "type": "player_disconnected", "playerId": "...", "gameStatus": { /* ... */ } }
```

Sent when a player enters their grace period during an in-progress round. `gameStatus.disconnectedPlayers` is updated.

**Client behaviour**: render the "Connection lost…" badge next to the matching seat (FR-021, FR-025).

If the disconnected player is the `currentTurnSeat`, the server also flips `round.isPausedByDisconnect = true` and subsequently rejects all state-changing actions until reconnect or grace expiry (FR-021).

---

### `player_reconnected`

```json
{ "type": "player_reconnected", "playerId": "...", "gameStatus": { /* ... */ } }
```

Sent the instant a previously-disconnected player reconnects within their grace period.

**Client behaviour**: clear the "Connection lost…" badge on the matching seat.

If the reconnecting player is the `currentTurnSeat`, the server flips `round.isPausedByDisconnect = false` and resumes action-acceptance.

---

## Modified: Server → Client

### `connected` (no shape change, behavioural extension)

When the `hello` handshake restores a player whose `gameId` points to an `in-progress` game, the server's existing follow-up sequence changes:

Before (feature 003): `connected` → `game_joined`.
Now (for in-progress games): `connected` → `round_state_snapshot` (no `game_joined`).

For games still in `waiting` status, the existing feature-003 flow is unchanged.

For players whose prior game has already cleaned up (FR-032) by the time they reconnect, the server returns `connected { restored: true, gameId: null }` and the client routes to the lobby — no `game_joined`, no `round_state_snapshot`.

### `lobby_update` (no shape change)

A game's transition from `waiting` to `in-progress` causes a `lobby_update` broadcast that drops the game from the public lobby (FR-020). Same on round end (the record is deleted entirely).
