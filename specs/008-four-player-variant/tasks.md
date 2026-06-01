---
description: "Task list for 4-Player Variant with Extended Deck"
---

# Tasks: 4-Player Variant with Extended Deck

**Input**: Design documents from `/specs/008-four-player-variant/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/ws-messages.md

**Tests**: INCLUDED — the plan enumerates new `*.fourplayer.test.js` suites and mandates ≥90% coverage with the existing 3-player suite passing unmodified (US2 / FR-006).

**Organization**: Tasks are grouped by user story. Per the plan's delivery order, the seat-count generalization spine lands first as the **Foundational** phase (with `playerCount` fixed at `3`), because both US1 and US2 depend on it and it is the US2 regression guarantee (R-303).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, US3 (Setup/Foundational/Polish carry no story label)
- Exact file paths are included in every task

## Path Conventions

Single project (web app): `src/` (backend services/controllers + `src/public/` frontend), `tests/` at repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a known-green baseline before any generalization.

- [x] T001 Establish baseline: run `npm test && npm run lint` from repo root and confirm all existing tests and lint pass before any change (records the regression bar for R-303).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Thread a single `playerCount` integer and seat-range helpers through the engine, replacing every `% 3` / `[0,1,2]` / `{0,1,2}` / `=== 2|3` with `playerCount`-derived equivalents — **while the only live value is still `3`**. Add 7/8 to the rank tables (inert for the 24-card deck). This is the US2 regression spine.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete and the existing suite passes unmodified.

- [x] T002 [P] Create seat helpers `seatRange(playerCount)` → `[0…n-1]` and `initSeatMap(playerCount, fill)` → `{0:…, n-1:…}` as a pure stateless module in `src/services/Seats.js` (Decision 2; §VII carve-out).
- [x] T003 [P] Add `'7': 0, '8': 0` to `CARD_POINT_VALUE` and renumber `RANK_ORDER` to `{ '7':0,'8':1,'9':2,'J':3,'Q':4,'K':5,'10':6,'A':7 }` (7,8 below 9; 9–A relative order preserved) in `src/services/Scoring.js` (FR-007, FR-008; Decision 4).
- [x] T004 [P] Mirror the same 7/8 additions into `CARD_POINT_VALUE` and `RANK_ORDER` in `src/public/js/thousand/constants.js` (keep frontend tables in sync; inert for 24-card decks).
- [x] T005 Accept/store `playerCount` and generalize seat maps in `src/services/Game.js`: store `playerCount`; init `cumulativeScores`/`barrelState`/`consecutiveZeros` over `seatRange`; `startNextRound()` dealer rotation `(dealerSeat+1) % playerCount` (FR-012, FR-015).
- [x] T006 Generalize the trick state machine over `playerCount` in `src/services/TrickPlay.js`: constructor `(declarerSeat, deck, playerCount)`; `collectedTricks`/`collectedTrickCounts` over `seatRange`; turn advance `(seat+1) % playerCount`; trick resolves at `currentTrick.length === playerCount`; crawl resolves at `crawlCommits.length === playerCount` (FR-013, FR-017).
- [x] T007 Generalize `activeSellOpponents` / `nextSellOpponent` over `seatRange` excluding declarer with `% playerCount` rotation in `src/services/RoundPhases.js` (FR-012; Decision 7).
- [x] T008 Generalize seat iteration and winner/tiebreak over `seatRange` in `src/services/Scoring.js`: `roundScores`/`roundDeltas`/`buildFinalResults`/`applyPenaltyAnnotations`/`findFourNinesSeat` iterate `seatRange`; `determineWinner` max over `seatRange` with tiebreak declarer-first then `P1 → … → P(n-1) → Dealer` (FR-016; Decision 8). (Depends on T002, T003)
- [x] T009 Generalize per-viewer view-model maps over `seatRange` in `src/services/RoundSnapshot.js`: `buildOpponentHandSizesFor`, `barrelMarkers`, `cumulativeScores` default, `compactScoreHistory`, round-stats maps (still `playerCount === 3`; no `across` key yet) (FR-019). (Depends on T002)
- [x] T010 Thread `playerCount` and generalize rotations/thresholds in `src/services/Round.js`: `this.playerCount = game.playerCount`; all `% 3 → % playerCount`; `hands`/`collectedTricks` over `seatRange`; `passedBidders.size === playerCount - 1`; `_nextActiveBidder` loop bound `playerCount`; exchange transition `=== playerCount - 1`; `SELL_SELECTION_SIZE = playerCount`; first bidder `(dealerSeat+1) % playerCount`; first sell bidder `(declarerSeat+1) % playerCount`; four-nines ack gate `=== playerCount` (FR-009…FR-017). (Depends on T002, T006, T007)
- [x] T011 Regression gate: run `npm test` and confirm the **entire pre-existing 3-player suite passes unmodified** (no test expectation edits). This proves the generalization reduces exactly to today at `playerCount === 3` (R-303).

**Checkpoint**: Engine fully generalized; 3-player behavior byte-for-byte identical. User story phases can now begin.

---

## Phase 3: User Story 1 - Play a complete 4-player game (Priority: P1) 🎯 MVP

**Goal**: Enable a full 4-player game end-to-end on the server: 32-card deck (7s/8s = 0 pts, below 9), deal 7 + 4-talon, forced-declarer over 4 seats, talon pickup to 11 then 3 exchange passes to 8 each, 8 tricks of 4 cards, scoring/victory over four seats.

**Independent Test**: Create a 4-player room, join four clients, play a full round and a full game to ≥1000; verify hand sizes (7→8), talon (4), trick width (4), 7/8 score 0 and never win, and the final scoreboard lists all four players.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL before implementation)

- [x] T012 [P] [US1] `tests/Deck.fourplayer.test.js`: `makeDeck(4)` = 32 cards incl. 7/8 in all four suits; `makeDeck(3)` = 24 unchanged (FR-005, FR-006).
- [x] T013 [P] [US1] `tests/DealSequencer.fourplayer.test.js`: `buildDealDistribution(4)` = 7 per seat + 4 talon = 32, deterministic; 3-player path unchanged (FR-009).
- [x] T014 [P] [US1] `tests/Scoring.fourplayer.test.js`: 7/8 = 0 points and never beat a 9+ of the same suit; `roundScores`/`roundDeltas` over 4 seats; 32-card-deck total trick points = 120; 4-player tiebreak order declarer-first then P1→P2→P3→Dealer (FR-007, FR-008, FR-015, FR-016).
- [x] T015 [P] [US1] `tests/Game.fourplayer.test.js`: cumulative/barrel/consecutive-zero state over 4 seats; dealer rotation `% 4` (FR-012, FR-015).
- [x] T016 [P] [US1] `tests/Round.fourplayer.test.js`: 4-player deal → bid → forced-declarer (3 passes) → talon pickup (11) → exchange 3 passes → 8 each → 8 tricks of 4; sell with 3 opponents; four-nines ack requires all 4 (FR-009…FR-017). MUST include individually-annotated assertions, not just the range: (a) `// per FR-010` declarer holds exactly 11 after picking up the full 4-card talon; (b) `// per FR-011` declarer holds 8 after exactly 3 exchange passes and each opponent gained 1; (c) `// per FR-014` a marriage declared in a 4-player round switches trump and awards the bonus, and follow-suit/trump beat resolution is unchanged across all 4 seats.
- [x] T017 [P] [US1] `tests/round-messages.fourplayer.test.js`: via `ConnectionManager`, create a 4-player game, four joiners, full round; `seats.players.length === 4`, `seats` includes `across`, `currentTrick` reaches length 4; 3-player payload remains free of `across`. Also assert the negative gate `// per FR-003, SC-005`: a 4-player room with only **three** joiners does NOT emit `round_started` (stays in waiting room) and starts only when the 4th joins.
- [x] T018 [P] [US1] Extend `tests/validators.test.js`: `requiredPlayers` accepts 3 and 4, rejects 2/5/"x" → `400` "Player count must be 3 or 4" (FR-002).

### Implementation for User Story 1

- [x] T019 [P] [US1] `makeDeck(playerCount)` selects `RANKS_4P = ['7','8','9','10','J','Q','K','A']` (32 cards) for 4-player, `RANKS_3P` (24, 9–A) for 3-player, suits unchanged, in `src/services/Deck.js` (FR-005, FR-006; Decision 3).
- [x] T020 [US1] Generalize `stepDest(i, playerCount)` and `buildDealDistribution(playerCount)` for the 4-player cadence (7/seat + 4 talon over 32 deterministic steps), 3-player path identical, in `src/services/DealSequencer.js` (FR-009; Decision 6). (Depends on T002)
- [x] T021 [US1] Accept 3 or 4 (reject all else) in `validateRequiredPlayers` in `src/controllers/validators.js` (FR-002).
- [x] T022 [US1] Thread `playerCount` from the create body into the game record (default 3 when omitted) in `src/controllers/GameController.js` (FR-001). (Depends on T021)
- [x] T023 [US1] `startRound` passes `game.requiredPlayers` as `playerCount` into `Game`/`Round`; verify `seatOrder = [...game.players]` seats N joiners in join order in `src/services/ThousandStore.js` (FR-001, R-306). (Depends on T005, T010)
- [x] T024 [US1] Generalize the test deck seam `_stackedDeckForTest`/`_stackRankOnSlots` to the active deck length (24 or 32) and recompute four-nines / no-ace slot indices from `stepDest(_, playerCount)` in `src/services/Round.js` (R-304). (Depends on T010, T020)
- [x] T025 [US1] Add `across` opponent ordering (clockwise `left, across, right`) to `buildSeatLayout` for `playerCount === 4`; omit `across` for 3-player in `src/services/RoundSnapshot.js` (FR-018; contract delta). (Depends on T009)

**Checkpoint**: 4-player game fully playable headless; T012–T018 pass; existing suite still green. This is the MVP (server-side complete).

---

## Phase 4: User Story 2 - Existing 3-player games are unaffected (Priority: P2)

**Goal**: Guarantee the shipped 3-player game is byte-for-byte behaviorally identical (24-card deck, 3-card talon, 2 exchange passes, 3-card tricks, identical scoring). The implementing work is the Foundational spine; this phase locks it with explicit regression coverage.

**Independent Test**: Run the full existing 3-player suite unmodified; create and play a 3-player game end-to-end and confirm deck (24), talon (3), trick width (3), and scoring match current behavior.

- [x] T026 [US2] Regression gate: run `npm test`; confirm the full existing 3-player suite passes with **no edits to existing test expectations** (FR-006, SC-004).
- [x] T027 [P] [US2] Add a dedicated `tests/threeplayer-regression.test.js` asserting, via a headless round, that a 3-player game yields a 24-card deck, 3-card talon, exactly 2 exchange passes, 3-card tricks, and that the 24-card deck contains no 7/8 while `RANK_ORDER` preserves the 9→A relative trick-winner order (FR-006).
- [ ] T028 [US2] Manual 3-player regression walkthrough per `specs/008-four-player-variant/quickstart.md` §"3-player regression" (deal 7 + 3 talon, declarer 10→8 after 2 passes, 3-card tricks identical to today).

**Checkpoint**: 3-player parity proven both automatically and manually.

---

## Phase 5: User Story 3 - Choose player count and 4-seat presentation (Priority: P3)

**Goal**: Let a creator pick 3 or 4 players in the modal, show the correct required-count/progress, and render the 4-player table (self + three opponents incl. an across/top seat, up to 4 cards in the trick-centre, all players in scoreboard/final results).

**Independent Test**: Open the new-game modal, create a 4-player game, verify the waiting room shows "(4 needed to start)" and starts only when the 4th joins; in-game, three opponents and a 4-card trick-centre render correctly.

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL before implementation)

- [x] T029 [P] [US3] `tests/CardTable.fourplayer.test.js`: `slotsForSeat(viewerSeat, playerCount)` returns 4 distinct slots for `playerCount 4`, 3 for `playerCount 3` (FR-018).
- [x] T030 [P] [US3] `tests/GameScreen.fourplayer.test.js`: three opponent views render for 4-player seats; hand sizes, nicknames, and round-stats map correctly to each opponent seat (FR-018, FR-019).

### Implementation for User Story 3

- [x] T031 [US3] Replace the hidden player-count input with a 3/4 selector and make the subtitle + waiting-hint text player-count-aware in `src/public/index.html` (FR-001, FR-020).
- [x] T032 [US3] Read the selected player count (3|4) from the new selector instead of a fixed hidden input in `src/public/js/overlays/NewGameModal.js` (FR-001). (Depends on T031)
- [x] T033 [P] [US3] Verify the server-provided `requiredPlayers` renders "(N needed to start)" for 4 **and** that current join progress (e.g. "2 / 4 joined") renders from the joined count vs `requiredPlayers` in `src/public/js/screens/WaitingRoom.js` (FR-003).
- [x] T034 [US3] `slotsForSeat(viewerSeat, playerCount)`: self + clockwise opponents, adding a top/across slot for the 4th seat in `src/public/js/thousand/CardTable.js` (FR-018; Decision 9).
- [x] T035 [US3] Replace fixed `_leftOpponent`/`_rightOpponent` with a `seat → OpponentView` map built from `seats`; generalize `_opponentForSeat`/`_elForSeat`/`_applyOpponentHandSizes`/`_renderRoundStats`/`_setOpponentNicknames` over all opponent seats in `src/public/js/thousand/GameScreen.js` (FR-018, FR-019). (Depends on T034)
- [x] T036 [US3] Centre slots self + opponent seats (add across); collected-count map over `playerCount` in `src/public/js/thousand/TrickPlayView.js` (FR-018). (Depends on T034)
- [x] T037 [US3] Dest buttons over all opponent seats (not just left/right); generalized direction label in `src/public/js/thousand/CardExchangeView.js` (FR-011, FR-018).
- [x] T038 [P] [US3] Verify `OpponentView` is position-agnostic (one instance per opponent seat); no structural change expected, in `src/public/js/thousand/OpponentView.js` (FR-018).
- [x] T039 [P] [US3] "/2 cards passed" → "/(playerCount-1) cards passed" in `src/public/js/thousand/StatusBar.js` (FR-011, FR-020).
- [x] T040 [P] [US3] Verify the default `cumulativeScores` fallback no longer assumes 3 seats in `src/public/js/thousand/ScoreboardPanel.js` (FR-019).
- [x] T041 [P] [US3] Derive the table `colSpan` from the player count (not literal 9) in `src/public/js/thousand/FinalResultsScreen.js` (FR-019).
- [x] T042 [US3] Add the 4th (top/across) seat slot to the table grid + trick-centre and keep it responsive on mobile in `src/public/css/game.css` (FR-018, §VI, R-302). (Depends on T034)

**Checkpoint**: 4-player creation flow and table are fully visible and usable; T029–T030 pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: FR-004 cleanup, live e2e coverage, docs, and final verification.

- [x] T043 [P] Remove/replace outdated "3-player only / hardcoded count" comments in `src/controllers/validators.js` (FR-004).
- [x] T044 [P] Clear misleading "3-player as the only supported count / 4-player as a future feature" restriction notes in `specs/004` and `specs/005` historical docs without rewriting shipped spec history beyond those lines (FR-004).
- [x] T045 Generalize the live-e2e deck seam to the 32-card deck and add a 4-player variant (and `THOUSAND_STACK_DECK` four-nines / no-ace forcing) to `tests/e2e-live-smart.js` (R-304; quickstart §four-nines/crawl).
- [x] T046 Update `CLAUDE.md` Project Structure to note `src/services/Seats.js` and the `playerCount` parameter threaded through the engine.
- [x] T047 Run the FR-coverage check: confirm every FR-001…FR-020 has a matching `// per FR-NNN` test annotation (use the `fr-coverage-checker` agent).
- [x] T048 Final verification: `npm test && npm run lint`; confirm coverage stays ≥90% (SC-001…SC-005).
- [ ] T049 Manual quickstart.md validation: 4-player happy path, four-nines/crawl via deck seam, and the responsive narrow-viewport check of all four seats + 4-card trick-centre (SC-002, SC-003, §VI). NOTE: the **happy path is now verified end-to-end** by the live 4-player e2e (`E2E_HEADLESS=1 E2E_PLAYERS=4 node tests/e2e-live-smart.js` — full game to 1030) after fixing the `buildDealSequenceFor` deadlock (commit b9deb04). Remaining manual: four-nines/crawl via `THOUSAND_STACK_DECK` and the responsive narrow-viewport visual check.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**. Must end with the existing suite green (T011).
- **US1 (Phase 3)**: Depends on Foundational. Server-side 4-player MVP.
- **US2 (Phase 4)**: Depends on Foundational (its spine). Independently testable via the existing suite; does not depend on US1.
- **US3 (Phase 5)**: Depends on Foundational; consumes the `across` seat layout added in US1 (T025) for full 4-seat rendering. The selector/text tasks (T031–T033) are independent of US1.
- **Polish (Phase 6)**: Depends on all targeted user stories being complete.

### Within Each User Story

- Tests (T012–T018, T029–T030) are written first and must FAIL before implementation.
- Backend models/helpers before services before controllers/store.
- Story complete and its checkpoint validated before moving to the next priority.

### Parallel Opportunities

- Foundational: T002, T003, T004 are independent files → parallel. T005, T006, T007, T009 touch different files and can overlap once T002 lands; T008 needs T002+T003; T010 needs T002+T006+T007.
- US1 tests T012–T018 are all different files → fully parallel. T019 is parallel; T020/T024/T025 are sequential on their deps; T021→T022 sequential.
- US3 tests T029–T030 parallel; T033, T038, T039, T040, T041 are independent verifications/edits → parallel; T035/T036/T042 depend on T034.
- Polish: T043, T044 parallel.

---

## Parallel Example: User Story 1 tests

```bash
# Launch all US1 test files together (they fail first, then drive implementation):
Task: "tests/Deck.fourplayer.test.js — makeDeck(4)=32 incl 7/8; makeDeck(3)=24"
Task: "tests/DealSequencer.fourplayer.test.js — deal(4)=7/seat+4 talon=32; 3p unchanged"
Task: "tests/Scoring.fourplayer.test.js — 7/8=0 & never win; 4 seats; total=120; tiebreak"
Task: "tests/Game.fourplayer.test.js — 4-seat cumulative/barrel/zero; dealer %4"
Task: "tests/Round.fourplayer.test.js — full 4-player round; sell 3 opp; four-nines x4"
Task: "tests/round-messages.fourplayer.test.js — 4 joiners; seats.players=4; across; trick=4"
Task: "extend tests/validators.test.js — requiredPlayers accepts 3 and 4, rejects 2/5"
```

---

## Implementation Strategy

### MVP First (Foundational + User Story 1)

1. Phase 1 Setup → record the green baseline.
2. Phase 2 Foundational → generalize the engine with `playerCount` fixed at 3; **gate on the existing suite passing unmodified** (the safest possible base).
3. Phase 3 US1 → enable `makeDeck(4)`/`buildDealDistribution(4)`, validators, controller/store threading, deck seam, `across` layout.
4. **STOP and VALIDATE**: a 4-player game is fully playable headless (T012–T018 green); 3-player still green.

### Incremental Delivery

1. Foundational → engine ready, 3-player parity proven.
2. US1 → 4-player playable headless (MVP).
3. US2 → lock 3-player regression with explicit coverage.
4. US3 → player-count selector + visible 4-seat table → full demoable feature.
5. Polish → FR-004 cleanup, live e2e, docs, final verification.

---

## Notes

- [P] = different files, no dependency on an incomplete task.
- The Foundational spine is deliberately landed before any 4-player path goes live (plan delivery order; R-303) — this is what makes US2 a regression guarantee rather than a separate implementation.
- No new WS message *types*; only cardinality of `seats`/`currentTrick`/score maps changes.
- Commit after each task or logical group; verify tests fail before implementing.
