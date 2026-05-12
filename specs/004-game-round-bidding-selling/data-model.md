# Data Model: Round Setup, Bidding & Selling the Bid

## Server: Round

Attached to each `Game` record as `game.round` (initially `null`; populated when the 3rd player is admitted).

```js
{
  phase: 'dealing' | 'bidding' | 'post-bid-decision' | 'selling-selection' | 'selling-bidding' | 'play-phase-ready' | 'aborted',
  dealerSeat: 0 | 1 | 2,                       // host's seat
  seatOrder: [playerId, playerId, playerId],   // index 0..2 — clockwise from a fixed origin
  seatBySocket: Map<playerId, seatIdx>,
  deck: [Card, ...],                           // 24 entries; full identities; server-only
  hands: { [seatIdx]: number[] },              // card-id arrays per seat (7, 10, or 7 depending on phase)
  talon: number[],                             // card-id array (3 cards until absorbed, then [])
  exposedSellCards: number[],                  // card-id array (3 during selling, else [])
  currentTurnSeat: 0 | 1 | 2 | null,           // who acts next (null during dealing/play-phase-ready/aborted)
  currentHighBid: number,                      // integer ≥ 100, multiple of 5; starts at 100 (opening minimum)
  bidHistory: [{ seat, amount: number | null }, ...],  // null = pass
  passedBidders: Set<seatIdx>,                 // who has passed in main bidding
  passedSellOpponents: Set<seatIdx>,           // who has passed in the current selling-bidding attempt; resets per attempt
  declarerSeat: seatIdx | null,                // null until bidding resolves
  attemptCount: 0 | 1 | 2 | 3,                 // selling attempts used so far
  attemptHistory: [{ exposedIds: number[], outcome: 'sold' | 'returned' }, ...],
  pausedByDisconnect: boolean,                 // true while the currentTurnSeat player is in their grace period
}
```

### Card

```js
{
  id: number,        // 0..23 — index in the canonical deal sequence; stable for the whole round
  rank: '9' | '10' | 'J' | 'Q' | 'K' | 'A',
  suit: '♣' | '♠' | '♥' | '♦',
}
```

### State machine

```
[not-started]      --3rd player admitted-->                  [dealing]
[dealing]          --first valid action message from the
                     active bidder (P1) after the deal
                     animation has completed on their
                     client (FR-024 gates the client UI)--> [bidding]
[bidding]          --one bidder remains (others passed)-->   [post-bid-decision]   (declarer = sole bidder)
[bidding]          --all 3 passed-->                          [post-bid-decision]   (declarer = dealer @ 100)
[post-bid-decision] --declarer: Start the Game (start_game)--> [play-phase-ready]  (emit + cleanup)
[post-bid-decision] --declarer: Sell the Bid (sell_start)-->   [selling-selection]
[selling-selection] --declarer: Cancel (sell_cancel)-->        [post-bid-decision] (attemptCount unchanged)
[selling-selection] --declarer: Sell w/ valid 3 cards (sell_select)--> [selling-bidding] (cards exposed in centre)
[selling-bidding]   --one opponent buys (other passed)-->     [post-bid-decision]   (declarer = buyer; bid raised; hands swapped)
[selling-bidding]   --both opponents pass-->                  [post-bid-decision]   (attemptCount += 1; cards return)
[post-bid-decision] --attemptCount = 3 (only Start)-->        [play-phase-ready]    (emit + cleanup)
[any]              --active player grace-period expires-->   [aborted]             (broadcast + cleanup)
```

### Phase transitions and the `currentTurnSeat`

| Phase | `currentTurnSeat` |
|---|---|
| `dealing` | `null` (no player can act) |
| `bidding` | The next-clockwise still-eligible (not-passed) seat after the dealer's left. Starts at dealer + 1. |
| `post-bid-decision` | `declarerSeat` |
| `selling-selection` | `declarerSeat` |
| `selling-bidding` | The next-clockwise still-eligible non-declarer seat. Starts at declarer + 1. |
| `play-phase-ready` | `null` |
| `aborted` | `null` |

### Phase-end invariants

- Leaving `dealing`: `hands[0/1/2].length === 7`, `talon.length === 3`, sum of all = 24, no duplicate ids.
- Leaving `bidding`: `declarerSeat !== null`, `currentHighBid ∈ [100, 300]`, multiple of 5.
- Entering `post-bid-decision` from `bidding`: `hands[declarerSeat].length === 10`, `talon.length === 0` (the talon was absorbed).
- During `selling-selection`: `hands[declarerSeat].length === 10`, `exposedSellCards.length === 0`.
- During `selling-bidding`: `hands[declarerSeat].length === 7`, `exposedSellCards.length === 3`, identities visible to all 3 viewers.
- Returning to `post-bid-decision` after `selling-bidding` (all-pass): `hands[declarerSeat].length === 10`, `exposedSellCards.length === 0`.
- After `selling-bidding` sale: `hands[newDeclarer].length === 10`, `hands[oldDeclarer].length === 7`, `exposedSellCards.length === 0`, `declarerSeat = newDeclarer`, `currentHighBid` = the winning sell bid.
- Leaving via `play-phase-ready`: `hands[declarerSeat].length === 10`, the other two seats `.length === 7`, `talon.length === 0`. Server immediately deletes the game record (FR-032).

---

## Server: Game (existing record, extended)

```js
{
  // existing fields unchanged
  id, type, hostId, players: Set<playerId>, requiredPlayers, inviteCode, createdAt, waitingRoomTimer,
  status: 'waiting' | 'in-progress',     // 'in-progress' added by this feature
  round: Round | null,                    // populated when 3rd player joins; nulled on cleanup
}
```

### Auto-start trigger

When `GameController._admitPlayerToGame` brings `game.players.size === game.requiredPlayers` (3): call `store.startRound(gameId)` which (a) sets `game.status = 'in-progress'`, (b) clears `waitingRoomTimer`, (c) instantiates `Round`, (d) calls `round.start()`, (e) calls `store.broadcastLobbyUpdate()` (so the game disappears from the public lobby, FR-020), (f) sends a per-viewer-filtered `round_started` to each player.

### Cleanup (FR-032)

On `play_phase_ready` or `round_aborted`:
1. Send the broadcast (`play_phase_ready` or `round_aborted`).
2. For each `pid` in `game.players`: set `players.get(pid).gameId = null`.
3. Delete `games[gameId]`. Clear any `inviteCode` mapping.
4. Call `broadcastLobbyUpdate()`.

A `hello` arriving from any of the 3 ex-players after this point goes through `createOrRestorePlayer` — the player record still exists (only `gameId` was nulled), so `restored: true` with `gameId: null` is returned and the client routes to the lobby.

---

## Client: cardsById (in-memory only)

```js
Map<id, { rank, suit } | null>
```

- `null` means "I know this card exists (some sprite for it is on screen) but I don't currently know its rank/suit — render it as a card-back".
- `undefined` (entry missing) means "I have never been authorised to see this card, or it has left my view; the sprite for it is either face-back or has been removed". Functionally identical to `null` for rendering; the distinction is documentary.

### Per-viewer visibility table

This is the canonical source-of-truth for what the server MAY send `{ rank, suit }` for to each viewer at each phase. FR-022 / FR-023 / FR-027 derive from this.

| Phase | Talon cards | Declarer's hand | Each opponent's hand | Exposed (selling) cards | Notes |
|---|---|---|---|---|---|
| `dealing` | visible to ALL | not yet defined | not yet defined | n/a | All clients receive talon identities during the deal. |
| `bidding` | visible to ALL | hand size unknown until declarer determined; talon still visible | own-hand-only to that viewer | n/a | |
| `post-bid-decision` (after absorption) | none (cards moved into declarer's hand) | identities visible ONLY to declarer; opponents see id-only face-backs | own-hand-only to that viewer | n/a | Identities of the 3 former-talon cards must be dropped client-side on opponents at the moment of the `talon_absorbed` message (FR-023). |
| `selling-selection` | none | identities visible ONLY to declarer | own-hand-only to that viewer | n/a (selection happens inside declarer's hand UI; no center exposure yet) | |
| `selling-bidding` | none | declarer holds 7 (identities visible ONLY to declarer); the 3 exposed cards live in `exposedSellCards` and identities are visible to ALL | own-hand-only to that viewer | identities visible to ALL | |
| `post-bid-decision` (after sell-bidding all-pass) | none | declarer holds 10 (identities visible ONLY to declarer) | own-hand-only | n/a | The 3 cards' identities must be dropped client-side on opponents at the moment of the `sell_resolved` message with `outcome: 'returned'` (FR-023). |
| `post-bid-decision` (after sell-bidding sale) | none | NEW declarer holds 10 (identities visible ONLY to new declarer); OLD declarer holds 7 (identities visible ONLY to old declarer) | own-hand-only | n/a | The 3 sold cards' identities must be dropped client-side on EVERYONE EXCEPT the new declarer at the moment of `sell_resolved` with `outcome: 'sold'` (FR-023). |
| `play-phase-ready` | none | unchanged | unchanged | n/a | Round is over; cleanup proceeds. |
| `aborted` | n/a | n/a | n/a | n/a | Client returns to lobby. |

### Reconnect snapshot (FR-027) — derived from the table above

The `round_state_snapshot` message contains, for the reconnecting viewer:
- The viewer's own hand identities.
- The talon identities if and only if `phase ∈ { dealing, bidding }` (talon hasn't been absorbed yet).
- The exposed-sell-cards identities if and only if `phase === 'selling-bidding'`.
- Opponent hand sizes only (no identities).
- The view-model.

No identities of cards that have left the viewer's visible scope are ever sent (FR-023 / FR-027).

---

## Client: GameStatus view-model (per recipient)

Computed by the server. One field (`viewerIsActive`) differs per recipient; everything else is shared across all 3.

```js
{
  phase: 'Dealing' | 'Bidding' | 'Declarer deciding' | 'Selling' | 'Round ready to play' | 'Round aborted',
  activePlayer: { nickname: string, seat: 0|1|2 } | null,
  viewerIsActive: boolean,
  currentHighBid: number,                  // opening minimum (100) before any accepted bid
  declarer: { nickname: string, seat: 0|1|2 } | null,
  passedPlayers: string[],                 // nicknames who have passed in the current bidding or current selling-bidding attempt
  sellAttempt: 1 | 2 | 3 | null,           // null in phases where it doesn't apply (Dealing, Bidding, Round ready, Round aborted)
  disconnectedPlayers: string[],           // nicknames currently within their grace period
}
```

### Validation rules

- `phase`: server-controlled enum; client treats unknown values as an error and disconnects.
- `activePlayer`: present iff `phase ∈ { Bidding, Declarer deciding, Selling }`.
- `viewerIsActive` and `activePlayer`: always coherent on a given recipient (`viewerIsActive === (activePlayer?.seat === thisRecipient.seat)`).
- `currentHighBid`: integer; multiple of 5; ≥ 100; ≤ 300.
- `sellAttempt`: integer in [1, 3] iff `phase === 'Selling'` or `phase === 'Declarer deciding'` after a failed selling attempt; else `null`.

---

## Access patterns

| Operation | How | Complexity |
|---|---|---|
| Look up round from a WS message | `game = store.games.get(player.gameId); round = game.round` | O(1) |
| Apply an action to a round | `round.submitBid(seat, amount)` (or equivalent) | O(1) state mutation + O(1) ordering check |
| Build per-viewer `round_started` payload | iterate the 24-step sequence once, filter identities by destination vs. viewer-seat | O(24) — trivial |
| Build a snapshot for reconnect | `round.getSnapshotFor(viewerSeat)` consults the visibility table | O(7) hand + O(3) talon-or-exposed + O(1) view-model |
| Build the view-model for a recipient | `round.getViewModelFor(viewerSeat)` | O(1) |
| Broadcast `phase_changed` after an action | `for (const pid of game.players) { sendToPlayer(pid, ...viewModel(pid)) }` | O(3) |
| Per-player rate limit | `rateLimiter.isAllowed(playerId)` | O(1) |
| Round cleanup on `play_phase_ready`/`round_aborted` | null out `player.gameId` for each, delete `games[gameId]`, broadcast lobby update | O(3) |
