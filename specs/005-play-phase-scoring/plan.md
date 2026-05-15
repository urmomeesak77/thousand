# Implementation Plan: Play Phase, Scoring, Multi-Round & Victory

**Branch**: `005-play-phase-scoring` | **Date**: 2026-05-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-play-phase-scoring/spec.md`

## Summary

Feature 004 finished at the "Round ready to play — next phase coming soon" handoff. This feature replaces that handoff with the actual gameplay loop: card exchange (declarer passes 1 card to each opponent) → 8-trick play with follow-suit / trump / marriage declarations → round summary with made/missed scoring → multi-round flow with dealer rotation and cumulative carry-over → victory at 1000+ with a per-round-history final-results screen. The special-scoring rules (barrel [880, 1000) with a 120-bid floor and 3-round counter; three-consecutive-zero −120 penalty) round out the rulebook.

Architecturally this introduces a new server entity — `Game` — that persists across rounds (cumulative scores, dealer seat, barrel/zero state, round-history log, Continue-press tracking). The existing `Round` instance is replaced each round; the lobby-side `game` record now carries both `game.round` (per-round) and `game.session` (per-game). Round.js gains the card-exchange + trick-play action surface; trick-play state is extracted to `TrickPlay.js` and scoring to a pure-function `Scoring.js` to keep §IX file sizes in check. The game-record cleanup rule from feature 004 (FR-032) is superseded — the record persists across rounds and is purged only at game-end (`final_results`), mid-round abort (`round_aborted`), or between-rounds abort (`game_aborted`).

Frontend gains four new phase screens — `CardExchangeView`, `TrickPlayView`, `RoundSummaryScreen`, `FinalResultsScreen` — plus a `MarriageDeclarationPrompt` modal and per-seat `CollectedTricksStack` widgets. `StatusBar` is extended with trick number, trump suit, cumulative scores (visible at all times), barrel markers, and round number. All animation continues to flow through `Antlion.onTick` / `Antlion.schedule` per §XI.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS server) / Vanilla JS ES6+ ES modules (browser) — unchanged.
**Primary Dependencies**: `ws` ^8, Node.js built-in `crypto` — unchanged. Reuses existing `Antlion`, `Toast`, `RateLimiter`, `IdentityStore`, `ReconnectOverlay`, and every feature-004 service (`Round`, `Deck`, `DealSequencer`, `RoundSnapshot`, `RoundPhases`, `RoundActionHandler`, `ConnectionManager`, `PlayerRegistry`, `ThousandStore`).
**Storage**: In-memory only. Server restart aborts in-flight games (consistent with features 003 and 004). The new round-history log lives on the in-memory `Game` instance; lost on restart.
**Testing**: Node.js built-in `--test` runner (`*.test.js`); `jsdom` for frontend tests. Minimum 90% coverage per Tech Stack §.
**Target Platform**: Node.js server + modern browser (ES6+) — unchanged.
**Project Type**: Web application (lobby + real-time game).
**Performance Goals**:
- Phase transitions (round-start → card-exchange, trick resolve → next trick, last-trick → round-summary, summary → next-round, last-round → final-results) reflected on all 3 clients within 1 s (SC-001, SC-006, SC-010).
- Trick-resolve animation: 350 ms pause + 250 ms collect-flight (Decision 10).
- Card-exchange pass animation: 250 ms hand → recipient.
- Status bar updates within 1 s of any server state change (FR-018, SC-010).
**Constraints**:
- §XI: all frontend timing/input through `Antlion` — no raw `setTimeout` / `setInterval` / `addEventListener` / `requestAnimationFrame` in feature modules.
- §II: ES modules under `src/public/js/`, no bundlers / transpilers / CDN deps.
- FR-019: clients receive a card's `{ rank, suit }` only while currently visible to them; identities of cards that have left view MUST be dropped client-side and never re-sent. Trick-play extends this to centre cards (face-up while in centre, dropped on collect-animation land) and round-summary collected cards (sent only for the viewer's own won tricks).
- FR-027: per-player 250 ms throttle on every new state-changing message (`exchange_pass`, `play_card`, `continue_to_next_round`).
- FR-029: game record persists across rounds; purged only at game-end / abort. Supersedes feature 004's FR-032 for any game with multi-round play (which is now every game).
**Scale/Scope**: 3-player rooms only (consistent with feature 004). FR-001 .. FR-030. Multi-round, scoring, barrel rule, 1000-point victory. Same small-context (<100 concurrent players) target.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| §    | Principle                | Status | Notes |
|------|--------------------------|--------|-------|
| §I   | Vanilla JS + Node.js     | ✓ PASS | No new dependencies. All scoring is plain integers; no big-number, no decimal library needed. |
| §II  | Single-file frontend     | ✓ PASS | New ES modules under `src/public/js/thousand/`. No bundlers, no CDN deps, no inline JS. |
| §III | Least code               | ✓ PASS | Reuses every existing service (`Round`, `Deck`, `DealSequencer`, `RoundSnapshot`, `RoundPhases`, `RoundActionHandler`, `ConnectionManager`, `RateLimiter`, `Toast`, `Antlion`, `IdentityStore`). New code is the minimum needed for the new behaviour: one new persistent entity (`Game`), one trick-play state machine (`TrickPlay`), one pure-function scoring module (`Scoring`), plus 4 new frontend screens. Marriage declaration uses a flag on the existing `play_card` message rather than a separate event (Decision 5). |
| §IV  | Backend as thin server   | ✓ PASS | All trick-play logic in `TrickPlay` (service layer). All cross-round state in `Game` (service layer). `ConnectionManager` stays as message dispatch only. HTTP controllers unchanged. |
| §V   | No build step            | ✓ PASS | Plain `.js` files; no transpilation. |
| §VI  | Responsive design        | ✓ PASS | New screens reuse the existing CSS Grid + relative units + media-query pattern. Touch targets reuse `--touch-min`. The final-results history table is scrollable on small screens (the spec leaves layout to implementation; the view-model is layout-agnostic). |
| §VII | Classes over functions   | ✓ PASS | New stateful concepts are ES6 classes: `Game`, `TrickPlay`, `CardExchangeView`, `TrickPlayView`, `MarriageDeclarationPrompt`, `CollectedTricksStack`, `RoundSummaryScreen`, `FinalResultsScreen`. `Scoring` is pure utility (no state) so exports functions only — fits the §VII carve-out for stateless helpers. |
| §VIII | One class per file      | ✓ PASS | One class per `.js` file; file name matches class name. `Scoring.js` exports several pure functions (no class) — this is the existing pattern from `Deck.js`. |
| §IX  | Small units              | ⚠ RISK | `Round.js` already at ~324 lines. Adding card-exchange + trick-play + scoring + the round-summary build would push it well over §IX. **R-001 from feature 004 is reopened** and tracked here. Mitigation: extract `TrickPlay.js` (trick state machine) and `Scoring.js` (pure-function scoring) before merge. See Known Risks below. |
| §X   | Logical cohesion         | ✓ PASS | Cross-round state in `Game.js`. Trick-play state in `TrickPlay.js` (a single concept). Pure scoring functions in `Scoring.js` (feature-specific utility, not a generic `utils/`). Frontend phase screens each in their own file under `src/public/js/thousand/`. |
| §XI  | Frontend through Antlion | ✓ PASS | All new animations use `Antlion.onTick` for per-frame interpolation and `Antlion.schedule` for the inter-step pauses (e.g., the 350 ms pause before the trick-collect flight). All card-tap inputs route through `Antlion.bindInput`. No raw `setTimeout` / `addEventListener` / `requestAnimationFrame` in any new feature module. |

No gate violations. One §IX size-signal risk noted (R-001 carries forward from feature 004 with additional extractions required).

**Post-design re-check**: See research.md Decisions 1, 2, 3 and data-model.md. The `Game` / `Round` / `TrickPlay` / `Scoring` decomposition keeps every new file within or near the §IX guideline; remaining size risk is tracked under R-001 below.

## Project Structure

### Documentation (this feature)

```text
specs/005-play-phase-scoring/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ws-messages.md   # Phase 1 output
├── spec.md              # Feature specification (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code

```text
# New backend files
src/services/Game.js                                # Persists-across-rounds entity: cumulativeScores, dealerSeat, barrelState, consecutiveZeros, continuePresses, history, gameStatus
src/services/TrickPlay.js                           # R-001 mitigation: trick-play state machine (lead, currentTrick, currentTrumpSuit, declaredMarriages, collectedTricks)
src/services/Scoring.js                             # Pure functions: cardPoints, roundScores, roundDeltas, determineWinner, buildFinalResults

# Modified backend files
src/services/Round.js                               # Adds card-exchange action (FR-002/FR-003); delegates trick-play to TrickPlay; round-summary build (FR-013/FR-014/FR-015)
src/services/RoundPhases.js                         # Adds card-exchange ↔ trick-play and trick-play → round-summary transitions
src/services/RoundSnapshot.js                       # Adds reconnect-snapshot fields for card-exchange / trick-play / round-summary / final-results (FR-026)
src/services/ThousandStore.js                       # Instantiates Game once per game-session; persists across rounds; new cleanup callsites (FR-029)
src/controllers/RoundActionHandler.js               # New message branches: exchange_pass, play_card, continue_to_next_round; barrel-aware bid validation (FR-022)
src/services/ConnectionManager.js                   # New message branches dispatched to RoundActionHandler

# New frontend files (src/public/js/thousand/)
src/public/js/thousand/CardExchangeView.js          # Card-exchange phase UI (tap-to-select + destination buttons; opponent waiting state)
src/public/js/thousand/TrickPlayView.js             # Trick-play phase UI (centre slot, lead/follow prompt, integrates MarriageDeclarationPrompt + CollectedTricksStack)
src/public/js/thousand/MarriageDeclarationPrompt.js # FR-009 prompt — Declare and play / Play without declaring / Cancel
src/public/js/thousand/CollectedTricksStack.js      # Per-seat face-down stack + "× N" badge (FR-008)
src/public/js/thousand/RoundSummaryScreen.js        # Round summary view; Continue button gating; sticky-press indicator (FR-015 / FR-016)
src/public/js/thousand/FinalResultsScreen.js        # Final ranking + per-round history table + Back-to-Lobby (FR-017)

# Modified frontend files
src/public/js/thousand/GameScreen.js                # Phase routing: 'Card exchange' → CardExchangeView, 'Trick play' → TrickPlayView, 'Round complete' → RoundSummaryScreen, 'Game over' → FinalResultsScreen
src/public/js/thousand/GameScreenControls.js        # Mount/unmount the new control widgets per FR-020
src/public/js/thousand/StatusBar.js                 # Renders new fields: trickNumber, currentTrumpSuit, cumulativeScores (always visible), barrelMarkers, roundNumber
src/public/js/thousand/RoundActionDispatcher.js     # Outbound wrappers for exchange_pass, play_card, continue_to_next_round
src/public/js/thousand/constants.js                 # Adds MARRIAGE_BONUS, CARD_POINT_VALUE, RANK_ORDER constants
src/public/js/core/ThousandApp.js                   # Final-results / game-aborted lifecycle handling
src/public/js/core/ThousandMessageRouter.js         # Validators + handlers for all new server→client messages
src/public/css/index.css                            # Layout for destination buttons, centre slot, collected-tricks stacks, round-summary table, final-results ranking + history table, barrel-marker badge

# New test files
tests/Round.cardexchange.test.js                    # FR-002 / FR-003 pass validation; final on commit; second-pass destination restriction
tests/Round.trickplay.test.js                       # FR-006 / FR-007 / FR-008 follow-suit, trump priority, Ten outranks K/Q, winner determination
tests/Round.marriage.test.js                        # FR-009 / FR-010 / FR-011 marriage conditions, trump replacement on current trick, no-prompt timing
tests/Scoring.test.js                               # FR-013 card-point totals; FR-014 made/missed + opponent deltas; FR-017 tiebreak via determineWinner
tests/Game.multiround.test.js                       # FR-016 dealer rotation; FR-029 cleanup at game-end only; cumulative carry-over
tests/Game.barrel.test.js                           # FR-021 / FR-022 / FR-023 barrel state transitions, bid-floor enforcement, 3-round penalty
tests/Game.consecutivezeros.test.js                 # FR-024 zero-counter, penalty + reset, simultaneous barrel + zeros
tests/Round.disconnect.play.test.js                 # FR-025 trick-play disconnect pause/continue; round-summary sticky press; grace-expiry abort variants
tests/round-messages.005.test.js                    # End-to-end via ConnectionManager: exchange → trick → summary → next-round → victory
tests/CardExchangeView.test.js                      # FR-002 selection UI, destination restriction after first pass
tests/TrickPlayView.test.js                         # FR-007 client-side card-disable; FR-008 collected-stack growth and badge update
tests/MarriageDeclarationPrompt.test.js             # FR-009 Cancel returns to selection; combined play_card outbound payload on Declare and play
tests/RoundSummaryScreen.test.js                    # FR-015 made/missed rendering, Continue button gating, sticky press indicator
tests/FinalResultsScreen.test.js                    # FR-017 ranking sort, history table, winner highlight
tests/StatusBar.005.test.js                         # FR-018 new fields rendered (trick number, trump, cumulative scores, barrel markers, round number)
```

**Structure Decision**: Single project (unchanged from feature 004). Backend services in `src/services/`, controllers in `src/controllers/`, frontend modules in `src/public/js/thousand/`, tests in `tests/`. No new top-level directories.

## Implementation Phases (delivery order)

The spec defines four independently-testable priorities; each lands as its own PR.

1. **P1 — Card exchange + 8 tricks + single-round summary** (FR-001 .. FR-008, FR-013, FR-014 partial — declarer made/missed only, FR-015 with Back-to-Lobby variant, FR-018 partial, FR-019, FR-020, FR-025 partial, FR-026 partial, FR-027 partial, FR-028, FR-030). The smallest end-to-end slice: bidding → exchange → 8 tricks (no trump) → round summary with Back-to-Lobby. Game record purged at round-end on this milestone (no multi-round yet — temporary; superseded by P3).
2. **P2 — Marriages and trump** (FR-009 .. FR-012, FR-018 trump indicator). Adds the marriage-declaration prompt, the combined `play_card { declareMarriage }` flow, the trump-suit state machine, and the trump-priority extension to follow-suit (FR-007 second clause). Round summary now includes the marriage-bonus column.
3. **P3 — Multi-round + victory + final-results** (FR-016, FR-017, FR-018 cumulative scores + round number, FR-025 sticky-press path, FR-029 supersession). Introduces the new `Game` entity, dealer rotation, Continue-press protocol, final-results screen with per-round history. Game record now persists across rounds; cleaned up only at game-end / abort. The P1 temporary round-end cleanup is removed.
4. **P4 — Special scoring (barrel + three-zeros)** (FR-021 .. FR-024). Bolt-on the barrel-state and consecutive-zero counters on `Game`; extend bid validation (FR-022); apply the −120 penalties at round-end scoring; surface them in the round summary as line items.

Disconnect handling (FR-025 grace-period and snapshot extensions, FR-026 reconnect rehydration) is implemented incrementally across all four phases as each phase's state surface grows.

## Complexity Tracking

*(One §IX size signal carried forward from feature 004; no constitution violations — section not required.)*

## Known Risks

| ID    | Risk                                              | Detail                                                                                                                                                                                                                                                                                                | Mitigation                                                                                                                                                                                                                                                                                                                          |
|-------|---------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| R-001 | `Round.js` size (§IX signal — reopened)           | `Round.js` is already at ~324 lines post-feature-004 (three extractions already landed). Adding card-exchange + trick-play + round-summary build would push it past 500 lines.                                                                                                                       | **Plan**: extract `TrickPlay.js` (trick state + action methods) and `Scoring.js` (pure functions) before merging P1. Card-exchange is small (≤ 30 lines) and stays on `Round` alongside the existing absorbtalon helper in `RoundPhases.js`. Reassess after P2 (marriages); if `TrickPlay.js` grows past ~250 lines, extract `MarriageRules.js` for the marriage-validation helpers. |
| R-002 | `Game` lifecycle straddles round resets           | The `Game` instance must survive `Round` reconstruction at each round boundary. A bug where `ThousandStore.startRound` accidentally re-creates `Game` would silently wipe cumulative scores and barrel state.                                                                                          | The auto-start trigger creates `Game` **only on round 1** (when `game.session === null`). Subsequent rounds use `Game.startNextRound()` which instantiates a fresh `Round` but never touches `Game`. Unit test in `Game.multiround.test.js` asserts `game.session === sameInstanceAcross3Rounds`. |
| R-003 | Trick-winner rule (Ten > King > Queen) regression | FR-008 spells out a non-obvious rule. A pure numeric rank-pip comparison would get this wrong. A regression here is catastrophic for game-correctness.                                                                                                                                                | The `RANK_ORDER` table lives in `Scoring.js` as a single source of truth. `Round.trickplay.test.js` includes a `T-beats-K`, `T-beats-Q`, `A-beats-T` table-driven test covering every same-suit pair. |
| R-004 | Reconnect snapshot in trick-play leaks identities | FR-019 requires snapshots to omit identities for any card outside the recipient's currently-visible scope. The trick-play snapshot must NOT include identities for already-collected tricks (only counts), and the round-summary snapshot must NOT include other players' collected cards.            | The single point of identity-filtering is `Round.getSnapshotFor(viewerSeat)` (already in `RoundSnapshot.js`). New per-phase fields are added there. `Round.disconnect.play.test.js` asserts the snapshot bytes for each phase against the per-viewer visibility table. |
| R-005 | Marriage prompt timing edge case (trick 1 / 7 / 8) | The prompt MUST NOT appear on trick 1 (rulebook) and MUST NOT appear on trick 7 or 8 (player has fewer than 3 cards). A bug here would let players declare marriages illegally and gain bonus points.                                                                                                | Single client-side gate: `MarriageDeclarationPrompt.canOffer(player, trickNumber)` returns `trickNumber >= 2 && trickNumber <= 6 && player.hand.length >= 3 && player.holdsBothKQ(suit)`. Server re-validates per FR-010 (b). `Round.marriage.test.js` includes negative tests for tricks 1 / 7 / 8 (server rejects). |
| R-006 | `continue_to_next_round` sticky press + abort     | FR-025 requires the press to persist across a disconnect AND the grace timer to keep running. The third-press transition must be atomic with the grace check: if the third press lands AFTER the disconnected player's grace expires, `game_aborted` fires regardless of the recorded Continue.       | `Game.recordContinuePress(seat)` checks `Game.gameStatus === 'in-progress'` AND `disconnectedSeats.every(s => stillWithinGrace(s))` before incrementing. If grace has expired for any seat, the call is a no-op and the grace-expiry handler emits `game_aborted` separately. `Round.disconnect.play.test.js` covers both orderings. |
| R-007 | Cleanup rule supersedes FR-032                    | Feature 004's `RoundActionHandler.handleStartGame` purges the game record on `play_phase_ready`. With this feature, that path is no longer reached during normal play. A leftover purge call would discard the new `Game` session before round 1's exchange even starts.                              | The `play_phase_ready` callsite in `RoundActionHandler.handleStartGame` is replaced with a transition to `card-exchange` + `card_exchange_started` broadcast — no purge. The cleanup callsites move to the three terminal broadcasts (`final_results`, `round_aborted`, `game_aborted`). `Game.multiround.test.js` asserts `store.games.get(gameId) !== undefined` across all round boundaries. |
| R-008 | Animation block on state-changing actions         | FR-030 requires the client to block state-changing messages until the corresponding animation completes (e.g., next-trick lead is not operable until the collect-flight lands). A regression that fires actions during animation would let cheaters race the visual.                                  | The `RoundActionDispatcher` consults an `inFlightAnimation` boolean (set by the animation orchestrator, cleared on land). State-changing dispatches are silently dropped while `true`. `TrickPlayView.test.js` includes a "tap during animation is ignored" assertion. |

## Verification

Run `npm test && npm run lint` per priority. Manual verification end-to-end with 3 browser tabs follows the steps in `quickstart.md`. Test coverage stays ≥ 90% per the constitution.
