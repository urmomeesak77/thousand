---
description: "Task list for Four Nines Bonus"
---

# Tasks: Four Nines Bonus

**Input**: Design documents from `/specs/006-four-nines-bonus/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ws-messages.md, quickstart.md

**Tests**: INCLUDED. This repo is test-first (constitution Tech Stack §: ≥90% coverage; features 004/005 ship per-FR test suites). Each new test annotates the requirement it covers with an inline `// per FR-NNN` comment (the `fr-coverage-checker` convention).

**Organization**: Tasks are grouped by the two user stories from spec.md (US1 = award + ack-gated announcement, P1; US2 = summary/history visibility, P2). The whole feature is small and lands as one PR; the phases are an internal delivery order, not separate branches.

**Branch note**: work stays on `master` (kashka's standing no-new-branches rule). Spec dir is `006-four-nines-bonus`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 (Setup, Foundational, Polish carry no story label)

## Path Conventions

Single project: backend `src/services/`, `src/controllers/`; frontend `src/public/js/`; tests `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tiny shared constant; no project init (established repo).

- [x] T001 Add `FOUR_NINES_BONUS: 100` constant to `src/services/GameRules.js` (single source of truth for the bonus amount; consumed by `Game.applyFourNinesBonus`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure detection helper and the cumulative-bonus method — both user stories build on these. ⚠️ MUST complete before US1/US2.

- [x] T002 [P] Write failing test `tests/Scoring.fournines.test.js` for `findFourNinesSeat(hands, deck)`: returns the owning seat when one hand holds all four 9s; returns `null` when the 9s are split, one is in the talon, or one was passed away in the exchange; declarer-after-exchange (8-card) cases (`// per FR-001`)
- [x] T003 Implement `findFourNinesSeat(hands, deck)` (pure) in `src/services/Scoring.js` so T002 passes — returns the seat whose card list contains all four `rank === '9'` cards, else `null` (FR-001)
- [x] T004 [P] Write failing test `tests/Game.fournines.test.js` for `applyFourNinesBonus(seat)`: cumulative rises by exactly 100; post-round cumulative = `before + 100 + roundDelta` (no double-count); barrel `onBarrel`/victory recompute at round end include the bonus (`// per FR-002`, `// per FR-006`, `// per FR-007`)
- [x] T005 Implement `Game.applyFourNinesBonus(seat)` in `src/services/Game.js`: `cumulativeScores[seat] += GameRules.FOUR_NINES_BONUS` and record the award on the in-progress round-history accumulation; does NOT touch `roundDeltas`, barrel state, or victory (FR-002, FR-009 groundwork)

**Checkpoint**: Detection + banking exist and are unit-tested in isolation.

---

## Phase 3: User Story 1 — Automatic Four-Nines Bonus (Priority: P1) 🎯 MVP

**Goal**: At the `card-exchange → trick-play` transition, detect four 9s, bank +100 onto cumulative, announce via a blocking modal, and gate the first lead until all three players acknowledge. The hand then plays on normally.

**Independent Test**: Drive a hand where one player's 8-card (post-exchange) hand holds all four 9s; on the second `exchange_pass` the player's cumulative rises by 100, all three clients show the modal, the first lead is blocked until three `acknowledge_four_nines` arrive, then play proceeds.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [x] T006 [P] [US1] Write failing test `tests/Round.fournines.test.js`: detection sets `fourNinesAward` at the 2nd-pass transition; `fourNinesAckPending`/`fourNinesAcks` open; `play_card` rejected while pending; award is once-only/idempotent; reconnect snapshot exposes `fourNinesAward`, `fourNinesAckPending`, `viewerHasAcknowledged` (`// per FR-001`, `// per FR-003`, `// per FR-005`, `// per FR-010`)
- [x] T007 [P] [US1] Write failing integration test `tests/round-messages.fournines.test.js` via `ConnectionManager`: `exchange_pass`×2 → `four_nines_awarded` broadcast (with post-bonus `cumulativeScores`) → `trick_play_started` withheld → `acknowledge_four_nines`×3 → first lead unlocked → hand completes (`// per FR-002`, `// per FR-003`, `// per FR-004`)
- [x] T008 [P] [US1] Write failing test `tests/FourNinesPrompt.test.js`: modal renders "{nickname} holds four nines: +100"; Acknowledge dispatches `acknowledge_four_nines` once; `destroy()` unbinds all Antlion inputs (no handler leak) (`// per FR-003`)

### Implementation for User Story 1

- [x] T009 [US1] In `src/services/Round.js` `commitExchangePass` (the `exchangePassesCommitted === 2` branch): call `findFourNinesSeat(this.hands, this.deck)`; if non-null set `this.fourNinesAward = { seat, amount: FOUR_NINES_BONUS }`, `this.fourNinesAckPending = true`, `this.fourNinesAcks = new Set()`; return the award in the result so the handler can act (FR-001, FR-003, FR-005)
- [x] T010 [US1] In `src/services/Round.js`: reject the first `play_card` while `fourNinesAckPending === true` (`{ rejected: true, reason: 'Acknowledge the four-nines bonus first' }`); add `recordFourNinesAck(seat)` (idempotent; clears `fourNinesAckPending` when `fourNinesAcks.size === 3`). If this pushes `Round.js` past the §IX guideline, move the gate helpers into `src/services/RoundPhases.js` (FR-003, FR-005, R-103)
- [x] T011 [US1] In `src/controllers/RoundActionHandler.js` (second-`exchange_pass` path): when the result carries a four-nines award, call `game.session.applyFourNinesBonus(seat)`, broadcast `four_nines_awarded` `{ seat, nickname, amount, cumulativeScores }`, and WITHHOLD the `trick_play_started` broadcast (FR-002, FR-003)
- [x] T012 [US1] In `src/controllers/RoundActionHandler.js`: add the `acknowledge_four_nines` handler — throttle (250 ms), require an open gate, call `round.recordFourNinesAck(seat)`, broadcast `four_nines_ack_progress`; when the gate closes, broadcast the held-back `trick_play_started` (FR-003, FR-027)
- [x] T013 [US1] In `src/controllers/ConnectionManager.js` dispatch `acknowledge_four_nines` to `RoundActionHandler`, and add its shape validation in `src/controllers/validators.js` (FR-003)
- [x] T014 [US1] In `src/services/RoundSnapshot.js` `getSnapshotFor(viewerSeat)`: add `fourNinesAward`, `fourNinesAckPending`, and `viewerHasAcknowledged` while the gate is open; confirm cumulative scores already reflect the banked +100 (FR-010)
- [x] T015 [P] [US1] Create `src/public/js/thousand/FourNinesPrompt.js` — blocking modal class (reuses the `MarriageDeclarationPrompt` pattern); Acknowledge button bound via `Antlion.bindInput`; `destroy()` unbinds (FR-003)
- [x] T016 [US1] In `src/public/js/core/ThousandMessageRouter.js`: route `four_nines_awarded` (open modal + refresh cumulative) and `four_nines_ack_progress` (update "N of 3" state) (FR-003, FR-018)
- [x] T017 [US1] In `src/public/js/thousand/RoundActionDispatcher.js`: add the outbound `acknowledge_four_nines` wrapper (FR-003)
- [x] T018 [US1] In `src/public/js/thousand/GameScreen.js` + `GameScreenControls.js`: mount `FourNinesPrompt` on `four_nines_awarded`, unmount when the gate closes, and suppress trick-play controls while pending (FR-003, FR-020)
- [x] T019 [US1] In `src/public/js/thousand/StatusBar.js` and `ScoreboardPanel.js`: reflect the mid-round +100 cumulative bump immediately on `four_nines_awarded` (FR-018)

**Checkpoint**: Bonus is banked, announced, ack-gated, and the hand plays on — US1 is independently testable (T006–T008 green).

---

## Phase 4: User Story 2 — Bonus Visible in Round Summary and Game History (Priority: P2)

**Goal**: Surface the +100 as a distinct line item on the round summary and reflect it in the final-results per-round history.

**Independent Test**: Play a hand where the bonus fired; the awarded player's summary row shows a distinct "Four nines: +100" line item, and the final-results history row for that round reflects the +100 in the running cumulative.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [x] T020 [P] [US2] Write failing test `tests/RoundSummaryScreen.fournines.test.js`: the awarded seat's row renders a distinct "Four nines: +100" line item separate from trick points / marriage bonus / made-missed delta (`// per FR-008`)
- [x] T021 [P] [US2] Add a failing assertion (in `tests/Round.fournines.test.js` or a new `tests/Round.buildSummary.fournines.test.js`) that `buildSummary` puts `fourNinesBonus: 100` on the awarded seat's row and that `cumulativeAfter` reconciles to `before + 100 + roundDelta` (`// per FR-008`)

### Implementation for User Story 2

- [x] T022 [US2] In `src/services/Round.js` `buildSummary`: add `fourNinesBonus` (100 on the awarded seat, omit/0 otherwise) to the per-player summary row from `this.fourNinesAward` (FR-008)
- [x] T023 [US2] In `src/services/Game.js` round-history entry construction (at `applyRoundEnd`/history append): carry the recorded `fourNinesAward` so the final-results history attributes the +100 to the awarded seat's running cumulative for that round (FR-009)
- [x] T024 [P] [US2] In `src/public/js/thousand/RoundSummaryScreen.js`: render the "Four nines: +100" distinct line item from the `fourNinesBonus` view-model field (FR-008)
- [x] T025 [P] [US2] In `src/public/js/thousand/FinalResultsScreen.js`: reflect the bonus as a distinct contribution/annotation on the affected round's history row (FR-009)

**Checkpoint**: Bonus is fully auditable in-summary and at game end — US1 and US2 both work.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T026 [P] Run `npm run lint` and resolve any issues in the changed `src/` files (naming, comment style, ≤50-line functions per `docs/CODING_CONVENTIONS.md`)
- [x] T027 Run `npm test` (and `npm run test:coverage`); confirm all new suites pass and coverage stays ≥90%; confirm every new test carries its `// per FR-NNN` annotation (run the `fr-coverage-checker` agent)
- [x] T028 Execute the `specs/006-four-nines-bonus/quickstart.md` 3-tab manual walkthrough (force the four-nines hand via the test-deck seam), including the reconnect-mid-gate and premature-lead spot-checks
  - **Done**: added the env-gated deck seam `THOUSAND_STACK_DECK=four-nines` (`Round._stackedDeckForTest`, inert in production) and the live driver `tests/e2e-fournines.js` (Chrome + Firefox + Chromium). Run passed every check: blocking modal "Bob holds four nines: +100" on all three tabs, +100 cumulative bump `[0,100,0]`, blocking overlay gates the lead, gate held after 1 and 2 acks, reconnect-mid-gate restored the modal with the sticky ack preserved, gate released on the 3rd ack, and the round summary showed the distinct "Four nines: +100" line item. The premature-lead rejection is covered server-side by `round-messages.fournines` (the live overlay makes the lead unclickable).
- [x] T029 [P] Confirm `Round.js` size against §IX after T009/T010; if over guideline, finish relocating the ack-gate helpers into `RoundPhases.js` (R-001 / R-105 follow-up)
  - **Outcome**: `Round.js` is 531 lines (pre-existing R-001 risk, far over the ~100-line signal before this feature). The four-nines additions are ~30 lines, all in functions well under the ≤20-line guideline, and the ack-gate is round-lifecycle state that belongs on `Round` per §X. Relocating ~12 lines of cohesive state-mutation helpers into `RoundPhases.js` would not change R-001's status and would scatter the gate logic; kept on `Round`. Lint passes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup (T001 constant). BLOCKS US1 and US2.
- **US1 (Phase 3)**: depends on Foundational (uses `findFourNinesSeat` + `applyFourNinesBonus`).
- **US2 (Phase 4)**: depends on US1 producing `Round.fourNinesAward` (the summary/history read it). US2 is the visibility layer over US1's state.
- **Polish (Phase 5)**: after US1 (+US2 if shipping together).

### Within Each Story

- Tests first (must FAIL), then implementation.
- Server state (`Round`/`Game`) before the handler wiring; handler before frontend.
- Models/helpers before services before endpoints before UI.

### Parallel Opportunities

- T002 ‖ T004 (different test files); each precedes its own impl (T003, T005).
- US1 tests T006 ‖ T007 ‖ T008 (different files).
- Frontend T015 is [P] vs. the server impl tasks; T024 ‖ T025 in US2.
- US1 and US2 are NOT fully parallel — US2 reads US1's `fourNinesAward`. Do US1 first.

---

## Parallel Example: User Story 1 tests

```bash
# Launch the three US1 test files together (they touch different files):
Task: "tests/Round.fournines.test.js — detection + ack-gate + snapshot"
Task: "tests/round-messages.fournines.test.js — end-to-end exchange→ack→lead"
Task: "tests/FourNinesPrompt.test.js — modal render/dispatch/no-leak"
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1.
2. STOP and validate: force the four-nines hand, confirm the +100 banks, the modal gates the first lead, and the hand plays on.
3. This alone is a shippable, rule-correct increment.

### Incremental delivery

4. Add US2 (summary + history visibility) on top — pure presentation over existing state.
5. Polish (lint, coverage, quickstart, §IX size check).

---

## Notes

- [P] = different files, no incomplete-task dependency.
- Each new test annotates its requirement with `// per FR-NNN`.
- Keep the +100 OUT of `roundDeltas` (R-102) — it is banked separately on `Game`.
- No new barrel/victory mechanic: those still evaluate at round end (research Decision 4).
- The `four_nines_awarded` broadcast intentionally reveals the holder's four 9s (FR-003 / Decision 6) — the only allowed identity disclosure.
- Commit after each logical group; stay on `master`.
