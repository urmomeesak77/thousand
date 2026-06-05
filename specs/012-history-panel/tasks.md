# Tasks: Game History Panel

**Input**: Design documents from `specs/012-history-panel/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/history-events.md, quickstart.md

**Tests**: INCLUDED. The constitution mandates ≥90% coverage and the quickstart specifies a TDD build order, so each new module has a test task written before its implementation.

**Organization**: Tasks are grouped by user story. The server-side history pipeline (log + recording + snapshot field) is shared infrastructure and lives in the Foundational phase because every story needs recorded data to be meaningful. The three user stories then layer the frontend panel: US1 renders the log, US2 adds collapse/persistence, US3 adds fixed-footprint scrolling.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 (Setup/Foundational/Polish have no story label)
- File paths are exact and repo-relative.

## Path Conventions

Web app, existing structure: backend `src/services/`, `src/controllers/`; frontend `src/public/js/thousand/`, `src/public/css/`; tests `tests/*.test.js` (Node built-in runner + jsdom).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Anchor points for the new feature. No new dependencies, no build step.

- [x] T001 [P] Add a `.history-panel` base style block (container shell + bottom-left anchor only) in `src/public/css/game.css`, leaving collapsed/scroll variants for US2/US3.

**Checkpoint**: A styled container slot exists for the panel to mount into.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-authoritative history pipeline — the log, its recording at every event site, and its exposure on the snapshot. Every user story depends on this producing data.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [x] T002 [P] Write `tests/GameHistory.test.js`: append order, monotonic `seq` (+1, never reused), uncapped retention, `toView()` returns a clone, and each `record*` shape per `data-model.md` / `contracts/history-events.md`. (Tests FIRST — must fail.)
- [x] T003 Create `src/services/GameHistory.js` — `GameHistory` class with `_entries`/`_seq`, append-only `recordBid/recordPass/recordMarriage/recordTrick/recordRoundScore/recordSpecial`, and `toView()`. One class per file; keep methods thin (Constitution VIII/IX). Make T002 pass.
- [x] T004 Own the log on the session: in `src/services/Game.js` constructor instantiate `this.actionHistory = new GameHistory()` (fresh per game). Add a `tests/Game.history.test.js` assertion that a new `Game` starts with an empty log.
- [x] T005 [P] Write `tests/history-recording.test.js`: driving auction/trick/round flows records exactly one entry per event (bid, pass, marriage, trick win, round-score) in resolution order, with `seq` strictly increasing, for both 3- and 4-player games (FR-017). (Tests FIRST — must fail.)
- [x] T006 Record auction events: in `src/controllers/RoundActionHandler.js` call `game.session.actionHistory.recordBid(seat, amount, roundNumber)` on an accepted bid and `recordPass(seat, roundNumber)` on a pass.
- [x] T007 Record marriage: in `src/controllers/TrickPlayActionHandler.js` / `src/services/RoundActionBroadcaster.js` (`_broadcastMarriage` site) call `recordMarriage(seat, suit, bonus, roundNumber)` once per declaration.
- [x] T008 Record trick wins: in `src/services/RoundActionBroadcaster.js` `broadcastPlayCardResults` call `recordTrick(winnerSeat, trickNumber, roundNumber)` when a trick resolves (use the `winnerSeat` from `_resolveTrick`).
- [x] T009 Record round scoring: in `src/services/RoundActionBroadcaster.js` `computeRoundEnd` call `recordRoundScore(roundNumber, perSeatDeltas, declarerSeat, bid)` from the built `summaryEntry`.
- [x] T010 Record special scoring: in `src/services/Game.js` call `actionHistory.recordSpecial('four-nines', seat, amount, roundNumber)` in `applyFourNinesBonus`, and `recordSpecial('barrel'|'zeros', seat, -SPECIAL_PENALTY, roundNumber)` in `applyRoundEnd` where each penalty fires. Make T005 pass.
- [x] T011 [P] Write `tests/RoundSnapshot.history.test.js`: `buildViewModel` includes `actionHistory`; it equals the session log; it is identical for every seat; it defaults to `[]` when no session/history exists (FR-018). (Tests FIRST — must fail.)
- [x] T012 Expose on snapshot: in `src/services/RoundSnapshot.js` `buildViewModel`, add `actionHistory: session?.actionHistory?.toView() ?? []`. Make T011 pass.

**Checkpoint**: The server records every event and ships the full, viewer-identical log on every snapshot. Verifiable via `npm test` with no frontend yet.

---

## Phase 3: User Story 1 - Follow the flow of the current game (Priority: P1) 🎯 MVP

**Goal**: A bottom-left panel shows a chronological, readable log of bids, passes, marriages, trick winners, and round scores.

**Independent Test**: Start a game vs bots; perform bids, a marriage, several tricks, and finish a round; confirm each appears as a readable row in the panel in occurrence order (spec US1 #1–4).

### Tests for User Story 1

- [x] T013 [P] [US1] Write `tests/historyEntryText.test.js`: formatter produces the expected string per `kind` (bid/pass/marriage/trick/round-score/four-nines/barrel/zeros), resolves seat→nickname from `seats`, falls back to a stable seat label when the name is unknown (FR-016), and renders suit symbols. (Tests FIRST — must fail.)
- [x] T014 [P] [US1] Write `tests/HistoryPanel.test.js` (jsdom): `render(actionHistory, seats)` mounts one row per entry in array order (newest last), row text comes from the formatter, and re-render reflects new entries (SC-001). (Tests FIRST — must fail.)

### Implementation for User Story 1

- [x] T015 [P] [US1] Create `src/public/js/thousand/historyEntryText.js` — pure `historyEntryText(entry, seats)` returning the display string; reuse `cardSymbols.js`/`SUIT_LETTER` for suits. Make T013 pass.
- [x] T016 [US1] Create `src/public/js/thousand/HistoryPanel.js` — `HistoryPanel` class `constructor(container, antlion)` and `render(actionHistory, seats)` that rebuilds an inner list of rows via `historyEntryText`. Mirror `ScoreboardPanel` structure (small private builders). Make T014 pass.
- [x] T017 [US1] Mount in `src/public/js/thousand/GameScreen.js`: create the panel container, `this._history = new HistoryPanel(container, antlion)`, and call `this._history.render(gameStatus.actionHistory ?? [], this._seats)` from `_renderStatus` (next to the existing `_scoreboard.render`).
- [x] T018 [US1] Flesh out `.history-panel` row/list styling in `src/public/css/game.css` (readable rows, theme-consistent) so entries render legibly.

**Checkpoint**: MVP — players see a live, ordered history of game events. STOP and validate against US1 acceptance scenarios.

---

## Phase 4: User Story 2 - Keep the history box out of the way (Priority: P2)

**Goal**: The panel can be collapsed/expanded; the choice persists across reloads; the initial state is responsive.

**Independent Test**: Toggle collapse → only a compact handle remains; expand → entries return; reload → the chosen state is restored; on a narrow viewport with no stored choice it defaults to collapsed (spec US2, FR-010/FR-010a).

### Tests for User Story 2

- [x] T019 [P] [US2] Extend `tests/HistoryPanel.test.js`: toggling collapse adds/removes the collapsed class and flips `aria-expanded`; the state is written to `localStorage` (`thousand_history_open`) and re-read on construction; with no stored value the default follows `window.innerWidth` vs the small-screen breakpoint. (Tests FIRST — must fail.)

### Implementation for User Story 2

- [x] T020 [US2] In `src/public/js/thousand/HistoryPanel.js`, add the collapse toggle: header + toggle button bound via `antlion.onInput('history-toggle', …)` + `antlion.bindInput` (Constitution XI), `_loadOpenState`/`_saveOpenState` against `localStorage` key `thousand_history_open` with a `window.innerWidth > SMALL_SCREEN_PX` default, mirroring `ScoreboardPanel`. Make T019 pass.
- [x] T021 [US2] Add `.history-panel--collapsed` styling and the responsive default media query in `src/public/css/game.css` (compact handle/label when collapsed; touch-sized toggle, Constitution VI).

**Checkpoint**: US1 + US2 both work — the log is present and the panel is collapsible with a persisted, responsive state.

---

## Phase 5: User Story 3 - Review a long history without losing the screen (Priority: P3)

**Goal**: Fixed-footprint panel showing ≥10 recent entries, inner scrollbar for older ones, auto-scrolled to the latest, with an empty state.

**Independent Test**: Generate >10 entries; the panel keeps fixed outer dimensions, shows a scrollbar, and the newest entry is visible by default; with 0 entries an empty-state row shows (spec US3, FR-011/FR-012/FR-013/FR-015, SC-004/SC-005).

### Tests for User Story 3

- [x] T022 [P] [US3] Extend `tests/HistoryPanel.test.js`: an empty `actionHistory` renders the empty-state row (FR-015); after render the inner scroll container is pinned to the bottom (`scrollTop === scrollHeight`, chat-style); the panel uses an inner scroll element (outer box class unchanged) so the footprint is fixed. (Tests FIRST — must fail.)

### Implementation for User Story 3

- [x] T023 [US3] In `src/public/js/thousand/HistoryPanel.js`, wrap rows in an inner scroll container, set `scroll.scrollTop = scroll.scrollHeight` after each render (newest-at-bottom auto-scroll, Q4=B), and render an empty-state row when `actionHistory` is empty. Make T022 pass.
- [x] T024 [US3] In `src/public/css/game.css`, give `.history-panel` body a fixed height (~10 rows) with `overflow-y: auto` so the box never grows and a scrollbar appears for overflow (FR-013).

**Checkpoint**: All three stories functional and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T025 [P] Run `npm run lint` and fix any violations in the new/changed files; cross-check against `docs/CODING_CONVENTIONS.md` (naming, ≤50-line functions, comment style).
- [x] T026 [P] Run `npm run test:coverage` and confirm new modules meet the ≥90% coverage bar; add unit cases for any uncovered branch.
- [ ] T027 Execute the `specs/012-history-panel/quickstart.md` manual verification (incl. two-browser/reconnect identical-history check, FR-018, and narrow-viewport default, FR-010a).
- [x] T028 [P] Update the Feature Status section of `CLAUDE.md` with a `012-history-panel` summary (server-authoritative `GameHistory` + `actionHistory` snapshot field + `HistoryPanel`).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories (no data otherwise).
- **User Stories (Phase 3–5)**: All depend on Foundational. US1 is the MVP; US2 and US3 build on the US1 panel and so run in priority order (they touch the same `HistoryPanel.js`, so not parallel to each other).
- **Polish (Phase 6)**: After the desired stories are complete.

### Within Each User Story

- Test tasks (Tests FIRST) precede implementation and must fail before code is written.
- Formatter (pure) before panel; panel before GameScreen mount; CSS alongside.

### Parallel Opportunities

- T001 is independent of Phase 2.
- In Phase 2, the test-authoring tasks T002, T005, T011 are [P] (different files). Implementation tasks T006–T010 touch distinct handler/service files and are largely independent, but all depend on T003 (the class) and T004 (session ownership).
- In US1, T013/T014 (tests) are [P]; T015 (formatter) is [P] vs T016 only until T016 imports it — implement T015 first.
- Polish T025/T026/T028 are [P].

---

## Parallel Example: Phase 2 test authoring

```bash
Task: "Write tests/GameHistory.test.js"          # T002
Task: "Write tests/history-recording.test.js"    # T005
Task: "Write tests/RoundSnapshot.history.test.js"# T011
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational (server pipeline, fully test-covered) → 3. Phase 3 US1 (panel renders the log) → **STOP & validate** against US1 acceptance scenarios → demo.

### Incremental Delivery

1. Setup + Foundational → server log verifiable via tests.
2. US1 → visible ordered history (MVP).
3. US2 → collapse + persisted, responsive state.
4. US3 → fixed-footprint scrolling + empty state.
   Each story adds value without breaking the previous.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- No new dependencies, no new WebSocket message type, no build step (Constitution I/III/V).
- All frontend timers/DOM events go through Antlion (Constitution XI); `HistoryPanel` reuses the proven `ScoreboardPanel` pattern.
- Commit after each task or logical group; verify tests fail before implementing.
- 28 tasks total.
