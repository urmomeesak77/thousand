# Phase 1 Data Model: 4-Player Variant with Extended Deck

In-memory only (no persistence). Entities below are the existing ones with player-count generalizations; new/changed fields are marked **[NEW]** or **[CHANGED]**.

## playerCount (cross-cutting value)

- Integer, `3` or `4`. Source of truth: the game record's `requiredPlayers` (set at creation), copied to `Game.playerCount` and `Round.playerCount`.
- Drives: deck variant, talon size, sell-selection size, exchange-pass count, seat range, modulus for rotation, trick width, four-nines ack threshold, scoreboard/seat geometry.

Derived quantities (single source — Decision 5):

| Quantity | Formula |
|---|---|
| `seatRange` | `[0 … playerCount-1]` |
| deck size | `playerCount === 4 ? 32 : 24` |
| talon size | `playerCount` |
| `SELL_SELECTION_SIZE` | `playerCount` |
| dealt per player | `7` |
| exchange passes | `playerCount - 1` |
| trick width | `playerCount` |
| tricks per round | `8` |

## Card

- `{ id, rank, suit }`. **[CHANGED]** `rank` may now be `'7'` or `'8'` (4-player deck only).
- `CARD_POINT_VALUE`: **[CHANGED]** `{ A:11, '10':10, K:4, Q:3, J:2, '9':0, '8':0, '7':0 }`.
- `RANK_ORDER`: **[CHANGED]** `{ '7':0, '8':1, '9':2, J:3, Q:4, K:5, '10':6, A:7 }` (7 lowest → A highest; 9–A relative order preserved).
- Validation: a 24-card deck never contains 7/8 (3-player unaffected).

## Deck / Talon

- `makeDeck(playerCount)` → ordered list of `{rank, suit}`; 24 (ranks 9–A) or 32 (ranks 7–A).
- `buildDealDistribution(playerCount)` → `{ hands: { seat → [cardId] }, talon: [cardId] }`.
  - Invariant (3p): each seat 7 cards, talon 3, total 24 (unchanged).
  - Invariant (4p): each seat 7 cards, talon 4, total 32.
- 4-player deal cadence (deterministic; `stepDest(i, 4)`): deal one card per seat in clockwise order starting at seat 1, interleaving talon cards so that after 32 steps every seat holds 7 and the talon holds 4. The cadence value is implementation-internal; tests assert only the end-state counts and determinism.

## Game (persists across rounds)

- **[NEW]** `playerCount` (3|4).
- **[CHANGED]** `cumulativeScores`, `barrelState`, `consecutiveZeros`: initialized over `seatRange(playerCount)` (was `{0,1,2}`).
- **[CHANGED]** `startNextRound()`: `dealerSeat = (dealerSeat + 1) % playerCount`.
- `applyRoundEnd()`: already loops `for (seat in …)` over the score map keys → works for N seats once the maps are N-sized.
- `nicknames`, `history`, `continuePresses`: count-agnostic (keyed by seat / set of seats).

## Round (per-round state machine)

- **[NEW]** `playerCount` (from `game.playerCount`).
- **[CHANGED]** `hands`, `collectedTricks`, `collectedTrickCounts`: init over `seatRange`.
- **[CHANGED]** Bidding: first bidder `(dealerSeat+1) % playerCount`; forced-last-bidder when `passedBidders.size === playerCount-1`; `_nextActiveBidder` rotates `% playerCount`, loop bound `playerCount`.
- **[CHANGED]** Card exchange: `destSeat` range check over `seatRange`; transition to trick-play when `exchangePassesCommitted === playerCount-1`.
- **[CHANGED]** Selling: `SELL_SELECTION_SIZE = playerCount`; first sell bidder `(declarerSeat+1) % playerCount`.
- **[CHANGED]** Four-nines ack gate closes when `fourNinesAcks.size === playerCount`.
- **[CHANGED]** Deck seam (`_stackedDeckForTest` / `_stackRankOnSlots`): array sized to deck length; four-nines/no-ace slot indices recomputed from `stepDest(_, playerCount)`.
- State phases unchanged.

## TrickPlay (trick state machine)

- **[CHANGED]** constructor `(declarerSeat, deck, playerCount)`; `collectedTricks`/`collectedTrickCounts` init over `seatRange`.
- **[CHANGED]** turn advance `(seat+1) % playerCount`; trick resolves when `currentTrick.length === playerCount`; crawl resolves when `crawlCommits.length === playerCount`.
- `_determineWinner` / `_resolveTrick`: count-agnostic (operate on `currentTrick` contents) — no change beyond the completion threshold.
- Tricks-per-round `< 8` boundary unchanged.

## Scoring (pure functions)

- All `for (const seat of [0,1,2])` → `seatRange(playerCount)`; all `{0,1,2}` accumulators → `initSeatMap`.
- `findFourNinesSeat`: scans `seatRange` (four 9s still exist in both decks).
- `determineWinner`: max over `seatRange`; tiebreak declarer-first then `P1 … P(n-1) → Dealer` (Decision 8).
- `buildFinalResults`: `finalRanking` over `seatRange`.
- Invariant: 32-card-deck total trick points = 120 (7/8 contribute 0) — same as 24-card.

## RoundSnapshot (per-viewer view-model)

- **[CHANGED]** `buildSeatLayout(round, seat)`: returns `self`, the ordered opponent seats (`left`, plus `across` for 4p, `right`), `dealer`, and `players` (all seats).
- **[CHANGED]** `buildOpponentHandSizesFor`, `barrelMarkers`, `cumulativeScores` default, `compactScoreHistory`, round-stats maps: iterate `seatRange`.
- `currentTrick` / `legalCardIds` / crawl fields: count-agnostic; `currentTrick` simply reaches `playerCount` entries.

## Lobby / Game record (ThousandStore)

- Game record already carries `requiredPlayers` (3 or 4 after validator change).
- **[CHANGED]** `startRound`: pass `requiredPlayers` as `playerCount` into `Game`/`Round`. `seatOrder = [...game.players]` preserves join order for N seats (seat 0 = host/dealer).

## State transitions (unchanged shape)

`dealing → bidding → post-bid-decision → (selling-selection → selling-bidding)* → card-exchange → trick-play → round-summary` and the abort path. Player count changes only the *sizes* within each phase, not the transition graph.
