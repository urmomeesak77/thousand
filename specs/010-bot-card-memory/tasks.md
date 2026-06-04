# Tasks: Bot Card Memory

**Input**: Design documents from `/specs/010-bot-card-memory/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED. The constitution mandates ≥90% coverage, and FR-annotated tests
(`// per FR-NNN`) are the established project convention (see feature 009). Test tasks
are written before the implementation they cover.

**Organization**: Tasks are grouped by user story. Because the spec's stories are layered
(US2 and US3 build on US1's memory existing), the per-bot data plumbing is foundational,
US1 delivers the working memory→decision path (MVP), and US2/US3 add and verify the
forgetting fidelity and per-bot differentiation. Dependencies are called out explicitly.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (user-story phases only)
- Backend-only feature; all paths are under `src/services/` and `tests/`.

---

## Phase 1: Setup

**Purpose**: Create the one new source file so dependent work and tests can import it.

- [ ] T001 [P] Create `BotMemory` skeleton (class `BotMemory` with constructor storing `memorySkill`/`memorySeed` and a `recalledGoneCardIds()` stub returning an empty `Set`) in src/services/bots/BotMemory.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared "cards already gone" timeline and per-bot memory traits that every
user story depends on. No story work can begin until this phase is complete.

**⚠️ CRITICAL**: Blocks US1, US2, and US3.

- [ ] T002 [P] Write `TrickPlay.playedLog` tests — every played card logged once with correct `trickNumber`, including the crawl path, no duplicates (per FR-003; contract played-log.md P1–P3) in tests/TrickPlay.playedLog.test.js
- [ ] T003 Add `playedLog` to `TrickPlay`: init `this.playedLog = []` in the constructor and push `{ cardId, trickNumber: this.trickNumber }` after the hand filter in both `playCard` and `commitCrawlCard` (per FR-003) in src/services/TrickPlay.js
- [ ] T004 Mirror `playedLog` on `Round`: init `this.playedLog = []` in the constructor, set `this._trickPlay.playedLog = this.playedLog` in the rehydrate block and `this.playedLog = this._trickPlay.playedLog` in the sync-back block (per FR-003; depends on T003) in src/services/Round.js
- [ ] T005 [P] Add per-bot memory traits to `createBot`: `memorySkill = Math.random()` and `memorySeed = crypto.randomInt(...)`, alongside `aggressiveness` (per FR-009, FR-010) in src/services/PlayerRegistry.js

**Checkpoint**: Played-card history is recorded per round and bots carry independent memory traits.

---

## Phase 3: User Story 1 - Bots play using what they remember is gone (Priority: P1) 🎯 MVP

**Goal**: A bot consults its recalled set of gone cards and cashes "boss" cards nothing
left in play can beat, so it plays more believably. With no memory supplied, behaviour is
identical to feature 009.

**Independent Test**: Give a bot a (strong) recalled-gone set in which every higher card
of a suit is gone, and confirm it leads/cashes the now-unbeatable card; with an empty
`knowledge` set, confirm its decision is byte-identical to the current 009 output.

### Tests for User Story 1

- [ ] T006 [P] [US1] `BotMemory` core recall tests — `kernel[0] === 1`, kernel monotonically non-increasing, determinism for identical (seed, inputs), empty `playedLog` ⇒ empty Set, age-0 records excluded (per FR-004, FR-005, FR-006, FR-008; contract bot-memory-api.md C1–C5) in tests/BotMemory.test.js
- [ ] T007 [P] [US1] `isBossCard` truth-table tests — trump-aware, covering higher cards that are gone / in-hand / on-table; forgotten higher card ⇒ not a boss (per FR-013; contract strategy-memory-integration.md H1–H3) in tests/botStrategyHelpers.boss.test.js
- [ ] T008 [P] [US1] `BotStrategy` integration tests — with knowledge the bot cashes a boss card; with default empty `knowledge` the decision equals the 009 output; strategy never reads `round.playedLog` directly (per FR-012, FR-014; contract S1–S2) in tests/BotStrategy.memory.test.js

### Implementation for User Story 1

- [ ] T009 [US1] Implement `BotMemory`: module-private `recallKernel(memorySkill, maxAge)` (first-order low-pass via the Fourier formula, `kernel[0]=1`, monotonic), `recallDraw(memorySeed, roundKey, cardId)` (deterministic [0,1)), and `recalledGoneCardIds(playedLog, currentTrickNumber, roundKey)` returning past-trick (age ≥ 1) cardIds where draw < kernel[age] (per FR-001, FR-002, FR-004, FR-005, FR-006, FR-008, FR-011) in src/services/bots/BotMemory.js
- [ ] T010 [P] [US1] Add pure `isBossCard(card, { goneCardIds, hand, currentTrick }, trump)` (plus any small `remainingBeaters` helper), reusing the existing `cardBeats` ordering (per FR-013) in src/services/bots/botStrategyHelpers.js
- [ ] T011 [US1] Extend `BotStrategy.decide(round, seat, aggressiveness, knowledge = { goneCardIds: new Set() })`; in `_declarerLead`/`_declarerFollow` and the opponent lead/follow paths, prefer the highest-point identifiable boss card before the existing fallback, never spending a reserved marriage card, only reordering already-legal moves (per FR-012, FR-013, FR-014; depends on T010) in src/services/bots/BotStrategy.js
- [ ] T012 [US1] Wire `BotTurnDriver._decisionFor` to build the recalled-gone set via `new BotMemory(player.memorySkill, player.memorySeed).recalledGoneCardIds(game.round.playedLog, game.round.trickNumber, roundKey)` and pass it as `knowledge` to `BotStrategy.decide` (only during trick-play; empty set otherwise) (per FR-001, FR-012; depends on T009, T011) in src/services/bots/BotTurnDriver.js

**Checkpoint**: Bots make memory-informed decisions end-to-end; existing 009 behaviour is preserved when no memory applies.

---

## Phase 4: User Story 2 - Memory fades over the round, so bots are imperfect (Priority: P2)

**Goal**: Recall decays with card age so bots forget older cards and occasionally misjudge
— never omniscient. Depends on US1's `BotMemory`/integration.

**Independent Test**: Replay one play history; confirm a card from the last trick is
recalled while a card played several tricks earlier has a meaningful chance of being
forgotten, and that a forgotten boss card produces a fallback ("mistake") play.

### Tests for User Story 2

- [ ] T013 [P] [US2] Decay tests — a recent card (age 1) recalled at max skill 100%; a low-skill bot's recall of a card aged ≥ 4 falls below 50%; non-zero forgetting exists for any skill < max; monotonic (once forgotten, stays forgotten) (per FR-006, FR-007; SC-002) in tests/BotMemory.test.js
- [ ] T014 [P] [US2] "Memory mistake" integration test — a forgotten boss card makes the bot play as if it were still live (fallback), and a forgetting-enabled bot commits measurably more such mistakes than a perfect-memory baseline over many simulated decisions (per FR-013; SC-004) in tests/BotStrategy.memory.test.js

### Implementation for User Story 2

- [ ] T015 [US2] Tune the `recallKernel` cutoff mapping and the recall threshold so FR-007 (non-zero forgetting below max skill) and SC-002/SC-004 hold; if numeric constants emerge, name them as module constants in BotMemory.js (per FR-007; SC-002, SC-004) in src/services/bots/BotMemory.js

**Checkpoint**: Forgetting is observable and bounded; bots are beatable, not perfect.

---

## Phase 5: User Story 3 - Each bot has its own memory skill (Priority: P3)

**Goal**: Different bots at one table recall differently because `memorySkill` parameterizes
the same formula. Depends on US1 (the formula) and the foundational trait assignment.

**Independent Test**: Seat two bots with clearly different `memorySkill`, feed an identical
play history, and confirm their recalled-card sets differ in the expected direction.

### Tests for User Story 3

- [ ] T016 [P] [US3] Skill-ordering and divergence tests — for a fixed seed/age, higher `memorySkill` recall ⊇ lower-skill recall; two bots with different skills on one history produce different recalled sets; `memorySkill` alone moves recall across the spectrum (per FR-010, FR-011; SC-003, SC-005) in tests/BotMemory.test.js

### Implementation for User Story 3

- [ ] T017 [US3] Confirm/adjust the `memorySkill → kernel cutoff` mapping so higher skill yields strictly stronger, longer recall and each bot's memory is independent (no shared state across `BotMemory` instances) (per FR-010, FR-011; SC-003, SC-005) in src/services/bots/BotMemory.js

**Checkpoint**: All three stories independently testable; bots feel distinct.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Run the full test suite incl. the feature-009 bot tests to confirm no game-rule or behavioural regression (per FR-014) — `npm test`
- [ ] T019 [P] Performance assertion — `recalledGoneCardIds` for a full 32-card log completes in ≤ 50 ms per decision (per SC-006) in tests/BotMemory.test.js
- [ ] T020 [P] Run ESLint and check against docs/CODING_CONVENTIONS.md (function ≤ ~20 lines §IX, one class per file §VIII) — `npm run lint`
- [ ] T021 Verify ≥ 90% coverage on the new/changed `src/services/bots/` and `playedLog` code — `npm run test:coverage`
- [ ] T022 Run quickstart.md verification (deterministic snippet + optional live game)
- [ ] T023 FR-coverage audit — confirm every FR-001…FR-015 has a matching `// per FR-NNN` test annotation (fr-coverage-checker)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately.
- **Foundational (Phase 2)**: after Setup — BLOCKS all user stories.
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: after US1 (uses `BotMemory` + the boss-card integration).
- **US3 (Phase 5)**: after US1 (uses the `memorySkill`-parameterized kernel). Independent of US2.
- **Polish (Phase 6)**: after all desired stories.

### Key task dependencies

- T004 depends on T003 (Round mirrors TrickPlay).
- T011 depends on T010 (`isBossCard` before strategy uses it).
- T012 depends on T009 + T011 (driver wires memory into the strategy).
- T013–T017 depend on T009 (the `BotMemory` implementation).

### Parallel Opportunities

- T002, T003, T005 touch different files and can run in parallel; T004 waits on T003.
- US1 tests T006, T007, T008 are three different files — fully parallel.
- US1 impl T009 and T010 are different files — parallel; then T011, then T012.
- Polish T018, T019, T020 run in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (different files — run together):
Task: "BotMemory core recall tests in tests/BotMemory.test.js"
Task: "isBossCard truth-table tests in tests/botStrategyHelpers.boss.test.js"
Task: "BotStrategy integration tests in tests/BotStrategy.memory.test.js"

# Then implementation (T009 and T010 in parallel, then T011, then T012):
Task: "Implement BotMemory in src/services/bots/BotMemory.js"
Task: "Implement isBossCard in src/services/bots/botStrategyHelpers.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (played log + traits).
2. Phase 3 US1 (BotMemory + boss-card integration + driver wiring).
3. **STOP and VALIDATE**: bots play memory-informed moves; 009 tests stay green.

### Incremental Delivery

1. Foundational → US1 (MVP: memory influences play).
2. US2 → forgetting fidelity is observable and bounded.
3. US3 → per-bot differentiation.
4. Polish → coverage, lint, perf, FR audit, regression.

---

## Notes

- [P] = different files, no dependency on an incomplete task.
- Backward compatibility (S1) is a hard gate: empty `knowledge` ⇒ identical 009 decisions.
- The Fourier recall model is the user-mandated mechanism (FR-004); see research.md §1 for the low-pass↔forgetting-curve equivalence.
- No WebSocket/HTTP contract or frontend changes — engine-internal, server-side only.
- Commit after each task or logical group; do not create a branch (work continues on `009-ai-opponents`).
