# Implementation Plan: 4-Player Variant with Extended Deck

**Branch**: `master` (no feature branch — kashka's standing no-new-branches rule; spec dir is `008-four-player-variant`) | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-four-player-variant/spec.md`

## Summary

Add a **4-player** game mode alongside the existing 3-player game, and extend the deck with **7s and 8s** (each 0 points, ranked below the 9) for the 4-player variant only. The codebase is currently hardcoded to exactly 3 seats — `% 3` rotation, `[0, 1, 2]` filters, `{ 0, 1, 2 }` seat containers, and literal `=== 2` / `=== 3` / `=== 8` / `=== 24` counts pervade `Round`, `TrickPlay`, `Scoring`, `Game`, `RoundSnapshot`, `RoundPhases`, and `DealSequencer`. The work is therefore a **generalization over player count**, not a second copy of the engine.

The technical spine is a single integer, **`playerCount` (3 or 4)**, chosen at game creation and threaded from `Game` → `Round` → `TrickPlay` / `Scoring` / `RoundSnapshot` / `DealSequencer`. Every hardcoded `3` that means "seat count" becomes `playerCount`; every `% 3` becomes `% playerCount`; every `{ 0, 1, 2 }` / `[0, 1, 2]` becomes a helper-built range `seatRange(playerCount)`. The card-count relationships fall out cleanly and stay parallel to today:

| | 3-player (today) | 4-player (new) |
|---|---|---|
| Deck | 24 (9–A) | 32 (7–A) |
| Talon | 3 | 4 |
| Dealt per player | 7 | 7 |
| Declarer after talon pickup | 10 | 11 |
| Exchange passes (1/opponent) | 2 | 3 |
| All hands at trick-play start | 8 | 8 |
| Tricks × cards | 8 × 3 = 24 | 8 × 4 = 32 |
| Total trick points | 120 | 120 (7/8 = 0) |

Because 7s and 8s are worth 0, **total trick points stay 120** in both decks, so `MIN_BID`/`MAX_BID`, the barrel range, and the 1000 victory threshold (`GameRules.js`) need **no change**. Talon size and sell-selection size both equal `playerCount`; exchange passes equal `playerCount - 1`.

Adding 7/8 to the shared rank tables (`Scoring.CARD_POINT_VALUE`, `RANK_ORDER`, and frontend `constants.js`) is **additive and safe for 3-player**: those cards never appear in a 24-card deck, so existing 3-player behavior is untouched (US2 regression guarantee).

Frontend gains a **player-count selector** in the new-game modal and generalizes the seating geometry from a fixed self/left/right trio to a seat-count-driven layout that adds a fourth "across/top" seat. `CardTable`, `GameScreen`, `TrickPlayView`, and `CardExchangeView` move from hardcoded `left`/`right` pairs to iterating the opponent seats from the `seats` view-model. All input/timing continues through Antlion per §XI.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS server) / Vanilla JS ES6+ ES modules (browser) — unchanged.
**Primary Dependencies**: `ws` ^8, Node.js built-in `crypto` — unchanged. No new dependencies.
**Storage**: In-memory only (`ThousandStore`, `Game`, `Round`). `playerCount` lives on the in-memory game record + `Game`; lost on restart, consistent with all prior features.
**Testing**: Node.js built-in `--test` runner (`*.test.js`); `jsdom` for frontend. Minimum 90% coverage. Live multi-browser e2e via the `thousand-live-e2e` skill, forced through the deck seam.
**Target Platform**: Node.js server + modern browser (ES6+) — unchanged.
**Project Type**: Web application (lobby + real-time game).
**Performance Goals**: No new perf targets; a 4-player round must deal, bid, and resolve tricks with no perceptible regression versus 3-player (same algorithms, one extra seat).
**Constraints**:
- §III Simplicity: generalize the **existing** state machine in place — do **not** fork a parallel 4-player engine. One `playerCount` parameter, helper-derived seat ranges, no per-count branching beyond deck/talon sizing.
- §IX Small units: `Round.js` (~620 lines) and `RoundSnapshot.js` (~330 lines) and `TrickPlayView.js` (~507 lines) are pre-existing size risks (R-301). Generalization should be net-neutral or shrinking (literals → shared helpers); resist adding branches. New seat-range/seat-geometry helpers live in small dedicated modules, not inline.
- §XI: all frontend timing/input through `Antlion`. The new seat geometry and player-count selector bind via `Antlion.bindInput`; no raw listeners/timers.
- **US2 regression (FR-006)**: 3-player must remain byte-for-byte behaviorally identical. The generalization must reduce to today's logic when `playerCount === 3`; the existing 3-player test suite passes unmodified.
- **Tiebreaker (FR-016, clarified)**: at simultaneous ≥1000, the most recent declarer wins if tied; otherwise clockwise from dealer P1 → P2 → P3 → Dealer.
**Scale/Scope**: Two supported player counts (3, 4). FR-001 .. FR-020. Touches the full vertical slice: deck/deal, round state machine, trick play, scoring, snapshot/view-model, REST create + validators, and the game-screen/lobby frontend. No new WS message *types* (envelopes unchanged; `seats`/`currentTrick`/score maps simply carry more entries).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| §    | Principle                | Status | Notes |
|------|--------------------------|--------|-------|
| §I   | Vanilla JS + Node.js     | ✓ PASS | No new dependencies. `playerCount` is a plain integer; seat ranges are arrays. |
| §II  | Single-file frontend     | ✓ PASS | At most one or two new small ES modules (seat-geometry helper); no bundlers/CDN/inline JS. |
| §III | Least code               | ✓ PASS | Generalize in place; literals → shared helpers. No parallel engine, no per-count duplication. |
| §IV  | Backend as thin server   | ✓ PASS | All changes extend existing services/controllers; no new architectural layer. |
| §V   | No build step            | ✓ PASS | Plain `.js`. |
| §VI  | Responsive design        | ⚠ RISK | The 4th seat changes table geometry. CSS grid must add a top/across slot and stay responsive (R-302). Reuse relative units; verify on mobile. |
| §VII | Classes over functions   | ✓ PASS | Seat-range/deck helpers are pure stateless utilities (the §VII carve-out, beside `findFourNinesSeat` in `Scoring.js` / in `DealSequencer.js`). |
| §VIII| One class per file       | ✓ PASS | No new classes that share a file. Any new frontend geometry helper is its own module. |
| §IX  | Small units              | ⚠ RISK | `Round.js` / `RoundSnapshot.js` / `TrickPlayView.js` are pre-existing size risks. Generalization is mostly substitution (no net growth); the deal-sequence change is isolated in `DealSequencer.js`. Tracked as R-301. |
| §X   | Logical cohesion         | ✓ PASS | Deck composition → `Deck.js`; deal split → `DealSequencer.js`; seat ranges → helper near the state machine; scoring/tiebreak → `Scoring.js`; geometry → `CardTable.js`/helper. |
| §XI  | Frontend through Antlion | ✓ PASS | Player-count selector and any new seat clicks bind via Antlion; deal/trick animations reuse existing Antlion-driven flights. |

No hard gate violations. Two ⚠ risks (responsive 4-seat layout R-302; pre-existing file sizes R-301) are tracked in Known Risks and re-checked post-design.

**Post-design re-check**: See research.md Decisions 1–9 and data-model.md. Threading one `playerCount` and deriving seat ranges from it keeps each file's change substitutional; the only genuinely new code is the 4-player deal sequence (isolated in `DealSequencer`) and the fourth seat's geometry/CSS. No new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/008-four-player-variant/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ws-messages.md   # Phase 1 output (REST create + generalized view-model fields)
├── checklists/
│   └── requirements.md  # /speckit-specify output
├── spec.md              # Feature specification
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code

```text
# New backend files
(none required — all server changes generalize existing files; a small seat-range
 helper may be added to DealSequencer.js or a new src/services/Seats.js if it keeps
 Round.js under the §IX guideline)

# Modified backend files
src/services/Deck.js                    # makeDeck(playerCount): 24-card (9–A) for 3p, 32-card (7–A) for 4p (FR-005, FR-006). RANKS_3P / RANKS_4P
src/services/DealSequencer.js           # buildDealDistribution(playerCount) + stepDest(i, playerCount): 4p = 7 cards each + 4-card talon over 32 steps; 3p path unchanged (FR-009)
src/services/Scoring.js                 # Add '7','8' to CARD_POINT_VALUE (0) and RANK_ORDER (below 9) (FR-007, FR-008). roundScores/roundDeltas/determineWinner/buildFinalResults/applyPenaltyAnnotations/findFourNinesSeat iterate seatRange(playerCount) not [0,1,2]. determineWinner tiebreak P1→…→P(n-1)→Dealer (FR-016)
src/services/Game.js                    # Accept/store playerCount; init cumulativeScores/barrelState/consecutiveZeros over seatRange (FR-015); dealerSeat rotation % playerCount (FR-012)
src/services/Round.js                   # this.playerCount = game.playerCount. All % 3 → % playerCount; hands/collectedTricks init over seatRange; bidding "passedBidders.size === 2" → "=== playerCount-1"; _nextActiveBidder bound; exchange transition "=== 2" → "=== playerCount-1"; destSeat range check generalized; SELL_SELECTION_SIZE → playerCount; four-nines ack gate "size === 3" → "=== playerCount"; deck seam arrays sized to deck length (FR-009..FR-017)
src/services/TrickPlay.js               # constructor takes playerCount; collectedTricks/counts init over seatRange; (seat+1) % 3 → % playerCount; trick-complete "length === 3" → "=== playerCount"; crawl "commits.length < 3" → "< playerCount" (FR-013, FR-017)
src/services/RoundPhases.js             # activeSellOpponents / nextSellOpponent over seatRange & % playerCount (FR-012)
src/services/RoundSnapshot.js           # buildSeatLayout: self + ordered opponent seats (left/right + across) over playerCount; buildOpponentHandSizesFor / barrelMarkers / compactScoreHistory / cumulativeScores defaults iterate seatRange; everything currently keyed [0,1,2] generalized (FR-018, FR-019)
src/controllers/validators.js           # validateRequiredPlayers: accept 3 OR 4 (FR-002); replace the "only 3 supported / hardcoded" comment (FR-004)
src/controllers/GameController.js       # _validateCreateGameBody default unchanged (3) but pass through 4; thread playerCount into the game record (FR-001)
src/services/ThousandStore.js           # startRound: pass game.requiredPlayers as playerCount into Game/Round (FR-001) — verify seat assignment uses join order for N players

# Modified frontend files
src/public/index.html                   # Subtitle + waiting hint text → player-count-aware; replace hidden player-count input with a 3/4 selector in the new-game modal (FR-020, FR-001)
src/public/js/overlays/NewGameModal.js  # Read selected player count (3|4) from the new selector instead of a fixed hidden input (FR-001)
src/public/js/screens/WaitingRoom.js    # Already shows server-provided requiredPlayers — verify "(N needed to start)" renders for 4 (FR-003)
src/public/js/thousand/CardTable.js     # slotsForSeat(viewerSeat, playerCount): self + clockwise opponents; add an 'across'/'top' slot for the 4th seat (FR-018)
src/public/js/thousand/GameScreen.js    # Replace fixed _leftOpponent/_rightOpponent with a seat→OpponentView map built from seats; generalize _opponentForSeat/_elForSeat/_applyOpponentHandSizes/_renderRoundStats/_setOpponentNicknames over all opponent seats (FR-018, FR-019)
src/public/js/thousand/TrickPlayView.js # Centre slots self/left/right → self + opponent seats (add 'across'); collected-count map over playerCount (FR-018)
src/public/js/thousand/CardExchangeView.js # Dest buttons over all opponent seats (not just [left,right]); direction label generalized (FR-011, FR-018)
src/public/js/thousand/OpponentView.js  # Verify it is position-agnostic (one instance per opponent seat); no structural change expected
src/public/js/thousand/StatusBar.js     # "/2 cards passed" → "/(playerCount-1) cards passed" (FR-011, FR-020)
src/public/js/thousand/ScoreboardPanel.js # Already iterates players dynamically — verify default cumulativeScores fallback no longer assumes 3 (FR-019)
src/public/js/thousand/FinalResultsScreen.js # Table colSpan derived from player count, not literal 9 (FR-019)
src/public/css/game.css                 # Table grid + trick-centre: add 4th (top/across) seat slot; keep responsive (FR-018, §VI)

# New test files (backend)
tests/Deck.fourplayer.test.js           # makeDeck(4) = 32 cards incl. 7/8 all suits; makeDeck(3) = 24 unchanged (FR-005, FR-006)
tests/DealSequencer.fourplayer.test.js  # buildDealDistribution(4) = 7 per seat + 4 talon = 32; 3p path unchanged (FR-009)
tests/Scoring.fourplayer.test.js        # 7/8 = 0 points & never win a trick over 9+ (FR-007, FR-008); roundScores/deltas over 4 seats; 4-player tiebreak order (FR-016)
tests/Round.fourplayer.test.js          # 4-player deal/bid/forced-declarer/talon-pickup/exchange(3 passes→8 each)/8 tricks of 4; sell with 3 opponents; four-nines ack needs all 4 (FR-009..FR-017)
tests/Game.fourplayer.test.js           # cumulative/barrel/zero over 4 seats; dealer rotation % 4 (FR-012, FR-015)
tests/round-messages.fourplayer.test.js # End-to-end via ConnectionManager: create 4-player game, four joiners, full round; seats layout has 4 entries; currentTrick reaches length 4
tests/validators.test.js (extend)       # requiredPlayers accepts 3 and 4, rejects 2/5 (FR-002)

# New test files (frontend)
tests/CardTable.fourplayer.test.js      # slotsForSeat returns 4 distinct slots for playerCount 4; 3 for 3 (FR-018)
tests/GameScreen.fourplayer.test.js     # three opponent views rendered for 4-player seats; hand sizes/nicknames/round-stats map correctly (FR-018, FR-019)
```

**Structure Decision**: Single project (unchanged from 004–007). No new top-level directories. Effectively all changes generalize existing files around one `playerCount` parameter; the only candidate new file is a tiny `seatRange`/seat-geometry helper if inlining would push `Round.js` past the §IX guideline.

## Implementation Phases (delivery order)

Maps to the spec's user-story priorities; lands as one PR.

1. **P2 first — seat-count generalization with `playerCount === 3` (US2 regression spine).** Thread `playerCount` through `Game`/`Round`/`TrickPlay`/`Scoring`/`RoundSnapshot`/`RoundPhases`, replacing every `% 3` / `[0,1,2]` / `{0,1,2}` / `=== 2|3` with `playerCount`-derived equivalents — **while the only live value is still 3**. Add 7/8 to the rank tables (inert for 24-card decks). Gate: the entire existing 3-player suite passes unmodified. This is the safest possible base: it proves the generalization reduces exactly to today before any 4-player path goes live.
2. **P1 — enable 4-player end-to-end (US1).** `makeDeck(4)`/`buildDealDistribution(4)`; `validators` accept 4; `GameController`/`ThousandStore` thread `playerCount = requiredPlayers`; verify the full round loop (deal 7+4 talon → bid/forced-declarer → talon pickup 11 → exchange 3 passes → 8 cards each → 8 tricks of 4 → scoring → victory). Server-side 4-player is fully playable headless after this phase.
3. **P3 + frontend — player-count selection and 4-seat presentation (US3, US1 UI).** New-game-modal 3/4 selector; `index.html` text; `CardTable`/`GameScreen`/`TrickPlayView`/`CardExchangeView` seat geometry for the 4th seat; `StatusBar`/`FinalResultsScreen` count-derived text; `game.css` grid. Delivers the visible 4-player table and the creation flow.
4. **Cleanup (FR-004).** Remove/replace outdated "3-player only / 4-player is a future feature" comments in `validators.js` and the historical notes in `specs/004`/`specs/005`. (Do not rewrite shipped spec history beyond the misleading restriction lines.)

## Complexity Tracking

*(No new constitution violations. Pre-existing §IX size signals on `Round.js`/`RoundSnapshot.js`/`TrickPlayView.js` carried from 004–007; generalization is substitutional and should not worsen them. Section not required.)*

## Known Risks

| ID    | Risk | Detail | Mitigation |
|-------|------|--------|------------|
| R-301 | File-size creep | `Round.js`, `RoundSnapshot.js`, `TrickPlayView.js` are already near/over the §IX guideline; generalization could add branches. | Substitute literals with shared helpers (`seatRange`, geometry) rather than inline branching. Keep deck/deal logic in `Deck.js`/`DealSequencer.js`. If `Round.js` grows, extract `seatRange`/seat helpers to `src/services/Seats.js`. |
| R-302 | Responsive 4-seat layout | A 4th seat changes the table grid; mobile must stay usable (§VI). | Drive seat slots from a geometry helper keyed on `playerCount`; CSS uses relative units + media queries; verify the across/top seat on a narrow viewport in `quickstart.md`. |
| R-303 | US2 regression | Threading `playerCount` everywhere risks subtly changing 3-player behavior. | Phase 1 lands generalization with value fixed at 3 and the existing suite must pass **unmodified** before any 4-player path is enabled. The generalized formulas all reduce to today's at `playerCount === 3` (talon=3, passes=2, tricks×3, mod-3). |
| R-304 | Deck seam for 4-player e2e | `Round._stackedDeckForTest` hardcodes 24-slot arrays / `new Array(24)` for the four-nines & no-ace seams. | Generalize the seam to the active deck length (24 or 32) and recompute four-nines/no-ace slot indices from the 4-player `stepDest`. Add a 4-player variant to the live e2e deck forcing. |
| R-305 | Total points / bid range assumptions | A larger deck could imply different bid ceilings. | 7/8 are 0 points, so total trick points stay 120 → `GameRules` thresholds unchanged. A `Scoring.fourplayer` test asserts the 32-card deck's total trick points equal 120. |
| R-306 | Seat assignment for the 4th joiner | `ThousandStore.startRound` must seat 4 joiners in join order (seat 0 = host/dealer … seat 3). | Verify `seatOrder = [...game.players]` already preserves insertion order for 4; covered by `round-messages.fourplayer.test.js`. |

## Verification

Run `npm test && npm run lint`. Coverage stays ≥ 90%.

Manual end-to-end follows `quickstart.md`:
- **3-player regression**: create a 3-player game, play a round; confirm 24-card deck, 3-card talon, 2 exchange passes, 3-card tricks — identical to today.
- **4-player happy path**: create a 4-player game in the modal, join with four tabs; confirm the deal gives 7 + 4 talon, the declarer reaches 11 then 8 after 3 exchange passes, every player holds 8, tricks contain 4 cards, 7/8 score 0 and lose to 9+, and the game ends at ≥1000 with all four ranked.
- Force a four-nines / no-ace deal via the generalized deck seam (`THOUSAND_STACK_DECK`) to exercise the bonus and crawl in 4-player.
