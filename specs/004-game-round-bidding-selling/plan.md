# Implementation Plan: Round Setup, Bidding & Selling the Bid

**Branch**: `004-game-round-bidding-selling` | **Date**: 2026-05-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-game-round-bidding-selling/spec.md`

## Summary

The lobby and waiting room are done. This feature turns a full 3-player waiting room into an actual card game: auto-start on the 3rd join, animated 24-card deal, clockwise bidding (100–300, multiples of 5), declarer takes the talon, optional Selling phase (up to 3 attempts) where opponents may buy the bid, and a handoff signal for the out-of-scope play phase ending with a per-player Back-to-Lobby screen.

Server-authoritative model: a new `Round` class owns the in-round state machine and the full deck; clients only ever see card identities currently visible to them per FR-022/FR-023. The canonical 24-step deal sequence is computed once and broadcast in a single `round_started` payload — clients animate locally via `Antlion.onTick` so the visible deal order is identical across the table. A persistent top status bar on every client is driven by a shared `gameStatus` view-model pushed by the server on every state change.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS server) / Vanilla JS ES6+ ES modules (browser)
**Primary Dependencies**: `ws` ^8 (already in use), Node.js built-in `crypto` (for deck shuffle entropy); reuses existing `Antlion`, `Toast`, `RateLimiter`, `IdentityStore`, `ReconnectOverlay`
**Storage**: In-memory only (`ThousandStore` already in-memory; round state attached as `game.round`); server restart aborts in-flight rounds (consistent with feature 003)
**Testing**: Node.js built-in `--test` runner (`*.test.js`); `jsdom` available for frontend tests; minimum 90% coverage
**Target Platform**: Node.js server + modern browser (ES6+)
**Project Type**: Web application (lobby + real-time game)
**Performance Goals**:
- Game auto-starts within 2 s of 3rd player joining (SC-001)
- Status bar reflects any server state change within 1 s (SC-008, FR-025)
- Deal animation completes within ~2 s (24 cards × ~80 ms each)
- Smooth per-frame animation (`Antlion.onTick` at rAF cadence, ~60 fps target)
**Constraints**:
- Constitution §XI: all frontend timing/input through `Antlion` — no raw `setTimeout` / `setInterval` / `addEventListener` / `requestAnimationFrame` in feature modules
- Constitution §II: ES modules under `src/public/js/`, no bundlers/transpilers/CDN deps
- FR-022 / FR-023: clients receive a card's `{ rank, suit }` only while that card is currently visible to the viewer; identities of cards that have left view MUST be dropped client-side and never re-sent
- FR-030: per-player 250 ms throttle on state-changing in-round messages, silent drops
**Scale/Scope**: 3-player rooms only (FR-001 .. FR-032). One round, no scoring, no multi-round dealer rotation. Small LAN/shared gaming context (<100 concurrent players).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| §    | Principle                | Status | Notes |
|------|--------------------------|--------|-------|
| §I   | Vanilla JS + Node.js     | ✓ PASS | No new dependencies. Built-in `crypto.randomInt` / `randomBytes` used for shuffle entropy. |
| §II  | Single-file frontend     | ✓ PASS | New ES modules under `src/public/js/thousand/`, permitted by §II (v2.3.0). No bundlers, no CDN deps, no inline JS. |
| §III | Least code               | ✓ PASS | Reuses existing `RateLimiter`, `Toast`, `Antlion`, `IdentityStore`. No new libraries. The single canonical `round_started` payload avoids any new streaming/event-replay infrastructure. |
| §IV  | Backend as thin server   | ✓ PASS | All round logic in `Round` (service layer). `ConnectionManager` stays as message dispatch only. HTTP controllers unchanged except the auto-start trigger inside `_admitPlayerToGame`. |
| §V   | No build step            | ✓ PASS | Plain `.js` files; no transpilation. |
| §VI  | Responsive design        | ✓ PASS | Game screen uses CSS Grid with relative units and media queries. Touch targets reuse existing `--touch-min: 2.75rem` baseline. Card sizes scale with viewport. Layout sketch (`docs/sketches/game-layout.png`) is adapted for 3-player mode (top "P4" area omitted per spec Assumptions). |
| §VII | Classes over functions   | ✓ PASS | All stateful concepts are ES6 classes: `Round`, `GameScreen`, `StatusBar`, `CardTable`, `HandView`, `OpponentView`, `TalonView`, `CardSprite`, `DealAnimation`, `BidControls`, `DeclarerDecisionControls`, `SellSelectionControls`, `SellBidControls`, `RoundReadyScreen`, `RoundActionDispatcher`, `RoundActionHandler`. Pure utility (`Deck`) exports functions only. |
| §VIII | One class per file      | ✓ PASS | One class per `.js` file; file name matches class name. |
| §IX  | Small units              | ⚠ RISK | `Round` may exceed ~100 lines (state machine + deck + 7 action methods + snapshot/view-model getters). Tracked as **R-001** in Known Risks. |
| §X   | Logical cohesion         | ✓ PASS | Round logic in `Round.js`. Game-specific UI under `src/public/js/thousand/`. Deck shuffle in `Deck.js` (feature-specific utility, not a generic `utils/`). |
| §XI  | Frontend through Antlion | ✓ PASS | The deal animation uses `Antlion.onTick` for per-frame interpolation. Card-tap inputs use `Antlion.bindInput`. Any deferred action (e.g., the post-deal control-enable) uses `Antlion.schedule`. No raw `setTimeout` / `addEventListener` / `requestAnimationFrame` in feature modules. |

No gate violations. One §IX size-signal risk noted (R-001).

**Post-design re-check**: See research.md and data-model.md. The state-machine decomposition decided in research.md Decision 1 keeps `Round.js` within or near the §IX guideline; remaining risk tracked.

## Project Structure

### Documentation (this feature)

```text
specs/004-game-round-bidding-selling/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ws-messages.md   # Phase 1 output
├── checklists/
│   └── requirements.md  # Existing (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code

```text
# New backend files
src/services/Round.js                                 # Round state machine + actions
src/services/Deck.js                                  # 24-card factory + Fisher-Yates shuffle (pure functions)
src/controllers/RoundActionHandler.js                 # Validate + dispatch in-round WS messages

# Modified backend files
src/services/ThousandStore.js                         # Attach round to game; auto-start on 3rd join; disconnect-during-round flow; cleanup on round end
src/services/ConnectionManager.js                     # New message branches: bid/pass/sell_select/sell_cancel/sell_bid/sell_pass/start_game; reconnect snapshot
src/controllers/GameController.js                     # Trigger startRound() when 3rd player admitted

# New frontend files (src/public/js/thousand/)
src/public/js/thousand/GameScreen.js                  # In-round screen container
src/public/js/thousand/StatusBar.js                   # Fixed top bar (FR-025)
src/public/js/thousand/CardTable.js                   # Table layout + slot positions
src/public/js/thousand/CardSprite.js                  # Single card visual
src/public/js/thousand/HandView.js                    # Viewer's own hand (sorted, tap-to-select for Selling)
src/public/js/thousand/OpponentView.js                # One opponent's face-down hand
src/public/js/thousand/TalonView.js                   # Central talon
src/public/js/thousand/DealAnimation.js               # 24-step deal animation (Antlion.onTick)
src/public/js/thousand/BidControls.js                 # Bid input + steppers + Pass (FR-028)
src/public/js/thousand/DeclarerDecisionControls.js    # Sell / Start buttons
src/public/js/thousand/SellSelectionControls.js       # Sell-confirm / Cancel
src/public/js/thousand/SellBidControls.js             # Opponent's buy controls (reused BidControls shape)
src/public/js/thousand/RoundReadyScreen.js            # "Round ready to play" + Back-to-Lobby
src/public/js/thousand/RoundActionDispatcher.js       # Outbound message wrapper

# Modified frontend files
src/public/js/core/ThousandApp.js                     # New validators/handlers; instantiate GameScreen; route action_rejected to Toast
src/public/css/index.css                              # Game-screen layout, status bar, card sprites, button rows, RoundReady

# New test files
tests/Round.deal.test.js                              # Shuffle + canonical 24-step sequence
tests/Round.bidding.test.js                           # Bid validation, pass lockout, all-pass → dealer
tests/Round.selling.test.js                           # Distinct-attempt rule, opponent rotation, role swap, 3-fail lockout
tests/Round.gating.test.js                            # FR-026 phase/turn gating, server source-of-truth
tests/Round.disconnect.test.js                        # Active vs non-active disconnect, grace expiry → abort, FR-032 cleanup
tests/Round.ratelimit.test.js                         # FR-030 silent drop within 250 ms
tests/round-messages.test.js                          # End-to-end via ConnectionManager + fake WS
tests/HandView.test.js                                # FR-005 sort rule + re-sort on mutation
tests/GameScreen.gating.test.js                       # FR-026 disabled vs hidden matrix on client
tests/BidControls.test.js                             # FR-028 stepper clamp, invalid input handling
tests/SellSelectionControls.test.js                   # FR-029 exactly-3 toggle, Cancel
tests/StatusBar.test.js                               # FR-025 view-model rendering
```

**Structure Decision**: Single project (Option 1). Backend services in `src/services/`, controllers in `src/controllers/`, frontend modules in `src/public/js/thousand/` (new feature directory per Constitution §XI), tests in `tests/`. Follows existing layout exactly; no new top-level directories.

## Implementation Phases (delivery order)

The spec defines three independently-testable priorities; each lands as its own PR.

1. **P1 — Auto-start + Deal + Bidding** (FR-001 .. FR-011, FR-020, FR-022 partial, FR-024 .. FR-028, FR-030, FR-031). Smallest end-to-end slice: 3rd join triggers the deal animation; bidding resolves to one declarer.
2. **P2 — Declarer decision + Start-the-Game + RoundReady + cleanup** (FR-012, FR-013, FR-019, FR-027 partial, FR-032). Locks in the play-phase-ready handoff.
3. **P3 — Selling phase** (FR-014 .. FR-018, FR-022/FR-023 for exposed cards, FR-029). Bolt-on the optional selling loop.

Disconnect handling (FR-021, FR-027 reconnect snapshot) is implemented incrementally across all three phases as each phase's state surface grows.

## Complexity Tracking

*(One §IX size signal; no constitution violations — section not required.)*

## Known Risks

| ID    | Risk                                              | Detail                                                                                                                                                                                                                                                                                              | Mitigation                                                                                                                                                                                                                          |
|-------|---------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| R-001 | `Round` class size (§IX signal)                   | The round state machine has 5 phases, 7 action methods, plus snapshot + view-model getters. First draft is expected to land at ~180 lines, exceeding the §IX ~100-line guideline.                                                                                                                  | Tracked task in tasks.md — measure final line count. If > 150 lines, extract phase-transition helpers into `RoundPhases.js`; if dealing logic also grows, extract `DealSequencer.js`. Document the decomposition in a code comment. |
| R-002 | `Antlion.onTick` performance with 24 sprites      | A 60 fps loop driving 24 card sprites + an animating one is well within modern-browser headroom, but a tight per-tick update path matters. A regression in animation smoothness during the deal would visibly degrade SC-001 perception.                                                            | Profile the deal animation on the slowest target device early in P1. Ensure `CardSprite.setPosition` writes only on actual position change (not every tick). Cache DOM references; avoid reflow-triggering reads in the tick loop.   |
| R-003 | View-model drift between server and client        | The persistent status bar (FR-025) requires every client to render the same phase/active-player/high-bid/declarer/passed/attempt/disconnect indicators. If the server forgets to push an update on any state change, the bar goes stale.                                                            | Centralize: every `Round` action method returns a `{ broadcast: { gameStatus, ... } }` object — never let a caller forget. The `RoundActionHandler` emits one `phase_changed` per action. End-to-end test asserts equality across the 3 clients after each step. |
| R-004 | Reconnect snapshot leaking historical identities  | FR-022 / FR-023 require the snapshot to contain only currently-visible identities. A naive snapshot that returns the full deck would leak opponent cards.                                                                                                                                          | `Round.getSnapshotFor(viewerSeat)` is the single function that builds snapshots — explicitly filtered per the visibility table in `data-model.md`. A unit test compares the snapshot bytes against the visibility table for each phase.                          |
| R-005 | Game-record cleanup race with reconnect           | FR-032 says the game record is purged immediately on `play_phase_ready` / `round_aborted`. A reconnect that arrives moments later must route to the lobby, not crash. Today's reconnect flow (feature 003) assumes the game record may still exist.                                                | Test the reconnect path explicitly: after server emits `play_phase_ready` and deletes the game record, a `hello` with the player's old creds returns `connected { restored: true, gameId: null }` and skips `game_joined`. Document this in `quickstart.md`. |

## Verification

Run `npm test && npm run lint` per priority. Manual verification end-to-end with 3 browser tabs follows the steps in `quickstart.md`. Test coverage stays ≥ 90% per the constitution.
