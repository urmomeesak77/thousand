---
description: "Task list for AI Opponents (Bots)"
---

# Tasks: AI Opponents (Bots)

**Input**: Design documents from `specs/009-ai-opponents/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the constitution mandates ≥90% coverage and the plan calls out specific
test files. Test tasks precede the implementation they cover (write failing test first).

**Organization**: Grouped by user story (US1 P1, US2 P2, US3 P3) for independent delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish carry no story label)
- Exact file paths are given in each task.

## Path Conventions

Web app (constitution layout): backend `src/`, frontend `src/public/js/`, tests `tests/*.test.js`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Leaf modules with no dependencies, used by later phases.

- [x] T001 [P] Create themed bot-name pool + unique-name picker in `src/services/bots/botNames.js` (e.g. `Robo-Ada`, `Robo-Max`, …; picker takes already-used names and returns an unused one)
- [x] T002 [P] Create bot numeric constants in `src/services/bots/botConstants.js` (`MAX_TALON_GAMBLE ≈ 30`; re-export or reference `MIN_BID`/`MAX_BID`/`BID_STEP` for server-side use per data-model.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The "bot is a socketless player" primitive + teardown purge. Every user story depends on this.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T003 [P] Unit test for the bot player record in `tests/PlayerRegistry.bots.test.js`: `createBot` yields `{ isBot:true, sockets:empty, sessionToken:null, aggressiveness∈[0,1] }`, is NOT in the token index, and `serializePlayers` includes `isBot` for every entry (per FR-001, FR-012, FR-016)
- [x] T004 Implement `PlayerRegistry.createBot(nickname)` (isBot, empty `sockets`, null token, `aggressiveness:Math.random()`) and add `isBot` to `serializePlayers` output in `src/services/PlayerRegistry.js` (per FR-001, FR-012, FR-016)
- [x] T005 [P] Unit test for bot purge on teardown in `tests/ThousandStore.bots-teardown.test.js`: deleting/disbanding/cleaning a game removes its bot records from the registry (no leak) (per FR-014)
- [x] T006 Add `_purgeBots(game)` to `src/services/ThousandStore.js` (remove each bot id via `PlayerRegistry.remove`) and call it from `_deleteGame`, `_disbandGame`, and `_cleanupRound` (per FR-014)

**Checkpoint**: A bot can exist as a seated, socketless player and is always purged on teardown.

---

## Phase 3: User Story 1 — Fill empty seats to start a short-handed table (Priority: P1) 🎯 MVP

**Goal**: The host adds bots to empty seats; filling the table auto-starts the round.

**Independent Test**: As the only human, create a 3-player game, add 2 bots, and confirm the
game transitions to `in-progress` and the round is dealt (per spec US1 Independent Test).

- [x] T007 [P] [US1] Test add-bot guards in `tests/GameController.addbot.test.js`: 404 unknown game, 403 non-host, 409 already-started, 409 full; 201 `{botId,nickname}` on success (per FR-001, FR-003, FR-005)
- [x] T008 [P] [US1] Test auto-start in `tests/ThousandStore.addbot.test.js`: adding the bot that fills the table calls `startRound` and the game becomes `in-progress`; `player_joined` carries `isBot` (per FR-004)
- [x] T009 [US1] Implement `ThousandStore.addBot(gameId, requesterId)` in `src/services/ThousandStore.js`: create bot via `createBot`, set `gameId`, add to `game.players`, broadcast `player_joined` (refreshed `players` incl. `isBot`) to existing players, `broadcastLobbyUpdate()`, and call `startRound(gameId)` when `players.size === requiredPlayers` (per FR-001, FR-004)
- [x] T010 [US1] Implement `GameController.handleAddBot(req, res, player, gameId)` in `src/controllers/GameController.js`: host-only + waiting + not-full preconditions (statuses per `contracts/http-bot-management.md`), then delegate to `store.addBot`; respond `201 { botId, nickname }` (per FR-001, FR-003, FR-005)
- [x] T011 [US1] Add route `POST /api/games/:id/bots` → `handleAddBot` in `src/controllers/RequestHandler.js` (per FR-001)
- [x] T012 [P] [US1] Add `addBot(gameId)` to `src/public/js/network/GameApi.js` (per FR-001)
- [x] T013 [US1] Add a host-only **Add Bot** button to `src/public/js/screens/WaitingRoom.js`, bound via `Antlion.bindInput` (no raw DOM listener, per constitution §XI), and wire the action through `src/public/js/core/LobbyBinder.js` / `ThousandApp.js` to `GameApi.addBot` (per FR-001, FR-005)
- [x] T014 [P] [US1] Style the Add Bot button (responsive, finger-sized touch target) in `src/public/css/index.css` (per constitution §VI)

**Checkpoint**: A single human can fill a table with bots and the round starts & deals. (Bots
do not yet act — that is US2.)

---

## Phase 4: User Story 2 — Bots play the full game loop autonomously (Priority: P2)

**Goal**: Each bot takes its own turns (bid/pass with aggressiveness, exchange, trick play,
acks, marriages, continue) after a 1–3 s delay, always legally, scored like a human.

**Independent Test**: Start a game with bots in every non-host seat; with zero human input the
bots advance every phase and the round completes with valid scores (per spec US2 Independent Test).

- [x] T015 [P] [US2] Test pure helpers in `tests/botStrategyHelpers.test.js`: `rankStrength`, `cardBeats`, `bestCenterCard`, `estimateMakeable`, `findMarriages`, `pickCard` (ported from `tests/e2e-live-smart.js`) (per FR-007, FR-008)
- [x] T016 [P] [US2] Test `BotStrategy` in `tests/BotStrategy.test.js`: `decideBid` is monotonic non-decreasing in `aggressiveness` and `bid ≤ roundDownToStep(safe + MAX_TALON_GAMBLE, BID_STEP)`; per-phase deciders only ever return actions whose card/amount is legal for the given round state; non-declarer dumps lowest legal; declarer leads/follows per strategy (per FR-007, FR-008, FR-016, FR-017, SC-007)
- [x] T017 [US2] Create `src/services/bots/botStrategyHelpers.js` — port the pure card-evaluation functions from `tests/e2e-live-smart.js` to operate on `{cardId,rank,suit}` data (no DOM) (per FR-007, FR-008)
- [x] T018 [US2] Create `src/services/bots/BotStrategy.js` — `decide(round, seat)` returning a Bot Decision (data-model.md): `decideBid(hand, aggressiveness, floor)` (safe estimate + gamble, clamped), exchange pass, trick lead/follow, marriage-declare-when-offered, four-nines ack, continue, sell-pass, decline-crawl; reads authoritative round state (`hands`, `legalCardIds`, `currentTrick`, `currentTrumpSuit`, `trickNumber`, `declarerSeat`) (depends on T017, T002) (per FR-006, FR-007, FR-008, FR-016, FR-017)
- [x] T019 [P] [US2] Test `BotTurnDriver` in `tests/BotTurnDriver.test.js`: schedules a randomized ~1–3 s timer only for a bot with a pending obligation; on fire executes exactly one action via a stub `RoundActionHandler`, re-reads state at fire time, debounces double-schedules, and clears timers on teardown (per FR-006, FR-009, FR-015)
- [x] T020 [US2] Create `src/services/bots/BotTurnDriver.js` — `onStateChanged(game)` finds bot seats with a pending obligation (table in research.md Decision 4), schedules `setTimeout(1000 + random*2000)` (`.unref()`), and on fire calls the mapped `RoundActionHandler` method (`contracts/bot-action-mapping.md`) with the bot's playerId; one pending timer per `(gameId, botId)`; `clearForGame(gameId)` for teardown (depends on T018) (per FR-006, FR-007, FR-009, FR-015)
- [x] T021 [US2] Wire the driver in `src/services/ThousandStore.js`: own a `BotTurnDriver`, expose `notifyTurnAdvanced(game)`, call it at the tail of `startRound`; call it from `src/controllers/RoundActionHandler.js` (`_runRoundAction` tail), `src/controllers/TrickPlayActionHandler.js` (action tails), and `src/services/RoundActionBroadcaster.js` (`startAndBroadcastNextRound`); call `driver.clearForGame` in `_deleteGame`/`_disbandGame`/`_cleanupRound` (per FR-006, FR-009, FR-015)
- [x] T022 [US2] Integration test in `tests/bots-autoplay.integration.test.js`: one human + bots fill a 3-player table; drive timers (fake/advanced) and assert the round advances bidding → exchange → trick-play → round-summary with no human input and produces valid scores (per FR-006, FR-007, FR-010, SC-001)

**Checkpoint**: A single human can play a full game to completion against bots (3- and 4-player).

---

## Phase 5: User Story 3 — Manage & label bots in the waiting room (Priority: P3)

**Goal**: Host removes a bot to free a seat; bots are clearly badged and individually named;
non-hosts cannot manage composition; a table with no human left is cleaned up.

**Independent Test**: In a waiting room with a bot, the host removes it and the seat frees; a
non-host sees badges but no controls (per spec US3 Independent Test).

- [x] T023 [P] [US3] Test remove-bot in `tests/GameController.removebot.test.js`: 404 unknown game/bot, 403 non-host, 409 already-started, 200 + seat freed + `player_left` broadcast (per FR-002, FR-005)
- [x] T024 [P] [US3] Test no-human cleanup in `tests/ThousandStore.no-human.test.js`: when the last human leaves a table that still has bots, the in-progress round is aborted (if any), the game is deleted, and all its bot records are purged (per FR-014)
- [x] T025 [US3] Implement `ThousandStore.removeBot(gameId, requesterId, botId)` in `src/services/ThousandStore.js`: validate it is a bot in the game, remove from `game.players`, `PlayerRegistry.remove(botId)`, broadcast `player_left` with refreshed `players`, `broadcastLobbyUpdate()` (per FR-002)
- [x] T026 [US3] Update `leaveGame`/`_resolveGameAfterExit` in `src/services/ThousandStore.js` to count **humans**: when no human remains (bots only), abort any round, delete the game, and purge bots — instead of the current `players.size === 0` check (per FR-014, FR-015)
- [x] T027 [US3] Implement `GameController.handleRemoveBot(req, res, player, gameId, botId)` in `src/controllers/GameController.js` with preconditions per `contracts/http-bot-management.md` (per FR-002, FR-005)
- [x] T028 [US3] Add route `DELETE /api/games/:id/bots/:botId` → `handleRemoveBot` in `src/controllers/RequestHandler.js` (per FR-002)
- [x] T029 [P] [US3] Add `removeBot(gameId, botId)` to `src/public/js/network/GameApi.js` (per FR-002)
- [x] T030 [US3] Update `src/public/js/screens/WaitingRoom.js`: render each bot seat with the themed name + a bot badge; show a host-only per-bot **Remove** control (Antlion-bound); hide all bot-management controls for non-hosts (per FR-002, FR-005, FR-012, FR-013)
- [x] T031 [P] [US3] Style the bot badge + remove control (responsive, touch targets) in `src/public/css/index.css` (per FR-012, constitution §VI)
- [x] T032 [P] [US3] Show the bot badge on in-game seat labels where seat names render (e.g. `src/public/js/thousand/` seat/status views), driven by the serialized `isBot` (per FR-012)

**Checkpoint**: All three stories are independently functional; tables never linger bot-only.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T033 [P] Audit `// per FR-NNN` annotations across new tests; confirm every FR-001…FR-017 has a covering test
- [ ] T034 [P] Update `CLAUDE.md` project structure with the `src/services/bots/` modules (BotStrategy, BotTurnDriver, botStrategyHelpers, botNames, botConstants)
- [ ] T035 Run `npm run lint` and `npm test`; confirm clean lint and ≥90% coverage on new files (`npm run test:coverage`)
- [ ] T036 Manual `quickstart.md` validation: 3-player & 4-player happy path, manage/remove bots, and the edge cases (last human leaves, host leaves, paused-for-disconnect)
- [ ] T037 [P] (Optional) Headless single-client bot e2e in `tests/e2e-bots-single-client.js`: create a game with one real client, fill remaining seats via `POST /api/games/:id/bots`, assert the game reaches final results — exercises the real server-side bot loop end-to-end (per SC-001, SC-003)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**.
- **US1 (Phase 3)**: depends on Foundational. Delivers the MVP (fill & start).
- **US2 (Phase 4)**: depends on Foundational; independently testable. Builds on the bot
  primitive; does not require US1's HTTP/UI (tests can seat bots directly), but in practice US1
  is the way a human reaches a US2 game.
- **US3 (Phase 5)**: depends on Foundational; independently testable. Shares files with US1
  (`ThousandStore`, `GameController`, `RequestHandler`, `GameApi`, `WaitingRoom`, `index.css`).
- **Polish (Phase 6)**: after the desired stories are complete.

### Within each story

- Test task(s) first (write failing), then implementation.
- Models/primitives → services → endpoints → client.

### Key sequential constraints (shared files)

- T004 before T006/T009/T025/T026 (all read the registry / store primitive).
- T018 before T020 before T021 (strategy → driver → wiring).
- T009/T025/T026 all edit `src/services/ThousandStore.js` → keep sequential (not [P]).
- T010/T027 both edit `GameController.js`; T011/T028 both edit `RequestHandler.js`;
  T013/T030 both edit `WaitingRoom.js`; T012/T029 both edit `GameApi.js`;
  T014/T031 both edit `index.css` → within those pairs, do not run [P] together across stories.

### Parallel opportunities

- Setup: T001, T002 together.
- Foundational tests: T003, T005 together (then their impls T004, T006).
- US1 tests T007, T008 together; client method T012 parallel with server work.
- US2 tests T015, T016, T019 together; helpers (T017) parallel with the bid-test authoring.
- US3 tests T023, T024 together; styling T031 / in-game label T032 parallel with logic.

---

## Parallel Example: User Story 2

```bash
# Author the failing tests together:
Task: "botStrategyHelpers pure-function tests in tests/botStrategyHelpers.test.js"
Task: "BotStrategy decideBid monotonicity/bound + per-phase legality in tests/BotStrategy.test.js"
Task: "BotTurnDriver scheduling/execute-once/teardown in tests/BotTurnDriver.test.js"

# Then implement in dependency order:
#   botStrategyHelpers.js → BotStrategy.js → BotTurnDriver.js → wire into store/handlers
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1.
4. **STOP & VALIDATE**: host fills a table with bots → round starts & deals. Demo the
   "start without a full set of humans" value even before bots can play.

### Incremental delivery

- **US1** → tables start short-handed (MVP).
- **US2** → those bots actually play full games to victory (the real payoff).
- **US3** → manage/label bots and guarantee no bot-only tables linger.

### FR coverage map

- US1: FR-001, FR-003, FR-004, FR-005
- US2: FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-016, FR-017
- US3: FR-002, FR-012, FR-013, FR-014, FR-015
- (FR-011 3/4-player applies across US2 trick play; verify both variants in T022/T036.)

---

## Notes

- Bots are **server-side** — their timers use plain Node `setTimeout` (`.unref()`), not Antlion
  (§XI governs frontend only). New client buttons DO go through `Antlion.bindInput`.
- Route bot actions through the existing `RoundActionHandler` (legality + broadcast for free).
- Keep new classes ≤100 lines and functions ≤~20 lines (constitution §IX) — decompose
  `BotStrategy` into per-phase deciders + pure helpers.
- Commit after each task or logical group; stop at any checkpoint to validate a story.
