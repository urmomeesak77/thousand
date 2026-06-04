# Phase 0 Research: AI Opponents (Bots)

All "unknowns" here were resolved by reading the existing engine rather than by external
research — the feature is almost entirely an *integration* against current architecture.

## Decision 1 — A bot is a socketless `Player`

**Decision**: Represent a bot as a normal `PlayerRegistry` player record with a generated
`id`, a themed `nickname`, `isBot: true`, and `sockets: new Set()` (empty). It is added to
`game.players` and gets a seat in `seatOrder` exactly like a human.

**Rationale**: `PlayerRegistry.sendToPlayer` and `ThousandStore.broadcastLobbyUpdate` both
iterate `player.sockets` and skip non-open sockets — an empty set means every broadcast to a
bot is a silent no-op, so **no engine code needs a "skip bots" branch**. `ConnectionLifecycle`
(disconnect/grace/purge) is only ever entered from a WebSocket `close` event; a bot has no
socket and never connects, so it is never subject to grace timers. `RoundSnapshot.seatInfo`
and `Game.nicknames` read `player.nickname`, which bots have. This is the smallest possible
surface change.

**Alternatives considered**:
- *Parallel `bots` collection separate from players* — rejected: would force every
  seat/turn/snapshot/scoring path to union two collections (large, error-prone change),
  violating Simplicity First.
- *A fake in-process WebSocket object per bot* — rejected: adds a moving part (a stub socket
  implementing `send`/`readyState`) for zero benefit, since sends should be no-ops anyway.

## Decision 2 — Reuse the existing auto-start-when-full path

**Decision**: Do not add a separate "host start" trigger. Adding the bot that makes
`game.players.size === game.requiredPlayers` calls `store.startRound(gameId)`, the exact path
already used when the last human joins (`GameController._admitPlayerToGame`).

**Rationale**: The codebase has no explicit start button — a table auto-starts on fill. The
spec's "add bots, then start" is satisfied by "add bots until the table is full." Reusing the
path guarantees bots and humans start games identically (FR-004).

**Implication**: The host adds/removes bots freely while the table is not yet full; the add
that completes the table starts the game. Removing a bot to free a seat for a late human is
only meaningful before that fill (consistent with waiting-room-only scope).

## Decision 3 — Bots act through the existing `RoundActionHandler`, not a new code path

**Decision**: A bot turn results in a call to the **same** handler method a human's WS
message dispatches to (`handleBid`, `handlePass`, `handleSellStart/Select/Bid/Pass`,
`handleStartGame`, `handleExchangePass`, `handlePlayCard`, `handleAcknowledgeFourNines`,
`handleCrawlCommit`, `handleContinueToNextRound`) — keyed on the bot's `playerId`.

**Rationale**: These methods already enforce turn/phase/legality and perform per-recipient
broadcasts (`_runRoundAction`). Routing bot actions through them means bot moves are validated
and broadcast identically to human moves — satisfying FR-007 (always legal) and FR-010
(scored identically) for free. The per-player rate limiter (250 ms) is comfortably under the
1–3 s bot delay, so no limiter changes are needed.

**Alternatives considered**: Calling `Round`/`TrickPlay` mutators directly — rejected: would
duplicate the handler's validation + broadcast plumbing and risk divergence.

## Decision 4 — Turn detection via a post-action hook + fresh re-read

**Decision**: Add a single chokepoint `store` method (e.g. `notifyTurnAdvanced(game)`)
invoked at the tail of each turn-changing broadcast (`startRound`, `RoundActionHandler._runRoundAction`,
the trick-play action tails, `RoundActionBroadcaster.startAndBroadcastNextRound`). It calls
`BotTurnDriver.onStateChanged(game)`, which inspects current round state, finds bot seats with
a pending obligation, and schedules each via `setTimeout` (randomized 1–3 s). When a timer
fires, the driver **re-reads authoritative state**, asks `BotStrategy` for one action, executes
it, and lets the resulting broadcast re-enter the hook for the next step.

**Rationale**: Mirrors how a human client reacts to `phase_changed`. Re-reading on fire (not
trusting the state captured at schedule time) makes the driver robust to interleaving human
actions. One action per fire keeps the loop observable and prevents reentrancy.

**Debounce**: Track at most one pending timer per `(gameId, botPlayerId)`; ignore re-schedule
requests while a bot already has a pending timer. Clear timers when the game/round is torn
down (alongside `waitingRoomTimer`). Use `.unref()` like every other timer in the codebase so
a pending bot turn never keeps the event loop alive at shutdown.

**Pending-obligation set** (what makes a bot "need to act now"):
| Phase / gate | Obligation |
|--------------|-----------|
| `bidding` (it's the bot's turn) | bid or pass |
| `post-bid-decision` (bot is declarer) | start game (v1 declarer never sells) |
| `selling-bidding` (bot is an opponent, a human sold) | pass |
| `card-exchange` (bot is declarer) | pass each required card |
| `trick-play` (it's the bot's turn) | play a legal card (declare marriage / decline crawl as applicable) |
| four-nines ack pending (bot hasn't acked) | acknowledge |
| `round-summary` (bot hasn't pressed continue) | continue to next round |

## Decision 5 — Port `e2e-live-smart.js` strategy from DOM to round state

**Decision**: The strategy's helpers are essentially pure functions of `(hand, center, trump,
trickNumber, legalCardIds)`. Port them into `botStrategyHelpers.js` (pure) and `BotStrategy.js`
(per-phase deciders). Replace DOM reads (`readHand`, `readCenter`, `readTrump`, `isMyTurn`)
with reads of authoritative round state; the round already computes `legalCardIds`,
`currentTrick`, `currentTrumpSuit`, and `trickNumber` (see `RoundSnapshot._computeLegalCardIds`
and `buildViewModel`). Replace button clicks with the action objects from Decision 3.

**Role model**: As in `takeAction`, a bot keys its trick-play behaviour off whether it *is*
the current declarer: declarer → smart lead/follow (`declarerLead`/`declarerFollow`,
marriage-aware, trump-draw, win-cheaply/protect-marriage); non-declarer → dump lowest legal
card. Bidding uses `estimateMakeable` on its own hand as a *safe floor*, then adds an
aggressiveness-scaled talon gamble (see Decision 6). This generalizes the single-aggressor
e2e setup to "every bot plays sensibly for itself, with its own appetite for risk."

**v1 simplifications (legal + competent, recorded as scope)**:
- Bot **declarer never sells** — it starts and plays the hand out (matches `e2e-live-smart`'s
  default `SELL_ENABLED=false`). As a sell *auction* participant (only if a human declarer
  sells) the bot passes. Both are legal, completing the selling-phase obligation.
- Bot **declines crawl** (feature 007) and leads normally.
- Bot **declares a marriage whenever offered** (banks the bonus).

**Alternatives considered**: Selectable difficulty / full sell strategy — explicitly deferred
(spec Clarifications: single skill level; sell decline is sufficient for v1).

## Decision 6 — Per-bot aggressiveness trait drives a bounded talon gamble (FR-016/FR-017)

**Decision**: Each bot is assigned `aggressiveness ∈ [0, 1]`, drawn uniformly at random in
`PlayerRegistry.createBot` and stored on the bot's player record; it persists for the whole
game (a stable personality). During the auction, `BotStrategy` computes its bid as:

```
safe       = estimateMakeable(hand).value          // existing pure helper — the makeable floor
gamble     = round(aggressiveness * MAX_TALON_GAMBLE)   // MAX_TALON_GAMBLE ≈ 30
target     = roundDownToStep(safe + gamble, BID_STEP)
bid        = clamp(target, currentFloor, MAX_BID)  // MIN_BID/MAX_BID/BID_STEP from thousand/constants
```

The bot bids when `target ≥ currentFloor`, otherwise passes (a cautious bot with a weak hand
passes; a bold bot reaches for a contract it may miss). The forced-last-bidder case (Pass
unavailable) still takes the floor contract, unchanged.

**Rationale**: This is the smallest change that produces the requested behaviour — a single
additive term on top of the existing `estimateMakeable` floor. Capping the gamble at
`MAX_TALON_GAMBLE` (≈30, the rough upside a 2–4 card talon can add: a completed marriage or a
couple of aces) satisfies FR-017's "never runaway-overbid" bound while still letting an
aggressive bot miss a gambled contract — which is the whole point. Because the floor keeps the
bid near the sweepable ceiling, FR-008 (games complete) holds: missed gambles cost points but
never stall play.

**Why per-bot persistent** (spec Clarifications): a fixed trait makes a bot recognizably
cautious or bold across rounds, is trivially testable (inject a fixed `aggressiveness`), and
needs no per-round re-roll bookkeeping.

**Testability (SC-007)**: `BotStrategy.decideBid` is pure given `(hand, aggressiveness, floor)`.
Unit tests inject fixed traits and assert monotonicity (higher trait ⇒ ≥ bid) and the upper
bound (`bid ≤ roundDownToStep(safe + MAX_TALON_GAMBLE, step)`), with no randomness in the
assertion path. Only the *trait draw* uses randomness, isolated in `createBot`.

**Scope**: the trait affects **bidding only** in v1; trick-play / exchange / marriage decisions
remain the shared deterministic strategy (spec Assumptions).

## Decision 7 — "No human remaining" cleanup (FR-014)

**Decision**: `leaveGame` / `_resolveGameAfterExit` must count **humans**, not total players.
When a human leaves and only bots remain, treat it like an empty table: abort any in-progress
round and delete the game, **purging the bot players from the registry** (`PlayerRegistry.remove`).
Bot purge also runs in `_deleteGame`, `_disbandGame`, and `_cleanupRound`.

**Rationale**: Today `_resolveGameAfterExit` deletes only when `game.players.size === 0`; with
bots that never reaches 0. Without a human-count check, an abandoned table of bots would linger
and leak registry entries. Bots have no session token to expire, so explicit purge is required.

## Open questions

None. All clarifications from the spec's Clarifications section are reflected above; the
remaining behaviour is fully determined by the existing engine.
