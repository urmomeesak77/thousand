# Phase 1 Data Model: AI Opponents (Bots)

In-memory only (constitution §I). All changes are additive to existing structures.

## Entity: Player (EXTENDED)

Existing record (`PlayerRegistry.create`) gains one field.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (UUID) | unchanged |
| `nickname` | string | bot: a themed name from `botNames.js` (e.g. `"Robo-Ada"`) |
| `gameId` | string \| null | set to the table when added |
| `sockets` | Set | **bot: always empty** — drives no-op broadcasts |
| `sessionToken` | string \| null | **bot: null** (never restored/reconnected) |
| `disconnectedAt` / `graceTimer` | — | bot: unused (never disconnects) |
| **`isBot`** | boolean | **NEW** — `true` for bots, absent/false for humans |
| **`aggressiveness`** | number | **NEW (bot only)** — `∈ [0,1]`, drawn uniformly at random at creation; persists for the game. Drives the bidding gamble (FR-016/FR-017). Absent for humans. |

**Creation**: `PlayerRegistry.createBot(nickname)` → record with `isBot:true`,
`sockets:new Set()`, `sessionToken:null`, `aggressiveness:Math.random()`; **not** added to the
`_tokenIndex`. (Tests may inject a fixed `aggressiveness` for determinism.)
**Removal**: `PlayerRegistry.remove(playerId)` already exists; used to purge bots.

**Validation / invariants**:
- A bot is only ever created by the host's add-bot action (server-generated id; no client input trusted).
- Bot nickname is unique among that table's seated players (picker retries the themed pool).
- Bots never appear in the lobby player list of *other* games (they always have a `gameId`).

## Entity: Game record (UNCHANGED shape)

`game.players` (Set of playerIds) now may contain bot ids. No new field required.
Derived helpers needed:
- `humanCount(game)` = count of `game.players` whose record has `!isBot`.
- `botIds(game)` = `game.players` filtered to `isBot`.

**State transitions (additions):**

```
waiting --addBot (size<required)--> waiting           (player_joined broadcast w/ isBot)
waiting --addBot (size==required)--> in-progress       (startRound: identical to last human joining)
waiting --removeBot--> waiting                          (player_left broadcast; seat freed)
any --last HUMAN leaves, bots remain--> DELETED         (abort round if any; purge bot records)  [FR-014]
waiting --host leaves--> DISBANDED                      (existing; additionally purge bot records)
```

## Entity: Bot Decision (transient, not stored)

Output of `BotStrategy.decide(round, seat)` — a plain action descriptor consumed immediately
by `BotTurnDriver`; never persisted.

| Field | Type | Values |
|-------|------|--------|
| `kind` | string | `bid` \| `pass` \| `startGame` \| `sellPass` \| `exchangePass` \| `playCard` \| `acknowledgeFourNines` \| `continueToNextRound` \| `null` (nothing to do) |
| `amount` | number? | for `bid` |
| `cardId` | number? | for `exchangePass`, `playCard` |
| `toSeat` | number? | for `exchangePass` |
| `declareMarriage` | boolean? | for `playCard` |

## Entity: Bot turn timer (transient)

Owned by `BotTurnDriver`; keyed `${gameId}:${botPlayerId}` → `setTimeout` handle (`.unref()`).
At most one pending per bot. Cleared on action fire and on game/round teardown.

## Card-state shape consumed by the strategy

`BotStrategy` reads authoritative round state and builds the same shape the e2e helpers used:
- `hand`: `[{ cardId, rank, suit }]` from `round.hands[seat]` mapped through `round.deck`.
- `legalCardIds`: from `RoundSnapshot._computeLegalCardIds(round, seat)` (follow-suit/trump enforced).
- `center`: `[{ rank, suit }]` from `round.currentTrick` mapped through `round.deck`.
- `trump`: `round.currentTrumpSuit` (suit letter or null).
- `trickNumber`: `round.trickNumber`.
- `isDeclarer`: `seat === round.declarerSeat`.
- `aggressiveness`: the bot's persistent trait from its player record (bidding only).

## Bidding computation (FR-016/FR-017)

`BotStrategy.decideBid(hand, aggressiveness, currentFloor)` is pure:

```
safe   = estimateMakeable(hand).value
gamble = round(aggressiveness * MAX_TALON_GAMBLE)   // MAX_TALON_GAMBLE ≈ 30
target = roundDownToStep(safe + gamble, BID_STEP)
→ bid clamp(target, currentFloor, MAX_BID) when target ≥ currentFloor, else pass
```

Constants `MIN_BID` / `MAX_BID` / `BID_STEP` are reused from
`src/public/js/thousand/constants.js` (or a shared server constant if not already importable).
`MAX_TALON_GAMBLE` is a new bot constant. Invariant tested: `bid ≤ roundDownToStep(safe + MAX_TALON_GAMBLE, BID_STEP)`.
