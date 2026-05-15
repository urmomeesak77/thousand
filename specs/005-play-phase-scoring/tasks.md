---

description: "Task list for feature 005 — Play Phase, Scoring, Multi-Round & Victory"
---

# Tasks: Play Phase, Scoring, Multi-Round & Victory

**Input**: Design documents from `/specs/005-play-phase-scoring/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ws-messages.md, quickstart.md

**Tests**: Test tasks are included — the plan and quickstart explicitly enumerate the test files for this feature.

**Organization**: Tasks are grouped by user story (P1 → P4) to enable independent implementation and testing. Each phase corresponds to one merge-ready PR per plan.md "Implementation Phases (delivery order)".

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- Backend services: `src/services/`
- Backend controllers: `src/controllers/`
- Frontend modules: `src/public/js/thousand/` (game-specific) and `src/public/js/core/`
- Tests: `tests/`
- CSS: `src/public/css/index.css`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm baseline before touching any feature files.

- [ ] T001 Run `npm test` and `npm run lint` on the current branch (`005-play-phase-scoring`) to confirm a clean baseline before changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared constants and phase-enum extensions that every user story below depends on. These MUST land before any US phase.

- [ ] T002 [P] Add `CARD_POINT_VALUE` (A=11, 10=10, K=4, Q=3, J=2, 9=0), `MARRIAGE_BONUS` (♣=100, ♠=80, ♥=60, ♦=40), and `RANK_ORDER` ({'9':0,'J':1,'Q':2,'K':3,'10':4,'A':5}) constants to `src/public/js/thousand/constants.js` (client-side) per FR-008 / FR-013 / Decision 4
- [ ] T003 [P] Add server-side `CARD_POINT_VALUE`, `MARRIAGE_BONUS`, `RANK_ORDER` constants exported from `src/services/Scoring.js` (new file scaffold — pure-function module; method bodies filled in US1/US2/US3) per Decision 3 / Decision 4
- [ ] T004 Extend the `Round.phase` enum in `src/services/Round.js` with `'card-exchange'`, `'trick-play'`, `'round-summary'` per data-model.md state machine
- [ ] T005 [P] Add the new phase-label cases (`'Card exchange'`, `'Trick play'`, `'Round complete'`, `'Game over'`, `'Game aborted'`) to the status-text helper in `src/public/js/thousand/statusText.js` per FR-018

**Checkpoint**: Constants and phase strings exist on both sides. User stories can now begin.

---

## Phase 3: User Story 1 — Card Exchange, Trick Play, Round Summary (Priority: P1) 🎯 MVP

**Goal**: Replace feature 004's "Round ready to play" handoff with the end-to-end gameplay loop for a single round — declarer exchange → 8-trick play (no trump, no marriages) → made/missed summary → Back to Lobby.

**Independent Test**: From a state where bidding has just finalized a declarer at bid 100 (no marriages), the declarer is presented with their 10-card hand and prompted to pass one card to each opponent. After the exchange, each of the three players holds 8 cards. The declarer leads trick 1; each subsequent trick is led by the previous trick's winner. After trick 8, every client shows the round summary with each player's trick points, the declarer's made/missed indicator, and a single Back to Lobby button.

### Tests for User Story 1

> Per the constitution's TDD posture, write the test that defines the contract first, then make it pass.

- [ ] T006 [P] [US1] Write `tests/Scoring.test.js` covering FR-013 card-point totals and FR-014 declarer made/missed + opponent deltas (penalties param accepted but unused yet)
- [ ] T007 [P] [US1] Write `tests/Round.cardexchange.test.js` covering FR-002 / FR-003 pass validation, final-on-commit, second-pass destination restriction
- [ ] T008 [P] [US1] Write `tests/Round.trickplay.test.js` covering FR-006 / FR-007 follow-suit and FR-008 winner determination — include a table-driven "Ten beats King and Queen, Ace beats Ten" check per R-003
- [ ] T009 [P] [US1] Write `tests/CardExchangeView.test.js` covering FR-002 tap-to-select UI and post-first-pass destination restriction
- [ ] T010 [P] [US1] Write `tests/TrickPlayView.test.js` covering FR-007 client-side card-disable and FR-008 collected-stack growth + badge update
- [ ] T011 [P] [US1] Write `tests/RoundSummaryScreen.test.js` covering FR-015 made/missed rendering and Back-to-Lobby variant (no Continue button yet)
- [ ] T012 [P] [US1] Write `tests/StatusBar.005.test.js` covering FR-018 new fields rendered (trick number, exchange-pass count, cumulative-scores zero-state)
- [ ] T013 [P] [US1] Write `tests/round-messages.005.test.js` covering end-to-end `exchange_pass` → `play_card` × 24 → `round_summary` via `ConnectionManager`

### Implementation for User Story 1

#### Server (US1)

- [ ] T014 [P] [US1] Implement `cardPoints(cards)` and `roundScores(round)` pure functions in `src/services/Scoring.js` per FR-013 (sums trick-card values per seat; marriage bonus column zero until US2)
- [ ] T015 [P] [US1] Implement `roundDeltas(roundScores, declarerSeat, bid, penalties = [])` in `src/services/Scoring.js` per FR-014 — declarer `+bid` / `−bid`; opponent `+roundScore`; penalties param is plumbing for US4
- [ ] T016 [US1] Create `src/services/TrickPlay.js` with `initialize(round, declarerSeat)`, `playCard(seat, cardId)` (follow-suit-aware), `resolveTrick()` per FR-006 / FR-007 first clause / FR-008 (no trump path yet) — owns `currentTrick`, `trickNumber`, `currentTrickLeaderSeat`, `collectedTricks`, `collectedTrickCounts`
- [ ] T017 [US1] Add `submitExchangePass(seat, cardId, destSeat)` method to `src/services/Round.js` per FR-002 / FR-003 — validates card-in-hand + destination + non-duplicate, mutates `hands`, increments `exchangePassesCommitted`, transitions to `trick-play` on the second commit
- [ ] T018 [US1] Wire `Round` to delegate trick actions to `TrickPlay` (instantiate on entry to `trick-play`; expose `Round.playCard(seat, cardId, opts)` that proxies through) in `src/services/Round.js`
- [ ] T019 [US1] Add `Round.buildSummary()` to `src/services/Round.js` per FR-015 — assembles `RoundSummary` view-model (no marriage bonus column populated yet; `victoryReached` always `false` in this milestone)
- [ ] T020 [US1] Extend `src/services/RoundPhases.js` with `post-bid-decision → card-exchange` transition (replaces FR-001 superseded `play-phase-ready` path) and `card-exchange → trick-play → round-summary` transitions
- [ ] T021 [US1] Extend `src/services/RoundSnapshot.js` to include card-exchange snapshot fields (`exchangePassesCommitted`, `myHand`, optional `receivedFromExchange` identity for recipients) per FR-019 / FR-026
- [ ] T022 [US1] Extend `src/services/RoundSnapshot.js` to include trick-play snapshot fields (`trickNumber`, `currentTrickLeaderSeat`, `currentTrick` with face-up identities, `collectedTrickCounts`, `myHand`) per FR-019 / FR-026
- [ ] T023 [US1] Extend `src/services/RoundSnapshot.js` to include round-summary snapshot fields (`summary`, per-viewer-filtered `viewerCollectedCards`) per FR-019 / FR-026
- [ ] T024 [US1] Extend the GameStatus view-model emitter in `src/services/Round.js` with `trickNumber`, `collectedTrickCounts`, `exchangePassesCommitted`, and a placeholder `cumulativeScores: {0:0, 1:0, 2:0}` per FR-018 (full multi-round behaviour lands in US3)
- [ ] T025 [US1] Replace the `play_phase_ready` emission in `handleStartGame` of `src/controllers/RoundActionHandler.js` with a transition into `card-exchange` and a `card_exchange_started` broadcast per FR-001 / R-007 (note: the round-end purge in this milestone is temporary and is removed by T067 in US3)
- [ ] T026 [US1] Add `exchange_pass` message branch to `src/controllers/RoundActionHandler.js` — throttle check, seat-is-declarer check, calls `Round.submitExchangePass`, broadcasts `card_passed` (per-viewer identity filter per FR-019) and `phase_changed`
- [ ] T027 [US1] Add `play_card` message branch (no `declareMarriage` yet) to `src/controllers/RoundActionHandler.js` — throttle, `seat === currentTurnSeat` check, calls `Round.playCard`, broadcasts `card_played`, on trick-fill broadcasts `trick_resolved`, on round-end runs `Scoring.roundScores` + `Scoring.roundDeltas` and broadcasts `round_summary`
- [ ] T028 [US1] Register `exchange_pass` and `play_card` in the message-type dispatch table of `src/services/ConnectionManager.js` per contracts/ws-messages.md

#### Client (US1)

- [ ] T029 [P] [US1] Create `src/public/js/thousand/CardExchangeView.js` — declarer 10-card hand with tap-to-select then two destination buttons; opponent waiting state per FR-002 / FR-020 (hidden for opponents)
- [ ] T030 [P] [US1] Create `src/public/js/thousand/TrickPlayView.js` — centre slot, lead/follow prompt, hand with FR-007 follow-suit pre-disable, mounts the per-seat `CollectedTricksStack` widgets per FR-020
- [ ] T031 [P] [US1] Create `src/public/js/thousand/CollectedTricksStack.js` — per-seat face-down stack + `× N` count badge per FR-008
- [ ] T032 [P] [US1] Create `src/public/js/thousand/RoundSummaryScreen.js` — per-player rows (nickname, trick points, round total, delta, cumulativeAfter), declarer made/missed indicator, single Back-to-Lobby button per FR-015 (Continue button lands in US3)
- [ ] T033 [US1] Add phase routing for `'Card exchange'`, `'Trick play'`, `'Round complete'` to `src/public/js/thousand/GameScreen.js`
- [ ] T034 [US1] Add mount/unmount of `CardExchangeView`, `TrickPlayView`, `RoundSummaryScreen` to `src/public/js/thousand/GameScreenControls.js` per FR-020
- [ ] T035 [US1] Extend `src/public/js/thousand/StatusBar.js` with `trickNumber` ("Trick N of 8"), `collectedTrickCounts`, `exchangePassesCommitted` ("0/2 cards passed"), and a placeholder zero-state `cumulativeScores` row per FR-018
- [ ] T036 [US1] Add `sendExchangePass(cardId, toSeat)` and `sendPlayCard(cardId, opts = {})` outbound wrappers to `src/public/js/thousand/RoundActionDispatcher.js` — consults the `inFlightAnimation` gate per FR-030 / R-008
- [ ] T037 [US1] Add validators + handlers for `card_exchange_started`, `card_passed`, `trick_play_started`, `card_played`, `trick_resolved`, `round_summary` to `src/public/js/core/ThousandMessageRouter.js` per contracts/ws-messages.md
- [ ] T038 [US1] Implement the three card-motion animations (250 ms hand→recipient on exchange; 250 ms hand→centre on play; 350 ms pause + 250 ms centre→winner-stack on resolve) via `Antlion.onTick` and `Antlion.schedule` in `src/public/js/thousand/CardExchangeView.js` / `TrickPlayView.js` per FR-030 / Decision 10
- [ ] T039 [US1] Implement `cardsById` identity-drop rules in `src/public/js/core/ThousandApp.js` (or wherever `cardsById` is centrally mutated) per FR-019: declarer drops on pass-land; all 3 clients drop on trick-resolve-land; recipient adds on pass-land; third opponent never adds
- [ ] T040 [P] [US1] Add CSS for destination buttons, centre trick slot, per-seat collected-tricks stacks + badges, and round-summary table to `src/public/css/index.css`

**Checkpoint**: A single round plays end-to-end. Game cleanup still happens at round-end on this milestone (it will be deferred to game-end in US3).

---

## Phase 4: User Story 2 — Marriages and Trump Declaration (Priority: P2)

**Goal**: Add the marriage-declaration prompt on tricks 2–6, the combined `play_card { declareMarriage }` flow, the trump-suit state machine, and the trump-priority extension to follow-suit (FR-007 second clause).

**Independent Test**: From a round where the declarer holds K♥ and Q♥, the declarer leads trick 2 by tapping K♥, confirms "Declare marriage in Hearts (+60)". The status bar shows "Trump: ♥"; the declarer's round score is +60 before any trick points. On a later trick where the led suit is Diamonds and the declarer is out of Diamonds, they play 9♥ (a trump) and 9♥ wins the trick over any non-trump.

### Tests for User Story 2

- [ ] T041 [P] [US2] Write `tests/Round.marriage.test.js` covering FR-009 (no prompt on tricks 1 / 7 / 8 — server rejects), FR-010 marriage conditions and trump replacement on current trick, FR-011 play-without-declaring path, FR-012 stacking + most-recent-declaration-wins
- [ ] T042 [P] [US2] Write `tests/MarriageDeclarationPrompt.test.js` covering FR-009 Cancel returns to selection (no server message), combined `play_card` outbound payload on Declare-and-play

### Implementation for User Story 2

#### Server (US2)

- [ ] T043 [US2] Add `currentTrumpSuit` and `declaredMarriages` fields to `src/services/TrickPlay.js`; extend `playCard` to enforce FR-007 second clause (out-of-led-suit MUST play trump if any held); extend `resolveTrick` with trump-priority winner check per FR-008
- [ ] T044 [US2] Add `declareMarriage(seat, cardId)` to `src/services/TrickPlay.js` — re-validates FR-010 (a) holds both K and Q of suit, (b) trick number in [2, 6], (c) player is leading; sets trump; appends `declaredMarriages` entry
- [ ] T045 [US2] Extend the `play_card` branch in `src/controllers/RoundActionHandler.js` to accept the optional `declareMarriage` flag; on `true` runs `TrickPlay.declareMarriage` before `TrickPlay.playCard`; atomic accept/reject per Decision 5; broadcasts `marriage_declared` + `trump_changed` before the corresponding `card_played`
- [ ] T046 [US2] Register no new message types in `src/services/ConnectionManager.js` (the marriage flag piggybacks on `play_card`); add outbound broadcast helpers for `marriage_declared` and `trump_changed` per contracts/ws-messages.md
- [ ] T047 [US2] Extend `roundScores` in `src/services/Scoring.js` to add each player's marriage-bonus sum to their round total per FR-013
- [ ] T048 [US2] Extend `Round.buildSummary` in `src/services/Round.js` to populate the `marriageBonus` column for each player and surface declarer made/missed using `trickPoints + marriageBonus` per FR-015
- [ ] T049 [US2] Add `currentTrumpSuit` and `declaredMarriages` to the trick-play snapshot in `src/services/RoundSnapshot.js` per FR-026
- [ ] T050 [US2] Extend the GameStatus view-model emitter in `src/services/Round.js` with `currentTrumpSuit` per FR-018

#### Client (US2)

- [ ] T051 [P] [US2] Create `src/public/js/thousand/MarriageDeclarationPrompt.js` — Declare-and-play / Play-without-declaring / Cancel modal with the `canOffer(player, trickNumber)` gate from R-005 (trick ∈ [2, 6], hand.length ≥ 3, holds both K and Q of suit)
- [ ] T052 [US2] Extend `src/public/js/thousand/TrickPlayView.js` to open `MarriageDeclarationPrompt` on K/Q tap when leading and conditions hold; on Declare-and-play, dispatch `sendPlayCard(cardId, { declareMarriage: true })`; on Play-without-declaring, dispatch `sendPlayCard(cardId)`; on Cancel, dismiss with no server message
- [ ] T053 [US2] Extend the FR-007 pre-disable logic in `src/public/js/thousand/TrickPlayView.js` with the trump-priority rule (out-of-led-suit must play trump if held)
- [ ] T054 [US2] Extend `src/public/js/thousand/StatusBar.js` with the `currentTrumpSuit` indicator ("No trump" when null, suit glyph otherwise) per FR-018
- [ ] T055 [US2] Add validators + handlers for `marriage_declared` and `trump_changed` to `src/public/js/core/ThousandMessageRouter.js` per contracts/ws-messages.md
- [ ] T056 [P] [US2] Add CSS for the marriage prompt modal, the trump-suit status chip, and the per-player marriage-bonus column in the round summary to `src/public/css/index.css`

**Checkpoint**: Marriages and trump fully work within a single round.

---

## Phase 5: User Story 3 — Multi-Round, Dealer Rotation, Victory at 1000+ (Priority: P3)

**Goal**: Introduce the persistent `Game` entity, the Continue-to-Next-Round protocol, dealer rotation, cumulative scoring across rounds, the final-results screen with per-round history, and the FR-029 cleanup supersession.

**Independent Test**: Three players play through a sequence of rounds. After each round summary, all three press Continue; a new round begins with the dealer rotated clockwise. Cumulative scores carry across rounds and are visible at all times. When any player's cumulative reaches ≥ 1000, the game ends; all three clients show the final-results screen with the winner highlighted and a per-round history table.

### Tests for User Story 3

- [ ] T057 [P] [US3] Write `tests/Game.multiround.test.js` covering FR-016 dealer rotation (R-002: `game.session` is the same instance across 3 rounds), FR-029 cleanup at game-end only (R-007: no purge on `play_phase_ready` path), cumulative carry-over including negatives
- [ ] T058 [P] [US3] Write `tests/FinalResultsScreen.test.js` covering FR-017 descending-ranking sort, winner highlight, history-table rendering
- [ ] T059 [P] [US3] Write `tests/Round.disconnect.play.test.js` covering FR-025 trick-play active-player pause/continue, round-summary sticky press, grace-expiry abort variants (R-006 both orderings: third press before vs after grace expiry)
- [ ] T060 [P] [US3] Extend `tests/Scoring.test.js` with FR-017 `determineWinner` tiebreak coverage (single winner; declarer-among-tied wins; seat-order fallback)

### Implementation for User Story 3

#### Server (US3)

- [ ] T061 [P] [US3] Create `src/services/Game.js` per data-model.md — fields: `gameId`, `seatOrder`, `dealerSeat`, `currentRoundNumber`, `cumulativeScores`, `continuePresses` (Set), `history` (array), `gameStatus`; constructor only (mutation methods land in T062 / T063)
- [ ] T062 [US3] Add `Game.applyRoundEnd(roundDeltas, summaryEntry)` to `src/services/Game.js` — mutates `cumulativeScores`, appends one `RoundHistoryEntry` to `history` per Decision 9
- [ ] T063 [US3] Add `Game.recordContinuePress(seat)` (sticky-press semantics per Decision 7 / R-006: short-circuits if `gameStatus !== 'in-progress'` or if any disconnected seat is past grace) and `Game.startNextRound()` (rotates `dealerSeat` clockwise, increments `currentRoundNumber`, clears `continuePresses`) to `src/services/Game.js`
- [ ] T064 [P] [US3] Implement `Scoring.determineWinner(game)` in `src/services/Scoring.js` per Decision 11 — max score → declarer-among-tied tiebreak → seat-order fallback
- [ ] T065 [P] [US3] Implement `Scoring.buildFinalResults(game)` in `src/services/Scoring.js` per FR-017 — `finalRanking` sorted descending, `isWinner` flag, history pass-through
- [ ] T066 [US3] Update `src/services/ThousandStore.js` so the existing `startRound(gameId)` callsite instantiates `game.session = new Game(...)` on round 1 only; subsequent rounds reuse `game.session` and call `Game.startNextRound()` per Decision 2 / R-002
- [ ] T067 [US3] Update `_admitPlayerToGame` in `src/controllers/GameController.js` to set `game.session = null` at admission (the Game instance is created later by `store.startRound`) per Decision 2
- [ ] T068 [US3] Remove the temporary round-end purge introduced in T025; move cleanup callsites in `src/controllers/RoundActionHandler.js` to fire only on `final_results`, `round_aborted`, and `game_aborted` broadcasts per FR-029 / Decision 8
- [ ] T069 [US3] Add the `continue_to_next_round` message branch to `src/controllers/RoundActionHandler.js` — throttle, validates `Round.phase === 'round-summary'` and `Game.gameStatus === 'in-progress'`, calls `Game.recordContinuePress`, broadcasts `continue_press_recorded`; on the third press calls `Game.startNextRound()`, instantiates a fresh `Round`, and broadcasts `next_round_started`
- [ ] T070 [US3] Add the victory-check pipeline in the round-summary builder (called from the `play_card` round-end branch in `src/controllers/RoundActionHandler.js`): after `Game.applyRoundEnd`, if any `cumulativeScores[seat] >= 1000` then set `Game.gameStatus = 'game-over'`, call `Scoring.buildFinalResults`, broadcast `final_results`, and purge the game record per FR-017 / FR-029
- [ ] T071 [US3] Add the grace-expiry-on-round-summary handler in `src/services/ConnectionManager.js` (or wherever grace timers live) — on expiry of a player whose seat is NOT in `Game.continuePresses`, set `Game.gameStatus = 'aborted'`, broadcast `game_aborted` (with `disconnectedNickname` and `reason: 'player_grace_expired'`), purge per FR-025 / FR-029
- [ ] T072 [US3] Register `continue_to_next_round` in the message-type dispatch table of `src/services/ConnectionManager.js`; add broadcast helpers for `continue_press_recorded`, `next_round_started`, `final_results`, `game_aborted` per contracts/ws-messages.md
- [ ] T073 [US3] Extend the GameStatus view-model emitter in `src/services/Round.js` to read `cumulativeScores`, `roundNumber`, and `continuePressedSeats` from `game.session` (replacing the US1 placeholder zero-state) per FR-018
- [ ] T074 [US3] Extend `src/services/RoundSnapshot.js` with the final-results snapshot (`finalResults: FinalResults` payload) and add `continuePressedSeats` to the round-summary snapshot per FR-026

#### Client (US3)

- [ ] T075 [P] [US3] Create `src/public/js/thousand/FinalResultsScreen.js` — `finalRanking` rows (descending, winner highlighted), per-round history table (round / declarer / bid / per-player {delta, cumulativeAfter, penalties}), single Back-to-Lobby button per FR-017
- [ ] T076 [US3] Extend `src/public/js/thousand/RoundSummaryScreen.js` to swap the Back-to-Lobby control for `Continue to Next Round` when `summary.victoryReached === false`; render a "Continued ✓" indicator next to each seat in `continuePressedSeats`; the local viewer's button becomes non-operable after their own press per FR-015 / FR-016
- [ ] T077 [US3] Add `'Game over'` phase routing in `src/public/js/thousand/GameScreen.js` → mount `FinalResultsScreen`
- [ ] T078 [US3] Add validators + handlers for `continue_press_recorded`, `next_round_started`, `final_results`, `game_aborted` to `src/public/js/core/ThousandMessageRouter.js` per contracts/ws-messages.md
- [ ] T079 [US3] Add terminal-screen lifecycle routing for `final_results` and `game_aborted` (Game-aborted variant of `RoundReadyScreen`) to `src/public/js/core/ThousandApp.js` — individual Back-to-Lobby navigation per FR-029
- [ ] T080 [US3] Add `sendContinueToNextRound()` outbound wrapper to `src/public/js/thousand/RoundActionDispatcher.js`
- [ ] T081 [US3] Update `src/public/js/thousand/StatusBar.js` to render `cumulativeScores` at all times (from round 1 bidding through Game over) and the `roundNumber` field per FR-018 (replaces the US1 placeholder zero-state)
- [ ] T082 [P] [US3] Add CSS for the final-results ranking + history table, the Continue button, the "Continued ✓" indicator, and the Game-aborted variant of the round-ready screen to `src/public/css/index.css`

**Checkpoint**: Games run multi-round until someone reaches 1000+. Game record persists across rounds and is purged only on the three terminal broadcasts.

---

## Phase 6: User Story 4 — Special Scoring: Barrel and Three Consecutive Zeros (Priority: P4)

**Goal**: Add the barrel rule (cumulative in [880, 1000) ⇒ 120-bid floor + 3-round counter + −120 penalty) and the three-consecutive-zeros rule (−120 penalty on the 3rd consecutive zero round).

**Independent Test**: Drive a player's cumulative to 895; on the next round the status display shows "On barrel — round 1 of 3". The server rejects bids below 120 from that player. After 3 on-barrel rounds without reaching 1000, a −120 penalty is applied. Separately, drive a player to 3 consecutive rounds with round score exactly 0; the third triggers a −120 penalty.

### Tests for User Story 4

- [ ] T083 [P] [US4] Write `tests/Game.barrel.test.js` covering FR-021 / FR-022 / FR-023 — entry/exit transitions, bid-floor in main bidding and selling, 3-round penalty and reset, FR-022 (d) auto-declarer 120 when dealer is on barrel
- [ ] T084 [P] [US4] Write `tests/Game.consecutivezeros.test.js` covering FR-024 zero-counter, penalty + reset, and the simultaneous-barrel-and-zeros case (both fire — total −240 on the same round)

### Implementation for User Story 4

#### Server (US4)

- [ ] T085 [US4] Add `barrelState` and `consecutiveZeros` fields to the `Game` constructor in `src/services/Game.js` per data-model.md
- [ ] T086 [US4] Extend `Game.applyRoundEnd` in `src/services/Game.js` with FR-021 / FR-023 barrel transitions (advance counter; on counter === 3 with score still in [880, 1000), apply −120, reset counter) and FR-024 zero-counter (advance on `roundTotal === 0`; on counter === 3, apply −120, reset); emit a `penalties: [...]` array on each affected player's history entry so the summary can surface them
- [ ] T087 [US4] Extend `Round.submitBid` in `src/services/Round.js` with the FR-022 barrel bid-floor (reject `< 120` from on-barrel players with reason "Players on barrel must bid at least 120.")
- [ ] T088 [US4] Extend `Round.submitSellBid` in `src/services/Round.js` with the same FR-022 barrel bid-floor in the selling-bidding flow
- [ ] T089 [US4] Extend the auto-declarer rule in `src/services/Round.js` (the FR-011 callsite from feature 004): if all three pass on the opening 100 AND the dealer is on barrel, the auto-declared bid is `120` not `100` per FR-022 (d)
- [ ] T090 [US4] Extend the GameStatus view-model emitter in `src/services/Round.js` with `barrelMarkers` (per-seat `{ onBarrel, barrelRoundsUsed }` map; absent when `onBarrel === false`) per FR-018
- [ ] T091 [US4] Extend `Round.buildSummary` in `src/services/Round.js` to surface barrel and zero penalty line items per FR-023 / FR-024 ("Barrel penalty: −120", "Zero-round penalty: −120") on the affected player's row

#### Client (US4)

- [ ] T092 [US4] Extend `src/public/js/thousand/StatusBar.js` with the `barrelMarkers` indicator ("On barrel — round N of 3") next to the matching seat label per FR-018
- [ ] T093 [US4] Extend the shared base class `src/public/js/thousand/BiddingControls.js` (or its subclass `BidControls.js`) with a barrel-aware stepper clamp: `min = max(smallestLegalBid, 120)`, initial value at `min`, max `300`; Pass remains always operable per FR-022
- [ ] T094 [US4] Apply the same barrel-aware clamp to `src/public/js/thousand/SellBidControls.js` per FR-022
- [ ] T095 [US4] Extend `src/public/js/thousand/RoundSummaryScreen.js` to render the "Barrel penalty: −120" and "Zero-round penalty: −120" rows as separate line items on the affected player's column per FR-023 / FR-024
- [ ] T096 [P] [US4] Add CSS for the on-barrel marker badge and the penalty line-item styling to `src/public/css/index.css`

**Checkpoint**: All four user stories functional; rulebook coverage complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verification, hygiene, and quickstart-driven manual validation.

- [ ] T097 [P] Run `npm run lint` on `src/` and resolve any new violations introduced across the four phases
- [ ] T098 [P] Run `npm run test:coverage` and confirm overall coverage remains ≥ 90% per the constitution; fill any new uncovered branches
- [ ] T099 Run the `quickstart.md` 22-step 3-tab manual walkthrough end-to-end and confirm SC-001 .. SC-011 all pass; capture any deviations as follow-up tickets
- [ ] T100 [P] Re-check constitution §IX size signal: confirm `Round.js` is below the 500-line ceiling after the `TrickPlay.js` / `Scoring.js` extractions; if `TrickPlay.js` itself exceeds ~250 lines after US2, extract `MarriageRules.js` per R-001 mitigation plan

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** — no dependencies.
- **Phase 2 (Foundational)** — depends on Phase 1. **Blocks all user stories**.
- **Phase 3 (US1, P1)** — depends on Phase 2. MVP slice; can ship standalone (Back-to-Lobby summary, no multi-round).
- **Phase 4 (US2, P2)** — depends on US1 (extends `TrickPlay`, `Scoring.roundScores`, `Round.buildSummary`, `TrickPlayView`, `StatusBar`).
- **Phase 5 (US3, P3)** — depends on US1 (replaces US1's temporary round-end purge; extends the round summary screen). Does **not** depend on US2 — multi-round is orthogonal to marriages.
- **Phase 6 (US4, P4)** — depends on US3 (operates on the persistent `Game` entity and its `applyRoundEnd` hook).
- **Phase 7 (Polish)** — depends on whichever stories are complete in this PR.

### Within Each User Story

- Tests first → make tests fail meaningfully → then implementation in this order: pure functions → services → controllers → frontend components → wiring & animation → CSS.
- Server-side message-handler changes (e.g., T025–T028 in US1) require the corresponding service methods (T014–T019) to exist.
- Client-side message handlers (e.g., T037 in US1) require the outbound dispatcher wrappers (T036) and the screens (T029–T032) to exist.

### Parallel Opportunities

- **Phase 2**: T002 / T003 / T005 can run in parallel (different files).
- **Phase 3 tests**: T006–T013 are all `[P]` (different test files).
- **Phase 3 server implementation**: T014 and T015 in parallel (same file but distinct exports; one developer can write both); T021 / T022 / T023 in sequence (same file: `RoundSnapshot.js`).
- **Phase 3 client implementation**: T029 / T030 / T031 / T032 in parallel (different files); T040 (CSS) can run in parallel with all of the above.
- **Phase 4**: T041 / T042 in parallel; T051 / T056 (CSS) in parallel.
- **Phase 5**: T057 / T058 / T059 / T060 in parallel; T061 (Game.js scaffold) blocks T062 / T063; T064 / T065 in parallel after T061; T075 / T082 (CSS) in parallel.
- **Phase 6**: T083 / T084 in parallel; T085 (Game.js fields) blocks T086; T096 (CSS) parallel.
- **Phase 7**: T097 / T098 / T100 in parallel; T099 sequential (manual walkthrough).

---

## Parallel Example: User Story 1

```text
# Launch all US1 tests together (write the contracts first):
Task: "Write tests/Scoring.test.js — FR-013 / FR-014 (T006)"
Task: "Write tests/Round.cardexchange.test.js — FR-002 / FR-003 (T007)"
Task: "Write tests/Round.trickplay.test.js — FR-006 / FR-007 / FR-008 (T008)"
Task: "Write tests/CardExchangeView.test.js — FR-002 (T009)"
Task: "Write tests/TrickPlayView.test.js — FR-007 / FR-008 (T010)"
Task: "Write tests/RoundSummaryScreen.test.js — FR-015 (T011)"
Task: "Write tests/StatusBar.005.test.js — FR-018 (T012)"
Task: "Write tests/round-messages.005.test.js — end-to-end (T013)"

# Once Scoring.js stubs exist, the four US1 frontend screens can land in parallel:
Task: "Create src/public/js/thousand/CardExchangeView.js (T029)"
Task: "Create src/public/js/thousand/TrickPlayView.js (T030)"
Task: "Create src/public/js/thousand/CollectedTricksStack.js (T031)"
Task: "Create src/public/js/thousand/RoundSummaryScreen.js (T032)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (US1).
3. **STOP and VALIDATE**: run the 3-tab walkthrough through step 14 (round summary with Back-to-Lobby). The feature is shippable as a single-round demo at this point.

### Incremental Delivery

1. Setup + Foundational → ready.
2. US1 → ship (single-round MVP).
3. US2 → ship (marriages + trump add the strategic core; bidding economy starts working).
4. US3 → ship (multi-round + victory; the implementation is now a full game).
5. US4 → ship (barrel + three-zeros; rulebook coverage complete).

### Parallel Team Strategy

- Setup + Foundational together.
- US1 lands on the critical path (everything else builds on `TrickPlay` and `Scoring`).
- After US1: US2 and US3 are orthogonal and can be parallelised across two developers. US4 is blocked on US3.
- Polish phase (Phase 7) runs once per PR.

---

## Notes

- `[P]` tasks operate on different files with no incomplete dependencies.
- `[Story]` label maps each task to its user story for traceability against the FR list.
- Every test file referenced in `quickstart.md` § "Running tests" appears as a task in this list (FR coverage is enforceable).
- Animation timing values (250 / 350 / 250 ms) are from research.md Decision 10 — these are the targets, not contracts; the timing constants live in `src/public/js/thousand/constants.js` for easy tuning.
- The `play_phase_ready` message remains in the protocol for the abort path (`round_aborted`) only — see research.md Decision 8.
- Commit after each task or per small group; rebase often. The four-PR delivery cadence is the recommended shape.
