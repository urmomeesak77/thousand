# Phase 0 Research: 4-Player Variant with Extended Deck

All unknowns resolved; no remaining NEEDS CLARIFICATION. Decisions below drive the data model and contracts.

## Decision 1 — One `playerCount` parameter, not a parallel engine

**Decision**: Introduce a single integer `playerCount ∈ {3, 4}` set at game creation, threaded `Game → Round → TrickPlay / Scoring / RoundSnapshot / RoundPhases / DealSequencer`. Replace every seat-count literal with a value derived from it.

**Rationale**: §III (least code). The 3-player logic is correct; the only differences are sizes (deck, talon, passes, seats, trick width) and modulus. A parameter + helper makes 4-player fall out without duplicating the state machine, and lets 3-player remain the same code path (US2).

**Alternatives considered**:
- *Fork a `FourPlayerRound`*: massive duplication, two state machines to keep in sync — rejected.
- *Dealer-sits-out classic 4-hand variant*: rejected by the user during `/speckit-specify` (all four play).

## Decision 2 — Seat ranges via a shared helper

**Decision**: Replace `[0, 1, 2]` / `{ 0, 1, 2 }` with `seatRange(playerCount)` → `[0, 1, …, n-1]` and helpers `initSeatMap(playerCount, fill)` → `{ 0: …, n-1: … }`. Place them where they keep `Round.js` under the §IX guideline — first choice `DealSequencer.js` (already deal/seat-oriented) or a new tiny `src/services/Seats.js` if needed.

**Rationale**: Centralizes the substitution, avoids scattering `Array.from` everywhere, and is a pure stateless utility (§VII carve-out).

**Alternatives considered**: inline `Array.from({length: n})` at each site — noisier, error-prone, worsens §IX.

## Decision 3 — Deck composition keyed on player count

**Decision**: `makeDeck(playerCount)` selects ranks: 3-player `['9','10','J','Q','K','A']` (24 cards), 4-player `['7','8','9','10','J','Q','K','A']` (32 cards). Suits unchanged.

**Rationale**: FR-005/FR-006. 32 = 8 ranks × 4 suits divides evenly among 4 players (8 each); 24 stays for 3. Keeping the rank list in `Deck.js` is the cohesive home (§X).

**Alternatives considered**: always-32 deck with a 3-player redeal — breaks the even 24-card 3-player deal and would change shipped behavior; rejected.

## Decision 4 — 7 and 8: points and rank order (additive, 3-player-safe)

**Decision**: Extend the shared tables in `Scoring.js` (mirrored in frontend `constants.js`):
- `CARD_POINT_VALUE`: add `'7': 0, '8': 0` (9 is already 0).
- `RANK_ORDER`: shift to `{ '7': 0, '8': 1, '9': 2, 'J': 3, 'Q': 4, 'K': 5, '10': 6, 'A': 7 }` — 7 lowest, 8 next, then the existing order (10 still outranks K/Q; A highest).

**Rationale**: FR-007/FR-008. Because a 24-card deck never contains 7/8, adding these keys is inert for 3-player (US2). Trick resolution already reads `RANK_ORDER` by rank string, so renumbering is safe as long as relative order of 9..A is preserved — it is.

**Alternatives considered**: a separate 4-player rank table — needless divergence; rejected. (Verified: relative order of 9, J, Q, K, 10, A is unchanged, so all existing 3-player trick-winner tests still hold.)

## Decision 5 — Card-count formulas (talon, passes, tricks)

**Decision**:
- Talon size = `playerCount` (3 or 4).
- `SELL_SELECTION_SIZE` = `playerCount` (declarer re-exposes the talon-sized set when selling).
- Dealt per player = 7 (both).
- Exchange passes (transition trigger) = `playerCount - 1` (2 or 3).
- Trick width (`currentTrick` complete) = `playerCount`; crawl resolves at `playerCount` commits.
- Tricks per round = 8 (unchanged). 8 × `playerCount` = deck size.

**Rationale**: Derives directly from "7 each + N talon, declarer picks up talon then passes 1 to each opponent → 8 each, 8 tricks". All reduce to today's values at `playerCount === 3`.

**Alternatives considered**: declarer passes a fixed 2 in 4-player (would leave declarer at 9 cards / opponents at 8/8/7) — breaks the even 8-card invariant; rejected.

## Decision 6 — 4-player deal sequence

**Decision**: Generalize `stepDest(i, playerCount)` and `buildDealDistribution(playerCount)`. 3-player keeps its canonical 24-step sequence exactly. 4-player deals 32 cards as: an initial talon-bearing phase plus per-seat rounds totaling 7 cards/seat and 4 talon. Concrete 4-player pattern (mirrors the 3-player "3 cards each + talon, then 4 each" shape): rounds dealing one card to each of seats 1,2,3,0 with the talon receiving a card on a fixed cadence until talon=4 and each seat=7. Exact cadence is finalized in data-model.md; the invariant the tests assert is **7 per seat, 4 in talon, 32 total, deterministic**.

**Rationale**: `stepDest` also feeds the deal *animation* (`buildDealSequenceFor`) and the test deck seam, so a single generalized mapping keeps animation, dealing, and seam consistent (§X). The dealing order only affects the visual deal, not fairness (deck is pre-shuffled).

**Alternatives considered**: deal all 7 to a seat at once — diverges from the existing interleaved animation feel; rejected.

## Decision 7 — Bidding, selling, and forced-declarer generalization

**Decision**:
- Forced-last-bidder fires when `passedBidders.size === playerCount - 1`.
- `_nextActiveBidder` loop bounds to `playerCount`; rotation `% playerCount`.
- Sell: `activeSellOpponents` / `nextSellOpponent` iterate `seatRange` excluding declarer, `% playerCount`; "one passed and another has bid" resolution logic is unchanged (works for any opponent count).
- First bidder = `(dealerSeat + 1) % playerCount`; sell first bidder = `(declarerSeat + 1) % playerCount`.

**Rationale**: FR-012. These are direct modulus/threshold generalizations; the auction-resolution branches already operate on `remaining.length`, which is count-agnostic.

**Alternatives considered**: none — mechanical.

## Decision 8 — Winner & tiebreak over N seats (clarified)

**Decision**: `determineWinner` finds the max cumulative over `seatRange`; if a single seat, it wins. On a tie at the max: the most recent round's declarer wins if among the tied set; else pick the highest-priority tied seat in clockwise order from the dealer: `P1 = (dealer+1) % n, P2 = (dealer+2) % n, …, P(n-1), Dealer` (dealer lowest). For `n = 3` this is exactly today's `P1 → P2 → Dealer`.

**Rationale**: FR-016 + the `/speckit-clarify` answer (Session 2026-06-01). Generalizes the existing rule with no special-casing.

**Alternatives considered**: dealer-highest order / continue-another-round — rejected during clarify (Option A chosen).

## Decision 9 — Frontend seat geometry over N seats

**Decision**: Derive opponent positions from the `seats` view-model rather than fixed `left`/`right`. `buildSeatLayout` returns `self` plus an ordered opponent list (clockwise from self): for 3 players `left, right`; for 4 players `left, across, right`. `CardTable.slotsForSeat(viewerSeat, playerCount)` returns a slot per opponent (adds a top/across slot). `GameScreen` holds a `seat → OpponentView` map built on `init`/`initFromSnapshot`. `TrickPlayView` centre slots and `CardExchangeView` dest buttons iterate the opponent seats.

**Rationale**: FR-018/FR-019. Removes the hardcoded two-opponent assumption; the same code renders 2 or 3 opponents. Keeps §XI (Antlion) and §VI (responsive) by reusing existing slot/animation machinery with one extra slot.

**Alternatives considered**: keep `left`/`right` and bolt on a special-cased `across` — brittle; rejected in favor of seat-list iteration.

## Cross-cutting: regression strategy

Land the full generalization with `playerCount` fixed at 3 first; the existing suite must pass **unmodified** (R-303). Only then enable `makeDeck(4)` / `validators` accept 4. This guarantees US2 (FR-006) before US1 goes live.
