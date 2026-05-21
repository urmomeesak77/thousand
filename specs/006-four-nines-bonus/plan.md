# Implementation Plan: Four Nines Bonus

**Branch**: `master` (no feature branch — kashka's standing no-new-branches rule; spec dir is `006-four-nines-bonus`) | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-four-nines-bonus/spec.md`

## Summary

A single house-rule bolt-on top of feature 005's gameplay loop: when card exchange completes and trick play is about to begin, the server checks each player's 8-card hand; if one player holds all four 9s, that player's **cumulative game score** gains +100. A blocking modal announces the award to all three players and **gates the first trick lead** until every player acknowledges it. The hand then plays out normally; the bonus is surfaced as a distinct line item on the round summary and reflected in the final-results per-round history.

Architecturally this is small and entirely additive. The detection point is the existing `card-exchange → trick-play` transition in `Round.commitExchangePass` (the second `exchange_pass` commit). The bonus is applied to the existing `Game.cumulativeScores` (so the always-visible status-bar total reflects it immediately, per FR-018). A new acknowledgment-gate sub-state on `Round` (modelled on the existing `continue_to_next_round` sticky-press protocol) holds the first lead until all three players ack. The bonus is recorded on the `Round` (`fourNinesAward`) and threaded into the round-summary view-model and the `Game` round-history log. No scoring formula in `Scoring.js` changes — the +100 is a separate banked adjustment, never part of `roundDeltas`.

Frontend gains one modal (`FourNinesPrompt`) and a small extension to `StatusBar`/scoreboard refresh on the mid-round cumulative bump. All timing/input continues through Antlion per §XI.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS server) / Vanilla JS ES6+ ES modules (browser) — unchanged.
**Primary Dependencies**: `ws` ^8, Node.js built-in `crypto` — unchanged. Reuses every feature 004/005 service (`Round`, `TrickPlay`, `Game`, `Scoring`, `RoundSnapshot`, `RoundActionHandler`, `ConnectionManager`, `Antlion`, `Toast`, `RateLimiter`).
**Storage**: In-memory only. The bonus and its acknowledgments live on the in-memory `Round`/`Game`; lost on server restart (consistent with 004/005).
**Testing**: Node.js built-in `--test` runner (`*.test.js`); `jsdom` for frontend. Minimum 90% coverage.
**Target Platform**: Node.js server + modern browser (ES6+) — unchanged.
**Project Type**: Web application (lobby + real-time game).
**Performance Goals**:
- Bonus applied + announced on all 3 clients within 1 s of card exchange completing (SC-001, SC-005).
- Status-bar / scoreboard cumulative total reflects the +100 within 1 s (FR-018).
**Constraints**:
- §XI: all frontend timing/input through `Antlion` — no raw `setTimeout`/`setInterval`/`addEventListener`/`requestAnimationFrame` in feature modules. The `FourNinesPrompt` modal reuses the `MarriageDeclarationPrompt` pattern (Antlion-bound buttons).
- §IX: keep new units small. `Round.js` is already a §IX risk (R-001, carried from 004/005); the new logic must stay minimal — detection is a few lines plus a small ack-gate helper (extract to `RoundPhases.js` if it grows).
- FR-019 minimum-knowledge: the award **intentionally** reveals that the named player holds the four 9s (FR-003) — this is the one allowed identity leak, analogous to a declared marriage. No other card identities are exposed.
- FR-005: the bonus fires exactly once per hand; the ack-gate and the award must be idempotent against duplicate/throttled messages (FR-027 250 ms throttle extends to `acknowledge_four_nines`).
**Scale/Scope**: 3-player rooms only. FR-001 .. FR-010. One detection, one banked cumulative adjustment, one ack-gated modal, one summary line item.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| §    | Principle                | Status | Notes |
|------|--------------------------|--------|-------|
| §I   | Vanilla JS + Node.js     | ✓ PASS | No new dependencies. +100 is a plain integer add. |
| §II  | Single-file frontend     | ✓ PASS | One new ES module (`FourNinesPrompt.js`) under `src/public/js/thousand/`. No bundlers/CDN/inline JS. |
| §III | Least code               | ✓ PASS | Reuses the entire 004/005 stack. The bonus is a banked cumulative adjustment, not a new scoring formula. The ack-gate reuses the `continue_to_next_round` sticky-press shape. |
| §IV  | Backend as thin server   | ✓ PASS | Detection on `Round`; cumulative mutation on `Game`; dispatch in `RoundActionHandler`/`ConnectionManager`. HTTP controllers untouched. |
| §V   | No build step            | ✓ PASS | Plain `.js`. |
| §VI  | Responsive design        | ✓ PASS | `FourNinesPrompt` reuses the existing modal CSS (relative units, `--touch-min` acknowledge button). |
| §VII | Classes over functions   | ✓ PASS | `FourNinesPrompt` is an ES6 class. Detection helper (`handHoldsFourNines`) is a pure stateless utility → fits the §VII carve-out (lives in `Scoring.js` alongside the other pure card helpers). |
| §VIII| One class per file       | ✓ PASS | `FourNinesPrompt.js` holds one class. The pure helper is a function export in the existing `Scoring.js` (matches the `Deck.js`/`Scoring.js` pattern). |
| §IX  | Small units              | ⚠ RISK | `Round.js` remains the standing size risk (R-001). New code is intentionally tiny: ~5-line detection call at the transition + a ~15-line ack-gate helper. If the ack-gate pushes `Round.js` over the line, move it into `RoundPhases.js`. Tracked below. |
| §X   | Logical cohesion         | ✓ PASS | Detection is card-fact logic → `Scoring.js`. Cumulative mutation → `Game.js` (`applyFourNinesBonus`). Ack-gate is round-lifecycle state → `Round.js`/`RoundPhases.js`. Modal → `thousand/` frontend. |
| §XI  | Frontend through Antlion | ✓ PASS | Modal buttons bound via `Antlion.bindInput`; no raw listeners/timers. |

No gate violations. One pre-existing §IX size signal (R-001) is respected by keeping the new server code minimal and ready to relocate the ack-gate helper into `RoundPhases.js`.

**Post-design re-check**: See research.md Decisions 1–5 and data-model.md. The detection-in-`Scoring`, bonus-on-`Game`, gate-on-`Round` split keeps each change within the §IX guideline; remaining size risk stays under R-001.

## Project Structure

### Documentation (this feature)

```text
specs/006-four-nines-bonus/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ws-messages.md   # Phase 1 output
├── checklists/
│   └── requirements.md  # /speckit-specify output
├── spec.md              # Feature specification
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code

```text
# New backend files
(none — all server changes are extensions of existing files)

# Modified backend files
src/services/Scoring.js                     # New pure helper: handHoldsFourNines(handCardIds, deck) → boolean / owning seat
src/services/Game.js                        # New applyFourNinesBonus(seat): cumulativeScores[seat] += 100; record for history (FR-002, FR-009)
src/services/Round.js                       # At the exchange→trick-play transition: detect four-nines, set fourNinesAward, open the ack-gate; gate the first play_card (FR-001, FR-003, FR-005); buildSummary surfaces the line item (FR-008)
src/services/RoundPhases.js                 # (If Round.js size requires) house the ack-gate helper: openFourNinesGate / recordFourNinesAck
src/services/RoundSnapshot.js               # Reconnect-snapshot fields: pending modal + per-seat acks (sticky), already-applied cumulative (FR-010)
src/controllers/RoundActionHandler.js       # On second exchange_pass: apply bonus to Game, broadcast four_nines_awarded, hold trick_play_started until acked; new acknowledge_four_nines branch
src/controllers/ConnectionManager.js        # Dispatch acknowledge_four_nines to RoundActionHandler
src/controllers/validators.js               # Validate acknowledge_four_nines shape

# New frontend files (src/public/js/thousand/)
src/public/js/thousand/FourNinesPrompt.js   # Blocking modal: "{nickname} holds four nines: +100" + Acknowledge button (FR-003)

# Modified frontend files
src/public/js/thousand/GameScreen.js                 # Mount/unmount FourNinesPrompt when a four_nines_awarded gate is open
src/public/js/thousand/GameScreenControls.js         # Gate trick-play controls while the modal is pending (FR-003 / FR-020)
src/public/js/thousand/StatusBar.js / ScoreboardPanel.js  # Reflect the mid-round +100 cumulative bump (FR-018)
src/public/js/thousand/RoundSummaryScreen.js         # Render the "Four nines: +100" distinct line item (FR-008)
src/public/js/thousand/FinalResultsScreen.js         # Reflect the bonus in the per-round history row (FR-009)
src/public/js/thousand/RoundActionDispatcher.js      # Outbound wrapper for acknowledge_four_nines
src/public/js/core/ThousandMessageRouter.js          # Handle four_nines_awarded + ack-progress server→client messages

# New test files
tests/Scoring.fournines.test.js             # handHoldsFourNines: positive (one hand has all four), negative (split / one in talon), declarer-after-exchange cases
tests/Round.fournines.test.js               # Detection at exchange→trick-play transition; ack-gate holds first lead; idempotent (FR-005); reconnect snapshot fields (FR-010)
tests/Game.fournines.test.js                # applyFourNinesBonus banks +100; barrel recompute at round end includes it; not double-counted in roundDeltas (FR-002, FR-006, FR-007)
tests/round-messages.fournines.test.js      # End-to-end via ConnectionManager: exchange → four_nines_awarded → 3× acknowledge → first lead unlocked → summary line item
tests/FourNinesPrompt.test.js               # Modal renders nickname + amount; Acknowledge dispatches once; no leak of Antlion handlers
tests/RoundSummaryScreen.fournines.test.js  # "Four nines: +100" distinct line item rendering
```

**Structure Decision**: Single project (unchanged from 004/005). No new top-level directories. The feature is additive; the only new files are one frontend modal and the test files.

## Implementation Phases (delivery order)

The feature maps cleanly to the spec's two priorities and lands as one PR (it is small).

1. **P1 — Detection, award, ack-gated announcement** (FR-001 .. FR-007, FR-010). Pure `handHoldsFourNines` helper + `Game.applyFourNinesBonus` + the detection/ack-gate at the exchange→trick-play transition + the `FourNinesPrompt` modal + reconnect-snapshot fields. This is the functional core: the bonus is correctly banked, the modal gates the first lead, and the hand plays on.
2. **P2 — Summary + history visibility** (FR-008, FR-009). Thread `fourNinesAward` into the round-summary view-model and the `Game` round-history log; render the distinct line item on `RoundSummaryScreen` and the per-round history row on `FinalResultsScreen`.

Disconnect/reconnect handling (FR-010) lands with P1, since the ack-gate is the only new state surface.

## Complexity Tracking

*(No new constitution violations; one pre-existing §IX size signal on `Round.js` carried from 004/005 — section not required.)*

## Known Risks

| ID    | Risk | Detail | Mitigation |
|-------|------|--------|------------|
| R-101 | Detection inspects the wrong hand snapshot | FR-001 requires the **post-exchange 8-card** hand, not the dealt 7-card hand. A declarer can gain/lose a fourth 9 via the talon pickup and the two passed cards. Checking too early (at deal) would award the wrong player or none. | Detection fires inside `Round.commitExchangePass` only when `exchangePassesCommitted === 2` (phase flips to `trick-play`), reading `this.hands`. `Scoring.fournines.test.js` includes a declarer-gains-9-from-talon and declarer-passes-9-away case. |
| R-102 | Double-counting the +100 | The bonus is banked at trick-play start; `Game.applyRoundEnd(roundDeltas)` then adds the round deltas. If the +100 leaked into `roundDeltas`, it would be added twice. | `applyFourNinesBonus` mutates `cumulativeScores` directly and is recorded **separately** from `roundDeltas` (which only ever carry tricks/marriages/made-missed/penalties). `Game.fournines.test.js` asserts the post-round cumulative equals `prev + 100 + roundDelta`, exactly once. |
| R-103 | Ack-gate vs. race to lead | The declarer's client could fire the first `play_card` before all three acks land. | While `Round.fourNinesAckPending` is true, `play_card` is rejected with `action_rejected` ("Acknowledge the four-nines bonus first"). The gate clears only when `fourNinesAcks.size === 3`. Sticky across disconnect (mirrors `continue_to_next_round`). `Round.fournines.test.js` covers premature-lead rejection. |
| R-104 | Barrel-entry counting nuance | Q3 said the four-nines hand counts toward the 3-round barrel window. But feature 005's `applyRoundEnd` advances the counter only for players **already** on barrel at round start, recomputing `onBarrel` at the end. A player who **newly** enters barrel via the bonus this round is not retroactively counted this round — counting begins next round. | Documented in research.md Decision 4. No change to `applyRoundEnd` mechanics: the bonus is a plain cumulative bump. For an **already-on-barrel** player the hand counts normally (consistent with Q3). The newly-entering case is a one-round-later start — surfaced to kashka in the plan report as a minor refinement of FR-006's wording, not a behavioural special-case. |
| R-105 | `FourNinesPrompt` handler leak between rounds | Like other modals, failing to unbind Antlion inputs on unmount leaks handlers across rounds (cf. `input-handler-leaks.test.js` from 005). | `FourNinesPrompt.destroy()` unbinds all Antlion inputs; `GameScreen` unmounts it when the gate closes. `FourNinesPrompt.test.js` asserts no residual handlers. |

## Verification

Run `npm test && npm run lint`. Manual end-to-end with 3 browser tabs follows `quickstart.md` (force a four-nines hand via the deck seam used in 005's tests). Coverage stays ≥ 90%.
