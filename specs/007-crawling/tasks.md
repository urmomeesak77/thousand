---
description: "Task list for Crawling"
---

# Tasks: Crawling

**Input**: Design documents from `/specs/007-crawling/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ws-messages.md, quickstart.md

**Tests**: INCLUDED. This repo is test-first (constitution Tech Stack §: ≥90% coverage; features 004/005/006 ship per-FR test suites). Each new test annotates the requirement it covers with an inline `// per FR-NNN` comment (the `fr-coverage-checker` convention).

**Organization**: Tasks are grouped by the three user stories from spec.md — US1 (ace-less declarer crawls, P1), US2 (declarer with an ace cannot crawl + decline, P1), US3 (crawl visible/auditable to all, P2). The whole feature is small and lands as one PR; the phases are an internal delivery order, not separate branches.

**Branch note**: work stays on `master` (kashka's standing no-new-branches rule). Spec dir is `007-crawling`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)

## Path Conventions

Single project: backend `src/services/`, `src/controllers/`; frontend `src/public/js/`; tests `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No project init (established repo) and no new rule constant — crawl introduces no numeric thresholds. The only shared primitives (eligibility helper + test-deck seam) are blocking prerequisites and live in Foundational below. No tasks in this phase.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure eligibility helper and the deterministic test-deck seam — both used by every user story's tests. ⚠️ MUST complete before US1/US2/US3.

- [ ] T001 [P] Write failing test `tests/Scoring.crawl.test.js` for `handHasAce(handCardIds, deck)`: returns `true` when the hand holds an ace of any suit, `false` for an ace-less hand; covers each suit's ace, an empty hand, and an 8-card post-exchange hand (`// per FR-001`)
- [ ] T002 Implement `handHasAce(handCardIds, deck)` (pure) in `src/services/Scoring.js` so T001 passes — returns `true` iff some `deck[id].rank === 'A'`; add to `module.exports` beside `findFourNinesSeat` (FR-001)
- [ ] T003 Add a `no-ace-declarer` mode to `Round._stackedDeckForTest` in `src/services/Round.js`: place all four aces on the two non-declarer seats and keep them out of the talon so the intended declarer holds no ace through talon pickup + exchange; inert in production (only when `THOUSAND_STACK_DECK` is set), mirroring the existing `four-nines` seam (research Decision 8)

**Checkpoint**: Eligibility helper is unit-tested; integration/e2e tests can force an ace-less declarer.

---

## Phase 3: User Story 1 — Ace-less Declarer Crawls the First Trick (Priority: P1) 🎯 MVP

**Goal**: When trick play begins and the declarer holds no ace, the declarer can crawl: commit any card face-down, each opponent commits a card face-down (follow-suit suspended), and on the third commit the trick is revealed and resolved by standard rules — the winner collects the three cards and leads trick 2; trick 2 onward plays normally.

**Independent Test**: Force an ace-less declarer (deck seam); the declarer crawls a card face-down, both opponents commit face-down, all three reveal simultaneously, the correct winner (highest led-suit card, no trump) collects the trick and leads trick 2, and trick 2 enforces follow-suit again.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [ ] T004 [P] [US1] Write failing test `tests/TrickPlay.crawl.test.js`: `beginCrawl()` sets `crawlActive` only on trick 1 with the declarer leading; `commitCrawlCard(hands, seat, cardId)` accepts any card (no follow-suit), removes it from hand, advances `currentTurnSeat`; the 3rd commit funnels the three commits into `currentTrick` and runs `_resolveTrick()` → correct winner by led suit with no trump, winner collects the three cards and leads trick 2; a subsequent trick-2 play via `playCard` re-enforces follow-suit (`// per FR-003`, `// per FR-004`, `// per FR-006`, `// per FR-007`, `// per FR-008`)
- [ ] T005 [P] [US1] Write failing test `tests/Round.crawl.test.js` (happy path): `Round.beginCrawl(seat)` / `Round.commitCrawlCard(seat, cardId)` delegate to `_trickPlay` and sync `trickNumber`, `currentTrickLeaderSeat`, `currentTurnSeat`, `currentTrick`, `collectedTricks`, `collectedTrickCounts`; an eligible ace-less declarer drives a full crawl that resolves into trick 2 (`// per FR-003`, `// per FR-006`, `// per FR-007`)
- [ ] T006 [P] [US1] Write failing integration test `tests/round-messages.crawl.test.js` via `ConnectionManager`: trick-play start with an ace-less declarer → declarer `crawl_commit` → `crawl_committed` (no faces) → two opponent `crawl_commit` → `crawl_revealed` carrying all three faces + `winnerSeat` and a `gameStatus` advanced to trick 2 (`// per FR-003`, `// per FR-004`, `// per FR-006`, `// per FR-007`)
- [ ] T007 [P] [US1] Write failing test `tests/CrawlControls.test.js`: declarer view renders a "Crawl / Lead normally" choice; opponent view renders a "commit a card face-down" prompt when it is their turn; buttons dispatch once; `destroy()` unbinds all Antlion inputs (no handler leak) (`// per FR-002`, `// per FR-003`, `// per FR-004`)

### Implementation for User Story 1

- [ ] T008 [US1] In `src/services/TrickPlay.js`: add `crawlActive` + `crawlCommits` fields; `beginCrawl()` (sets `crawlActive` on trick 1 / declarer leader, idempotent); `commitCrawlCard(hands, seat, cardId)` that skips `_checkFollowSuit`, removes the card, advances the turn, and on the 3rd commit pushes all commits into `currentTrick` and calls `_resolveTrick()`, returning `{ crawlResolved, commits, winnerSeat, committedSeats }`. If this pushes `TrickPlay.js` past the §IX guideline, extract the crawl sub-state into a `src/services/CrawlTrick.js` collaborator (R-201) (FR-003, FR-004, FR-006, FR-007, FR-008)
- [ ] T009 [US1] In `src/services/Round.js`: add `beginCrawl(seat)` and `commitCrawlCard(seat, cardId)` (phase must be `trick-play`; reject if `isPausedByDisconnect`) delegating to `_trickPlay`, with the same state-sync block as `playCard`; compute the declarer's no-ace eligibility via `handHasAce(this.hands[this.declarerSeat], this.deck)` for the `crawlAvailable` derivation (FR-001, FR-003, FR-006, FR-007)
- [ ] T010 [US1] In `src/controllers/RoundActionHandler.js`: add `handleCrawlCommit(playerId, cardId)` (bypass the shared 250 ms limiter like `handlePlayCard`); on each commit broadcast `crawl_committed { seat, committedSeats, gameStatus }` with **no** faces; on `crawlResolved` broadcast `crawl_revealed { commits, winnerSeat, gameStatus }` with the three faces and the trick-2 view-model (FR-003, FR-004, FR-006, FR-007)
- [ ] T011 [US1] In `src/services/ConnectionManager.js`: dispatch `crawl_commit` → `RoundActionHandler.handleCrawlCommit`; in `src/controllers/validators.js`: validate the `crawl_commit` shape (`{ cardId: integer }`) (FR-003)
- [ ] T012 [US1] In `src/services/RoundSnapshot.js` `buildViewModel`: add `crawlAvailable` (declarer-only derived flag), `crawlActive`, and `crawlCommittedSeats`; ensure `currentTrick` stays empty during the crawl so no faces leak; `legalCardIds` resolves to the full hand for the current committer (follow-suit suspended) (FR-004, FR-005 groundwork)
- [ ] T013 [US1] In `src/public/js/thousand/RoundActionDispatcher.js`: add the outbound `sendCrawlCommit(cardId)` wrapper (`{ type: 'crawl_commit', cardId }`) (FR-003)
- [ ] T014 [P] [US1] Create `src/public/js/thousand/CrawlControls.js` — declarer "Crawl / Lead normally" choice and opponent "commit a card face-down" prompt; buttons bound via `Antlion.bindInput`; `destroy()` unbinds (FR-002, FR-003, FR-004)
- [ ] T015 [US1] In `src/public/js/thousand/TrickPlayView.js`: when `crawlAvailable`/`crawlActive`, route hand-card clicks to `dispatcher.sendCrawlCommit` (crawl mode) instead of `sendPlayCard`; render face-down placeholders for `crawlCommittedSeats`; on `crawl_revealed`, flip the placeholders to their faces and reuse the existing collect-flight to `winnerSeat` (FR-003, FR-005, FR-006, FR-010)
- [ ] T016 [US1] In `src/public/js/core/ThousandMessageRouter.js`: validate + route `crawl_committed` → `app.onCrawlCommitted(m)` and `crawl_revealed` → `app.onCrawlRevealed(m)`; in `src/public/js/core/ThousandApp.js`: add those handlers feeding `TrickPlayView` (FR-003, FR-006)
- [ ] T017 [US1] In `src/public/js/thousand/GameScreenControls.js`: mount `CrawlControls` during the trick-1 crawl states (`crawlAvailable` or `crawlActive`) and unmount it once the crawl resolves or a normal lead is played (FR-002, FR-004)

**Checkpoint**: An ace-less declarer can crawl, opponents commit blind, the trick reveals and resolves correctly, and trick 2 plays normally — US1 is independently testable (T004–T007 green).

---

## Phase 4: User Story 2 — Declarer With An Ace Cannot Crawl (Priority: P1)

**Goal**: The crawl option is offered only to an ace-less declarer, and even then it is optional — an eligible declarer may decline and lead trick 1 face-up. A declarer holding any ace is never offered crawl and leads normally.

**Independent Test**: Force an ace-holding declarer → no crawl option appears and the declarer leads face-up. Force an ace-less declarer who chooses "Lead normally" → trick 1 proceeds as an ordinary face-up trick with standard follow-suit.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [ ] T018 [P] [US2] Write failing tests in `tests/Round.crawl.test.js` (eligibility/decline group): `crawlAvailable` is `false` for an ace-holding declarer and for opponents; `beginCrawl`/`commitCrawlCard` are rejected for a non-declarer, on the wrong turn, for an ace-holding declarer, and while `fourNinesAckPending` is true; a normal `play_card` first lead by an eligible declarer proceeds as an ordinary trick and leaves `crawlAvailable` false thereafter (`// per FR-002`, `// per FR-009`, `// per FR-011`)

### Implementation for User Story 2

- [ ] T019 [US2] In `src/services/Round.js` `beginCrawl`/`commitCrawlCard`: add rejection guards — reject when `seat !== declarerSeat`, when the declarer holds an ace (`handHasAce`), when `fourNinesAckPending` (reuse the four-nines guard reason "Acknowledge the four-nines bonus first"), or when it is not trick 1 with the declarer leading; confirm a normal `play_card` first lead (the decline path) is unaffected (FR-002, FR-009, FR-011)
- [ ] T020 [US2] In `src/services/RoundSnapshot.js`: make the `crawlAvailable` derivation `false` when the declarer holds an ace or while `fourNinesAckPending` is true (declarer-only, trick 1, leader) (FR-009, FR-011)
- [ ] T021 [US2] In `src/public/js/thousand/CrawlControls.js` + `TrickPlayView.js`: wire "Lead normally" to send a standard `play_card` (no crawl mode), and hide the crawl affordance entirely when `crawlAvailable` is false (FR-002, FR-009)

**Checkpoint**: Crawl is offered only to eligible declarers, the ace case never sees it, and the decline path works — US1 and US2 both function.

---

## Phase 5: User Story 3 — Crawl Is Visible and Auditable to All Players (Priority: P2)

**Goal**: All three clients consistently observe a crawl in progress (face-down placeholders, no faces), the same three faces and winner on reveal, and a reconnecting player sees the crawl in its current state with their own committed card preserved.

**Independent Test**: During a crawl, confirm no committed face appears in any message or view-model before the third commit and all clients show identical placeholders; on reveal all show the same faces and winner; a reconnect mid-crawl restores the crawl state with the viewer's own commit sticky.

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [ ] T022 [P] [US3] Add failing assertions in `tests/round-messages.crawl.test.js`: no `rank`/`suit` appears in any `crawl_committed` payload or in `gameStatus.currentTrick` before the third commit; all three faces appear only in `crawl_revealed`; every viewer receives the same `winnerSeat` (`// per FR-005`, `// per FR-010`)
- [ ] T023 [P] [US3] Add failing snapshot tests in `tests/Round.crawl.test.js`: a reconnect snapshot taken mid-crawl includes `crawlActive`, `crawlCommittedSeats`, and `viewerCrawlCommit` (the viewer's own committed card, sticky) and never includes other players' committed faces (`// per FR-012`)

### Implementation for User Story 3

- [ ] T024 [US3] In `src/services/RoundSnapshot.js` `buildSnapshot` (trick-play branch): add `crawlActive`, `crawlCommittedSeats`, `crawlAvailable` (declarer only), and `viewerCrawlCommit` (the reconnecting player's own committed card, sticky); never include other players' faces (FR-005, FR-010, FR-012)
- [ ] T025 [US3] In `src/services/RoundSnapshot.js` `buildViewModel`: add `viewerCrawlCommit` (self-only echo) so a committer can confirm their own face-down play without exposing it to others (FR-005, FR-012)
- [ ] T026 [US3] In `src/public/js/thousand/TrickPlayView.js`: render consistent face-down placeholders from `crawlCommittedSeats` on init/reconnect and restore the viewer's own committed placeholder from `viewerCrawlCommit` (FR-010, FR-012)

**Checkpoint**: The crawl is fully consistent across clients and survives reconnect — US1, US2, and US3 all work.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T027 [P] Run `npm run lint` and resolve any issues in the changed `src/` files (naming, comment style, ≤50-line functions per `docs/CODING_CONVENTIONS.md`)
- [ ] T028 Run `npm test` (and `npm run test:coverage`); confirm all new suites pass and coverage stays ≥90%; confirm every new test carries its `// per FR-NNN` annotation (run the `fr-coverage-checker` agent)
- [ ] T029 Execute the `specs/007-crawling/quickstart.md` 3-tab manual walkthrough with `THOUSAND_STACK_DECK=no-ace-declarer`, including the decline path and the reconnect-mid-crawl spot-check; optionally add a live e2e driver under `tests/` mirroring `tests/e2e-fournines.js`
- [ ] T030 [P] §IX size check on `src/services/TrickPlay.js` and `src/public/js/thousand/TrickPlayView.js` after the additions; if `TrickPlay.js` is over the guideline, finish extracting the crawl sub-state into `src/services/CrawlTrick.js` (R-201)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none (no tasks).
- **Foundational (Phase 2)**: `handHasAce` (T001/T002) and the deck seam (T003). BLOCKS US1/US2/US3.
- **US1 (Phase 3)**: depends on Foundational (uses `handHasAce` + the seam). Delivers the crawl mechanic end-to-end.
- **US2 (Phase 4)**: depends on US1's `crawlAvailable`/`beginCrawl`/`commitCrawlCard` plumbing; adds the negative guards and the decline path on top.
- **US3 (Phase 5)**: depends on US1's crawl state surface; adds the no-leak/reconnect visibility layer.
- **Polish (Phase 6)**: after US1–US3.

### Within Each Story

- Tests first (must FAIL), then implementation.
- Server state (`TrickPlay`/`Round`) before handler wiring (`RoundActionHandler`/`ConnectionManager`/`validators`) before frontend.
- Pure helpers before services before endpoints before UI.

### Parallel Opportunities

- Foundational: T001 (test) precedes T002 (impl); T003 is independent of both (different concern in `Round.js` — sequence T003 after T002 only if editing `Round.js` concurrently).
- US1 tests T004 ‖ T005 ‖ T006 ‖ T007 (different files). Frontend T014 (`CrawlControls.js`, new file) is [P] vs. the server impl tasks.
- US3 tests T022 ‖ T023 (assertions added to different existing files).
- Polish T027 ‖ T030.
- US1 → US2 → US3 are sequential (US2 and US3 build on US1's state); do US1 first.

---

## Parallel Example: User Story 1 tests

```bash
# Launch the four US1 test files together (they touch different files):
Task: "tests/TrickPlay.crawl.test.js — begin/commit/suspend follow-suit/resolve via _resolveTrick"
Task: "tests/Round.crawl.test.js — delegation + state sync + happy-path resolve"
Task: "tests/round-messages.crawl.test.js — end-to-end crawl_commit×3 → crawl_revealed → trick 2"
Task: "tests/CrawlControls.test.js — declarer choice + opponent prompt render/dispatch/no-leak"
```

---

## Implementation Strategy

### MVP (User Stories 1 + 2 — both P1)

1. Phase 2 Foundational → Phase 3 US1 → Phase 4 US2.
2. STOP and validate: force an ace-less declarer, confirm the crawl reveals/resolves correctly and trick 2 is normal; force an ace-holding declarer and confirm no crawl is offered; confirm the decline path leads normally.
3. This is a shippable, rule-correct increment of the crawl mechanic.

### Incremental delivery

4. Add US3 (visibility + reconnect) on top — view-model/snapshot surfacing over existing state.
5. Polish (lint, coverage, quickstart, §IX size check).

---

## Notes

- [P] = different files, no incomplete-task dependency.
- Each new test annotates its requirement with `// per FR-NNN`.
- Crawl commits live in `TrickPlay.crawlCommits`, never the face-exposing `currentTrick` view-model — faces ship only in `crawl_revealed` (R-202).
- Reuse `_resolveTrick`/`_determineWinner` for resolution — do NOT duplicate winner logic (research Decision 2).
- The crawl reuses feature 006's `fourNinesAckPending` guard, so the four-nines ack always precedes any crawl (FR-011, R-204).
- No scoring/summary/history changes — a crawled trick is an ordinary trick (research Decision 7).
- Commit after each logical group; stay on `master`.
