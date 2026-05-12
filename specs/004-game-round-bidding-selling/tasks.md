# Tasks: Card Game 1000 — Round Setup, Bidding & Selling the Bid

**Input**: Design documents from `/specs/004-game-round-bidding-selling/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ws-messages.md ✓, quickstart.md ✓

**Tests**: INCLUDED. The plan and constitution mandate ≥ 90 % coverage and explicitly enumerate test files; tests for each user story land in the same phase as the production code that makes them pass.

**Organization**: Tasks are grouped by user story (US1, US2, US3) so each story can be implemented, tested, demoed, and shipped as a standalone PR per the plan's delivery order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no incomplete-task dependency — can run in parallel.
- **[Story]**: US1 / US2 / US3 mapped to the priority order in spec.md. Setup, Foundational, and Polish phases carry no Story label.
- Every task names the exact file path it touches.

## Path Conventions

This is a single project (Node.js server + vanilla-JS frontend, no bundler) per `plan.md`'s Project Structure. Backend in `src/services/` and `src/controllers/`. Frontend in `src/public/js/`, with the new feature's modules under `src/public/js/thousand/`. Tests in `tests/` (Node built-in `--test` runner).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Carve out the new feature's frontend directory. Backend folders already exist.

- [X] T001 Create the new frontend feature directory `src/public/js/thousand/` (empty — its contents land in subsequent tasks)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend scaffold for the `Round` state machine, the WS message dispatch layer, and the frontend visual primitives that every user story renders into. Nothing here implements an actual round phase — those land in US1/US2/US3 — but every story depends on this scaffold existing first.

**⚠️ CRITICAL**: No user-story phase can start until this phase is complete.

### Backend scaffold

- [X] T002 [P] Create `src/services/Deck.js` — pure factory for the 24-card deck (`{9,10,J,Q,K,A} × {♣,♠,♥,♦}`) plus a Fisher-Yates `shuffle(deck)` seeded from `crypto.randomInt`; exports pure functions only (no class)
- [X] T003 Create `src/services/Round.js` — class scaffold with constructor (`{ game, store }`), instance fields per `data-model.md` (phase, dealerSeat, seatOrder, seatByPlayer, deck, hands, talon, exposedSellCards, currentTurnSeat, currentHighBid `(initially null)`, bidHistory, passedBidders, passedSellOpponents, declarerSeat, attemptCount, attemptHistory, pausedByDisconnect), seat assignment from join order per FR-003 (1st joiner = host = Dealer = seat 0; 2nd joiner = P1 = seat 1, clockwise-left of Dealer; 3rd joiner = P2 = seat 2, clockwise-right of Dealer), and stub methods `start()`, `getRoundStartedPayloadFor(playerId)`, `getViewModelFor(seat)`, `getSnapshotFor(seat)` returning `null`/empty for now
- [X] T004 Create `src/controllers/RoundActionHandler.js` — class scaffold with constructor accepting `{ store }`, a per-player throttle instantiated as `new RateLimiter(250, 1)` (FR-030), helper methods `_gameOf(playerId)`, `_seatOf(playerId)`, `_reject(playerId, reason)` (sends `action_rejected` to the actor only per FR-031), and empty action handlers `handleBid`, `handlePass`, `handleSellStart`, `handleSellSelect`, `handleSellCancel`, `handleSellBid`, `handleSellPass`, `handleStartGame` (all return early — bodies in later phases)
- [X] T005 Modify `src/services/ThousandStore.js` — attach `round: null` to every `Game` record at creation; add `startRound(gameId)` method that sets `status='in-progress'`, clears `waitingRoomTimer`, instantiates `new Round({ game, store: this })`, calls `round.start()`, sends per-viewer-filtered `round_started` via `round.getRoundStartedPayloadFor(pid)` to each of the 3 players, then calls `broadcastLobbyUpdate()` (so the game leaves the public lobby — FR-020)
- [X] T006 Modify `src/services/ThousandStore.js` — add private `_cleanupRound(gameId)` helper (null out `gameId` on every member, delete `games[gameId]`, clear any invite-code mapping, `broadcastLobbyUpdate()`) per FR-032; **the helper MUST be idempotent — a second call for an already-purged `gameId` returns silently without throwing and without re-broadcasting**; will be called by `RoundActionHandler` on `play_phase_ready` and on `round_aborted`
- [X] T007 Modify `src/controllers/GameController.js` — inside `_admitPlayerToGame`, after a successful admit and the existing notifications, check `game.players.size === game.requiredPlayers` and if so call `this._store.startRound(game.id)` (FR-001 auto-start)
- [X] T007a Modify `src/controllers/GameController.js` — at the top of `_admitPlayerToGame` (before the player-count check), reject the admit with a `game_join_failed` reason of `"Game is already in progress"` when `game.status !== 'waiting'` (FR-020). This guards invite-code joins and any race between the 3rd admit and the lobby update.
- [X] T008 Modify `src/services/ConnectionManager.js` — instantiate a single `RoundActionHandler` in the constructor and add `msg.type` branches for `bid`, `pass`, `sell_start`, `sell_select`, `sell_cancel`, `sell_bid`, `sell_pass`, `start_game` that delegate to its handlers; unknown types still return the existing error reply
- [X] T009 Modify `src/services/ConnectionManager.js` — extend the `hello` handshake's restore path so that when `game.status === 'in-progress'`, the follow-up is `round_state_snapshot` (built from `game.round.getSnapshotFor(seat)`) instead of `game_joined`; when the player's prior `gameId` no longer maps to a live game (post-cleanup, FR-032), send `connected { restored:true, gameId:null }` only — no `game_joined`, no `round_state_snapshot`

### Frontend visual primitives

- [X] T010 [P] Create `src/public/js/thousand/CardSprite.js` — ES-module class for one card: id, current position, face state (`up | back`); `setPosition(x, y, durationMs)` starts a per-tick interpolation (driven from `DealAnimation` and other animators); `setFace('up'|'back')`; `setIdentity({ rank, suit })`; renders an absolutely-positioned DOM node
- [X] T011 [P] Create `src/public/js/thousand/CardTable.js` — layout class that owns slot coordinates for `self`/`left`/`right`/`talon`/`deckOrigin` based on viewport; recomputes on resize via `Antlion.bindInput(window, 'resize', 'resize')`; exposes `getSlot(name)` and `slotsForSeat(viewerSeat)` (the FR-005 "next-clockwise opponent on left" rule)
- [X] T012 [P] Create `src/public/js/thousand/StatusBar.js` — class rendering the fixed top bar (FR-025); `render(gameStatus)` paints phase label, active player (with "Your turn" vs "Waiting for {nickname}…" framing from `viewerIsActive`), current high bid, declarer, passed-players chips, `sellAttempt` counter when present, and a "Connection lost…" marker per disconnected player
- [X] T013 [P] Create `src/public/js/thousand/HandView.js` — viewer's own face-up hand; `setHand(cards)` re-sorts via FR-005 (suits ♣→♠→♥→♦, ranks 9→A within suit) and rebuilds the row; selection mode is a separate enable flag toggled later in US3 (no selection logic yet)
- [X] T014 [P] Create `src/public/js/thousand/OpponentView.js` — one opponent's face-down hand: count badge, nickname label, "Connection lost…" indicator slot
- [X] T015 [P] Create `src/public/js/thousand/TalonView.js` — central talon area: zero-to-three face-up `CardSprite`s; `setCards(cards)` replaces; `clear()` empties (used at the moment the declarer absorbs)
- [X] T016 [P] Create `src/public/js/thousand/RoundActionDispatcher.js` — thin outbound wrapper around `ThousandSocket.send`; methods `sendBid(amount)`, `sendPass()`, `sendSellStart()`, `sendSellSelect(cardIds)`, `sendSellCancel()`, `sendSellBid(amount)`, `sendSellPass()`, `sendStartGame()`
- [X] T017 Create `src/public/js/thousand/GameScreen.js` — container class that instantiates `StatusBar`, `CardTable`, `HandView` (self), two `OpponentView`s (left, right), and `TalonView`; methods `init(roundStartedMsg)` (seeds `cardsById` from per-viewer identities, lays out seats per `seats.self/left/right`), `updateStatus(gameStatus)` (delegates to `StatusBar.render` and re-evaluates which sub-controller to mount/disable/hide per FR-026), and slot mounts for the per-phase sub-controllers added in later phases (Bid/Sell/Decision/SellBid/RoundReady)
- [X] T018 Modify `src/public/js/core/ThousandApp.js` — add `MESSAGE_VALIDATORS` entries for every new server→client message: `round_started`, `phase_changed`, `bid_accepted`, `pass_accepted`, `talon_absorbed`, `sell_started`, `sell_exposed`, `sell_resolved`, `play_phase_ready`, `round_aborted`, `action_rejected`, `round_state_snapshot`, `player_disconnected`, `player_reconnected` (shapes per `contracts/ws-messages.md`); reject malformed messages
- [X] T019 Modify `src/public/js/core/ThousandApp.js` — instantiate `GameScreen` alongside the existing `WaitingRoom`; switch the visible screen based on `game.status` (`waiting` → WaitingRoom, `in-progress` → GameScreen); route `round_started` → `GameScreen.init`, `phase_changed` → `GameScreen.updateStatus`, `action_rejected.reason` → `Toast.show(reason)` (FR-031); leave the message-specific handlers (bid_accepted etc.) as TODOs that later phases fill in
- [X] T020 Modify `src/public/css/index.css` — add the game-screen layout (full-width container with a CSS-grid: fixed top status-bar row + table area), card-sprite base styles (face-up rectangle vs face-back gradient), responsive media queries reusing the existing green palette and `--touch-min: 2.75rem`; no per-phase styling yet (those land with the controls)

**Checkpoint**: Foundation ready. The server can flip a game to `in-progress` and broadcast a stub `round_started`; the client swaps to a (still mostly empty) game screen with a status bar and seats. User-story phases now unblock.

---

## Phase 3: User Story 1 — Auto-Starts and Bidding Begins (Priority: P1) 🎯 MVP

**Goal**: A 3rd join auto-starts the game; the deal animation plays the same canonical 24-step sequence on every client (with per-viewer-filtered identities); bidding rotates clockwise; bids are validated per FR-008; passes lock the bidder out for the round; bidding resolves to a single declarer with a bid in [100, 300].

**Independent Test**: Three players join one waiting room. Within 2 s, all three clients show the game screen. Each plays the same 24-card deal animation (rounds 1–3: P1→P2→Dealer→Talon; rounds 4–7: P1→P2→Dealer). After the deal, the player clockwise-left of the host (P1) has live Bid/Pass controls and the others see "Waiting…". The phase resolves to exactly one declarer with a valid bid.

### Round + handler logic for US1

- [X] T021 [US1] Implement `Round.start()` in `src/services/Round.js` — call `Deck.shuffle(Deck.makeDeck())`; compute the canonical 24-step deal sequence per FR-002 (rounds 1, 2, 3 each: P1→P2→Dealer→Talon for 12 cards; rounds 4–7 each: P1→P2→Dealer for 12 more — concretely seats `1, 2, 0` in clockwise order, with the Talon as the 4th destination during rounds 1–3); populate `hands[0..2]` (7 each) and `talon` (3); assign card ids 0–23 = sequence index per Decision 3 in research.md; set `phase='dealing'`, `currentTurnSeat=null`, `currentHighBid=null` (sentinel for "no bid yet"; the view-model materialises this as 100 per `data-model.md`)
- [X] T022 [US1] Implement `Round.getRoundStartedPayloadFor(playerId)` in `src/services/Round.js` — for the given recipient build `{ type:'round_started', seats, dealSequence, gameStatus }` per `contracts/ws-messages.md`: `seats.self` = recipient seat, `seats.left` = next-clockwise-opponent (FR-005), `seats.right` = the other opponent, `seats.dealer` = `0` (the host's seat per FR-003), `seats.players[]` public identities; `dealSequence[i].{rank,suit}` included **iff** the step's `to === 'talon'` OR `to === 'seat' + recipient.seat` (FR-022); initial `gameStatus` with `phase:'Dealing'`, `activePlayer:null`, `currentHighBid: 100` (the display value derived from internal `null` per `data-model.md`)
- [X] T023 [US1] Implement `Round.advanceFromDealingToBidding()` in `src/services/Round.js` — server-side transition triggered by the first action message after the deal (keep simple: trigger on first received `bid`/`pass` from any client; FR-024 already disables client controls until animation completes, so under normal play the first action will come from P1 — but if a misbehaving / racing client sends an action before its own animation finishes, the phase transition still occurs and the subsequent `submitBid`/`submitPass` validation rejects the actor on `seat !== currentTurnSeat`, which is benign); set `phase='bidding'`, set `currentTurnSeat = 1` (seat P1, clockwise-left of Dealer, the first bidder per FR-004), populate `gameStatus.activePlayer`
- [X] T024 [US1] Implement `Round.submitBid(seat, amount)` in `src/services/Round.js` — validate per FR-008: integer, multiple of 5, ≤ 300, and `amount >= smallestLegalBid` where `smallestLegalBid = (this.currentHighBid === null ? 100 : this.currentHighBid + 5)` — this encodes both the "first bid ≥ 100" and "subsequent bid > prior in steps of 5" rules from FR-008 with a single comparison; also validate sender seat === `currentTurnSeat`, phase === `'bidding'`, not `pausedByDisconnect`; on accept append to `bidHistory`, set `currentHighBid = amount`, rotate `currentTurnSeat` to next clockwise seat ∉ `passedBidders`; if only one non-passed bidder remains, set `declarerSeat`, transition to `post-bid-decision` and call the talon-absorption helper (T041 in US2 — leave a clear TODO comment until that lands; for US1 just stop at "declarer determined" — see T026); return `{ rejected, reason? }`
- [X] T025 [US1] Implement `Round.submitPass(seat)` in `src/services/Round.js` — validate sender == `currentTurnSeat`, phase === `'bidding'`; add seat to `passedBidders`; append `{ seat, amount:null }` to `bidHistory`; rotate `currentTurnSeat` to next non-passed clockwise seat; if **all 3** are passed → dealer becomes declarer per FR-011 and the server MUST set `currentHighBid = 100` at this transition (the all-pass case is the only way `currentHighBid` becomes non-null without an explicit bid being accepted — necessary so the view-model and `Round.startGame` final-bid payload report exactly 100); if exactly **one non-passed** remains → that seat becomes declarer at `currentHighBid` per FR-010 (transition handled jointly with T041 in US2)
- [X] T026 [US1] Implement `Round.getViewModelFor(seat)` in `src/services/Round.js` — build the GameStatus view-model per `data-model.md` (`phase` label, `activePlayer` from `currentTurnSeat`, `viewerIsActive = (seat === currentTurnSeat)`, `currentHighBid` passed through **as-is including `null`** (the wire schema is `number | null`; the client renders `currentHighBid ?? 100` and derives the smallest legal bid per FR-028), `declarer` from `declarerSeat`, `passedPlayers` from `passedBidders` nicknames, `sellAttempt:null` for US1, `disconnectedPlayers:[]` baseline); per-recipient call site passes the recipient's seat
- [X] T027 [US1] Implement `RoundActionHandler.handleBid(playerId, amount)` in `src/controllers/RoundActionHandler.js` — throttle via `rateLimiter.isAllowed(playerId)` (silent drop on `false` per FR-030); `game = this._gameOf(playerId)`; if no `game?.round` → `_reject('Not in a round')`; if phase is `'dealing'`, first call `round.advanceFromDealingToBidding()`; call `round.submitBid(this._seatOf(playerId), amount)`; on reject → `_reject(playerId, result.reason)`; on accept → broadcast `bid_accepted { playerId, amount, gameStatus }` and `phase_changed { phase, gameStatus }` to all 3 players with each recipient's own per-seat `gameStatus`
- [X] T028 [US1] Implement `RoundActionHandler.handlePass(playerId)` in `src/controllers/RoundActionHandler.js` — throttle; route to `round.submitPass` **only** when `round.phase === 'bidding'` (selling-phase pass branches off in T061 in US3); on accept broadcast `pass_accepted { playerId, gameStatus }` and `phase_changed { phase, gameStatus }`

### Frontend for US1

- [X] T029 [P] [US1] Create `src/public/js/thousand/DealAnimation.js` — class driven by `Antlion.onTick`: consumes `dealSequence` + identities + `viewerSeat` + `CardTable`; flies each card from the deck origin to its destination slot at ~80 ms per step with a small ease-out curve; opponents' cards animate as card-backs; own-seat cards animate face-up; talon cards animate face-up for everyone; calls `onComplete()` when the last sprite lands; while running, holds a "controls locked" flag exposed to `GameScreen` per FR-024
- [X] T030 [P] [US1] Create `src/public/js/thousand/BidControls.js` — numeric `<input type="number">` plus `−5` / `+5` stepper buttons + Bid + Pass per FR-028; derive `smallestLegalBid` from the wire view-model: `(currentHighBid === null) ? 100 : currentHighBid + 5`. Field initialises to `smallestLegalBid` each time it appears for the active bidder; stepper clamps output to `[smallestLegalBid, 300]` in steps of 5; **when `smallestLegalBid > 300` (the 300 cap has been reached) the numeric input, both steppers, and the Bid button are all disabled — only Pass remains operable** (per FR-028 / Edge Cases `U1`); typed input is **not** clamped (FR-028) but the Bid button is disabled whenever the current value fails FR-008; Pass is always operable for the active bidder; uses `Antlion.bindInput` for click/change events; `setActiveState({ isActiveBidder, isEligible })` chooses between operable, disabled, and hidden per FR-026
- [X] T031 [US1] Wire `DealAnimation` into `src/public/js/thousand/GameScreen.js` — on `round_started`, seed `cardsById` from per-viewer identities, lay out the table, instantiate `DealAnimation`, call `start()`; on `onComplete`, allow the next `updateStatus` to mount `BidControls` if the viewer is the active bidder
- [X] T032 [US1] Wire `BidControls` into `src/public/js/thousand/GameScreen.js` per FR-026 — render operable only when `phase==='Bidding'` AND `viewerIsActive`; render disabled when viewer is eligible-but-waiting (in `passedBidders` is false but not their turn); render **hidden** when viewer is in `passedBidders` (permanently locked out for the rest of bidding); wire submit to `RoundActionDispatcher.sendBid` / `sendPass`
- [X] T033 [US1] Add `bid_accepted` and `pass_accepted` handlers in `src/public/js/core/ThousandApp.js` — forward each message's `gameStatus` to `GameScreen.updateStatus`; the cosmetic flourish (chip flash on the acting seat) is a CSS class toggle for ~600 ms via `Antlion.schedule`

### Tests for US1

- [X] T034 [P] [US1] Create `tests/Round.deal.test.js` — assert: shuffled deck has all 24 distinct cards; `Round.start()` produces hands of size 7 each and talon of size 3; the 24-step sequence matches the FR-002 interleaved pattern (rounds 1–3: P1→P2→Dealer→Talon, rounds 4–7: P1→P2→Dealer — i.e., destination seat indices `1, 2, 0` for the player triples and `'talon'` after each opening-round triple); card ids are 0–23 and unique across all hands + talon
- [X] T035 [P] [US1] Create `tests/Round.bidding.test.js` — assert: initial `Round.currentHighBid === null` (per data-model.md); a bid of **100 is accepted as the first bid** (smallest legal bid is 100 when currentHighBid is null); 105 and 300 also accepted as first bids; **99, 107, 305 rejected** as first bids (below floor, not multiple of 5, above cap); after a bid of 100, a follow-up bid of 100 is **rejected** with reason (smallest legal is now 105); bids of 105 and 300 accepted after a prior 100; **once currentHighBid reaches 300, any further bid attempt is rejected** with reason and only Pass advances the turn (per FR-008 / Edge Cases — `U1`); pass adds sender to `passedBidders` and they are skipped on rotation; all-three-pass yields dealer-at-100 per FR-011 (server sets `currentHighBid = 100` at this transition); one-bidder-remains yields that seat as declarer at the last accepted bid per FR-010
- [X] T036 [P] [US1] Create `tests/Round.gating.test.js` — assert: `submitBid` from a non-`currentTurnSeat` returns `{ rejected:true }` with reason; bid sent during `phase==='dealing'` is processed only after the implicit `advanceFromDealingToBidding`; bid after the round resolves (declarer set) is rejected
- [X] T037 [P] [US1] Create `tests/Round.ratelimit.test.js` — drive `RoundActionHandler.handleBid` with two messages within 250 ms from the same player; assert: second is silently dropped (no broadcast, no `action_rejected`) per FR-030
- [X] T038 [P] [US1] Create `tests/round-messages.test.js` — using `ConnectionManager` + fake WS triplet: 3rd `join` triggers a `round_started` to each player with per-viewer identities (own seat + talon only); a `bid` message produces `bid_accepted` + `phase_changed` broadcasts to all 3; an invalid `bid` produces `action_rejected` to the sender only; a `join_game` arriving against a game whose status is already `in-progress` is rejected with a `game_join_failed` reason (FR-020). **Synchrony assertions** (SC-001 / SC-008 footnotes): (a) the 3rd-join admit path invokes `store.startRound` **synchronously** in the same call stack as `_admitPlayerToGame` (no `setTimeout` / `Antlion.schedule` / queueMicrotask deferral) — verified by stubbing `startRound` and asserting it was called before the admit returns; (b) every successful `Round` action (`submitBid`, `submitPass`, `startGame`, `startSelling`, `commitSellSelection`, `cancelSelling`, `submitSellBid`, `submitSellPass`) results in a `phase_changed` broadcast to all 3 players within the same synchronous tick — verified by capturing the fake-WS send log and asserting the broadcast lands before the handler's call frame returns.
- [X] T039 [P] [US1] Create `tests/HandView.test.js` — using `jsdom`: assert `HandView.setHand` produces a left-to-right DOM order matching the FR-005 sort (♣ first, then ♠, then ♥, then ♦; ascending 9, 10, J, Q, K, A within each suit); a follow-up `setHand` with different contents re-sorts
- [X] T040 [P] [US1] Create `tests/BidControls.test.js` — using `jsdom`: the wire view-model carries `currentHighBid: number | null`. With `currentHighBid = null` (no bid yet) the derived `smallestLegalBid = 100` and the field initialises to **100**; with `currentHighBid = 100` (a bid of 100 has been accepted) `smallestLegalBid = 105` and the field initialises to **105**; with `currentHighBid = 295`, `smallestLegalBid = 300` and the field initialises to 300 (`+5` clamps); with `currentHighBid = 300` the cap is hit, `smallestLegalBid = 305 > 300`, and the **numeric input, both steppers, and Bid are all disabled — only Pass remains operable** (per FR-028 / Edge Cases `U1`); the stepper clamps to `[smallestLegalBid, 300]` in steps of 5; typing 107 keeps the value but disables Bid; typing 200 enables Bid (when valid); Pass remains clickable in every state

**Checkpoint**: US1 is fully demoable. Three browser tabs auto-start a game, watch the deal, and resolve bidding to a declarer. The MVP slice is shippable without US2 or US3.

---

## Phase 4: User Story 2 — Declarer Takes the Talon and Chooses Start (Priority: P2)

**Goal**: After bidding, the talon flies into the declarer's hand (now 10 cards); the declarer sees Sell + Start; pressing Start emits `play_phase_ready`, the server deletes the game record, and all three clients render a RoundReady screen with a Back-to-Lobby button. Disconnect handling and reconnect snapshots arrive in this phase too (FR-021, FR-027, FR-032).

**Independent Test**: From a state where bidding has just resolved (reached by replaying US1's flow in the test fixture), the declarer sees 10 cards and exactly two buttons (Sell, Start). Opponents see "Waiting for declarer…" and an empty talon. Pressing Start emits `play_phase_ready`; all 3 clients render the RoundReady screen; the server has deleted the game record; pressing Back-to-Lobby returns each player to the lobby individually.

### Round + handler logic for US2

- [X] T041 [US2] Implement the bidding→post-bid-decision transition in `src/services/Round.js` — fold into the resolution sites added in T024 and T025: transfer the 3 talon card ids into `hands[declarerSeat]` (now 10), set `talon=[]`, set `phase='post-bid-decision'`, set `currentTurnSeat=declarerSeat`; return a side-effect descriptor (talon ids, identities) that `RoundActionHandler` uses to build the `talon_absorbed` broadcast per FR-012
- [X] T042 [US2] Implement `Round.startGame(seat)` in `src/services/Round.js` — validate `seat === declarerSeat` AND `phase === 'post-bid-decision'`; idempotent for duplicate clicks per FR-026 (return a "no-op, already transitioning" marker for the second call); set `phase='play-phase-ready'`; return `{ declarerId, finalBid: currentHighBid }`
- [X] T043 [US2] Implement `RoundActionHandler.handleStartGame(playerId)` in `src/controllers/RoundActionHandler.js` — throttle; call `round.startGame`; if the call returns the no-op marker from T042 (duplicate Start from the same declarer per FR-026 idempotency), **return early without re-broadcasting and without re-invoking cleanup**; on first accept broadcast `play_phase_ready { declarerId, finalBid, gameStatus }` to all 3 players, then call the cleanup helper `store._cleanupRound(gameId)` per FR-032 (null gameIds, delete `games[gameId]`, broadcast `lobby_update`). The cleanup helper itself MUST be idempotent (already-deleted record = silent noop), so a late second click that races past the throttle still cannot crash.
- [X] T044 [US2] Add the `talon_absorbed` broadcast site inside `src/controllers/RoundActionHandler.js` — fired immediately after a bid/pass resolution returns the bidding-resolved descriptor from T041; payload per `contracts/ws-messages.md` (talonIds for all; `identities` map included **only** for the declarer recipient per FR-022/FR-023); followed by a `phase_changed` to the new `Declarer deciding` phase

### Disconnect & reconnect surface (FR-021, FR-027)

- [X] T045 [US2] Add disconnect hooks in `src/services/Round.js` — `markDisconnected(seat)` (set `pausedByDisconnect=true` iff `seat === currentTurnSeat`; add to disconnected set used in `getViewModelFor`); `markReconnected(seat)` (remove + clear `pausedByDisconnect` iff this was the active player); `abort(abortedByNickname)` (set `phase='aborted'`)
- [X] T046 [US2] Wire disconnect/reconnect into `src/services/ThousandStore.js` — extend the existing feature-003 grace-period flow so that during an `in-progress` game, on disconnect call `round.markDisconnected(seat)` and broadcast `player_disconnected { playerId, gameStatus }` to the remaining 2 players (FR-021); on reconnect-within-grace call `round.markReconnected(seat)` and broadcast `player_reconnected`; on grace **expiry** call `round.abort(nickname)`, broadcast `round_aborted { reason:'player_grace_expired', disconnectedNickname, gameStatus }` to the 2 remaining players, then `_cleanupRound(gameId)` per FR-032. The broadcast covers **both** FR-021 (a) active-player-disconnect grace-expiry and (b) non-active-player-disconnect grace-expiry — applied symmetrically.
- [X] T047 [US2] Implement `Round.getSnapshotFor(seat)` in `src/services/Round.js` — build `round_state_snapshot` payload per `contracts/ws-messages.md` and the visibility table in `data-model.md`: `myHand` with identities, `talon` with identities **iff** `phase ∈ { 'dealing', 'bidding' }`, `exposed` with identities **iff** `phase === 'selling-bidding'` (US3 will exercise this branch), `opponentHandSizes` map, id-only `talonIds` / `exposedSellCardIds`, plus the full view-model and `seats` block

### Frontend for US2

- [X] T048 [P] [US2] Create `src/public/js/thousand/DeclarerDecisionControls.js` — two-button row (Sell / Start) shown only on the declarer's client per FR-026; rendering rules: original declarer with `attemptCount < 3` → **both operable**; original declarer with `attemptCount === 3` → Sell **disabled**, Start operable (FR-018); new declarer after a successful sale → Sell **hidden**, Start operable (FR-017); Start wired to `RoundActionDispatcher.sendStartGame`; Sell wired to `RoundActionDispatcher.sendSellStart` (entry into `selling-selection` per the `sell_start` message)
- [X] T049 [P] [US2] Create `src/public/js/thousand/RoundReadyScreen.js` — full-screen take-over with a heading, a body message ("Round ready to play — next phase coming soon" for the normal handoff per FR-019, OR "Round aborted — {disconnectedNickname} did not reconnect" for the abort variant per FR-021), and a single Back-to-Lobby button; constructor takes a `{ mode: 'ready' | 'aborted', context }` config where `context = { declarerNickname, finalBid }` for `mode:'ready'` and `context = { disconnectedNickname }` for `mode:'aborted'`; the status bar stays visible above showing `Round ready to play` or `Round aborted` per FR-025
- [X] T050 [US2] Wire `talon_absorbed` handler in `src/public/js/core/ThousandApp.js` — animate the 3 talon `CardSprite`s from `TalonView` slots to the declarer's hand region using `Antlion.onTick`-driven motion; for opponents, cards animate face-up the entire flight and flip to face-back at landing per the FR-024 clarification; on animation complete, **opponents delete those 3 ids from `cardsById`** per FR-023; declarer's `HandView` receives the 3 new identities and re-sorts per FR-005
- [X] T051 [US2] Wire `DeclarerDecisionControls` into `src/public/js/thousand/GameScreen.js` — mount on `phase === 'Declarer deciding'` for the declarer only; opponents instead see a `<div class="waiting">Waiting for {declarer.nickname}…</div>` slot
- [X] T052 [US2] Wire `play_phase_ready` and `round_aborted` handlers in `src/public/js/core/ThousandApp.js` — both swap the visible screen from `GameScreen` to `RoundReadyScreen` (different mode); Back-to-Lobby uses local navigation only (no server round-trip — the game record is already gone per FR-032)
- [X] T053 [US2] Wire `player_disconnected` and `player_reconnected` handlers in `src/public/js/core/ThousandApp.js` — call `GameScreen.updateStatus` so `StatusBar` re-renders the disconnected-players list and the per-seat `OpponentView` toggles its "Connection lost…" indicator (FR-021, FR-025)
- [X] T054 [US2] Wire `round_state_snapshot` handler in `src/public/js/core/ThousandApp.js` — call `GameScreen.init` with a snapshot adapter that rebuilds `cardsById` from `myHand` + optional `talon` + optional `exposed`, sets opponent hand sizes from `opponentHandSizes`, and renders the layout **immediately, with no animation** per FR-027

### Tests for US2

- [X] T055 [P] [US2] Create `tests/Round.disconnect.test.js` — assert: (a) `markDisconnected(currentTurnSeat)` pauses action-acceptance and any incoming action is rejected; (b) `markDisconnected(non-active-seat)` does not pause; the remaining live players' on-turn actions still succeed; (c1) **active-player** grace expiry triggers `round_aborted { reason:'player_grace_expired', disconnectedNickname }` broadcast and game-record deletion per FR-032; (c2) **non-active-player** grace expiry ALSO triggers `round_aborted` (same `reason`, with the non-active player's nickname) — verifying FR-021's "If the grace period expires before reconnection, the round MUST be aborted" applies symmetrically to (a) and (b); (d) `getSnapshotFor` post-cleanup is never called (game record gone); a `hello` arriving after cleanup returns `restored:true, gameId:null`; (e) **FR-031 × FR-021 toast surface**: while `pausedByDisconnect=true`, an action submitted by a still-connected non-active player is rejected and produces a single `action_rejected` toast to *only* the submitting player (never broadcast); no `phase_changed` is emitted; the round state is unchanged on reconnect.
- [X] T056 [P] [US2] Extend `tests/round-messages.test.js` with US2 cases — after bidding resolves: `talon_absorbed` is broadcast with declarer-only identities; a Start-the-Game `start_game` from the declarer produces `play_phase_ready` to all 3 + `lobby_update` broadcast + `games[gameId]` is `undefined`; a Start from a non-declarer is rejected with `action_rejected`
- [X] T057 [P] [US2] Create `tests/GameScreen.gating.test.js` — using `jsdom`: assert the FR-026 hidden-vs-disabled matrix for the `Declarer deciding` phase (declarer sees Sell + Start operable when attemptCount<3; opponents render no Sell/Start at all); also asserts the original-declarer-3-fails branch (Sell disabled, Start operable) once US3 lands
- [X] T058 [P] [US2] Create `tests/StatusBar.test.js` initial cases — render `Dealing`, `Bidding`, `Declarer deciding`, `Round ready to play`, `Round aborted` view-models and assert the rendered text matches FR-025 (active player framing, current high bid, declarer label, disconnected-players list); the Selling/sellAttempt cases are added in US3

**Checkpoint**: US2 ships a complete round path without selling. Three tabs auto-start, deal, bid, declarer takes talon, presses Start, all return to lobby. Disconnect handling produces visible "Connection lost…" indicators and round-aborts on grace expiry.

---

## Phase 5: User Story 3 — Selling the Bid (Priority: P3)

**Goal**: The declarer may attempt to sell up to 3 times by exposing 3 cards in the centre. Opponents bid clockwise to buy or pass; a buy swaps roles (new declarer takes the 3 cards at the new bid); two passes return the cards and increment the attempt counter; 3 failed attempts disable Sell and only Start remains.

**Independent Test**: From a state where the declarer has 10 cards at a bid of 120 (reached by replaying US1+US2's flow), the declarer presses Sell, taps 3 cards (Sell-confirm enables only at 3), and presses Sell. Both opponents see the 3 face-up cards in the centre and bid/pass controls. If opponent A bids 125 and opponent B passes, A becomes the new declarer with 10 cards at bid 125, the original declarer holds 7, and the selling phase ends. The new declarer's post-bid-decision state shows **only Start the Game** (Sell hidden); pressing Start emits the same `play_phase_ready` as US2.

### Round + handler logic for US3

- [X] T059 [US3] Implement `Round.startSelling(seat)` in `src/services/Round.js` — invoked by `RoundActionHandler.handleSellStart` when the declarer's client sends `sell_start`; validate `seat === declarerSeat`, `phase === 'post-bid-decision'`, sender is the **original** declarer (no current `attemptHistory` entry with `outcome:'sold'`), `attemptCount < 3`; set `phase='selling-selection'`
- [X] T060 [US3] Implement `Round.cancelSelling(seat)` in `src/services/Round.js` — validate `seat === declarerSeat`, `phase === 'selling-selection'`; set `phase='post-bid-decision'`; `attemptCount` unchanged (FR-029)
- [X] T061 [US3] Implement `Round.commitSellSelection(seat, cardIds)` in `src/services/Round.js` — validate per FR-029 (exactly 3 distinct ids; each currently in `hands[declarerSeat]`; the set differs from every prior `attemptHistory[].exposedIds` this round, per FR-016/FR-018); transfer those ids from `hands[declarerSeat]` (now 7) into `exposedSellCards` (length 3); set `phase='selling-bidding'`; set `currentTurnSeat` to the seat clockwise-left of the declarer (FR-015, paralleling FR-004); clear `passedSellOpponents`; `currentHighBid` keeps the opening bid (so the first overbid must be ≥ original + 5 per FR-015)
- [X] T062 [US3] Implement `Round.submitSellBid(seat, amount)` in `src/services/Round.js` — validate sender ∉ `{ declarerSeat }` (FR-015 excludes original declarer); standard FR-008 bid validation; rotate `currentTurnSeat` to the next non-passed non-declarer opponent
- [X] T063 [US3] Implement `Round.submitSellPass(seat)` in `src/services/Round.js` — validate phase, sender ≠ declarer; add to `passedSellOpponents`; **resolve outcomes per FR-016 / FR-017**:
  - both opponents passed without ever bidding → outcome `'returned'`: move `exposedSellCards` back into `hands[declarerSeat]` (back to 10), `attemptCount += 1`, append `attemptHistory[]`, transition `phase='post-bid-decision'`. The `'returned'` value is what the server stores in `attemptHistory[].outcome` AND what is broadcast in `sell_resolved.outcome` (no internal-to-wire rename).
  - one opponent passed AND the other has bid at least once → outcome `'sold'`: buyer becomes new `declarerSeat`, hand sizes swap (new declarer 10, old declarer 7), `currentHighBid` already updated to the winning sell bid, append `attemptHistory[]` with `outcome:'sold'`, transition `phase='post-bid-decision'`
- [X] T064 [US3] Extend `Round.getViewModelFor(seat)` in `src/services/Round.js` for selling phases — `phase` label `'Selling'` in both `selling-selection` and `selling-bidding`; `sellAttempt = attemptCount + 1` (1-based per FR-025) during Selling and during the post-bid-decision state immediately after a failed attempt (`null` everywhere else); `passedPlayers` reflects `passedSellOpponents` during `selling-bidding` (the bidders-pass list during `bidding`)
- [X] T065 [US3] Implement the five Selling action handlers in `src/controllers/RoundActionHandler.js` — `handleSellStart` (throttle; call `round.startSelling(seat)` per T059; on accept broadcast `sell_started { gameStatus }` to all 3 followed by `phase_changed` to `Selling` (selection sub-state); no card movement yet); `handleSellSelect` (pre-condition `phase === 'selling-selection'`; validate per FR-029 — exactly 3 distinct cardIds, in-hand, differ from prior attempts; transfer ids to `exposedSellCards`, transition to `selling-bidding`, broadcast `sell_exposed { exposedIds, identities }` to all 3 with identities included for **every** recipient per FR-022; followed by `phase_changed`); `handleSellCancel` (validate then `phase_changed` back to `Declarer deciding`); `handleSellBid` (broadcast `bid_accepted` + `phase_changed`); `handleSellPass` (broadcast `pass_accepted` + on resolution `sell_resolved { outcome, oldDeclarerId, newDeclarerId?, exposedIds, gameStatus }` per `contracts/ws-messages.md` — per-viewer payload drops identities on the losing-visibility recipients per FR-023)

### Frontend for US3

- [X] T066 [P] [US3] Create `src/public/js/thousand/SellSelectionControls.js` per FR-029 — tap-to-toggle on the declarer's own hand cards (via `Antlion.bindInput`); on-screen `Selected: N / 3` counter; Sell button enabled **only** when `N === 3`; Cancel always operable; opponents render nothing here (selection affordance is hidden per FR-026); on Sell, calls `RoundActionDispatcher.sendSellSelect(selectedIds)`
- [X] T067 [P] [US3] Create `src/public/js/thousand/SellBidControls.js` — opponent's buy controls reusing the `BidControls` shape (numeric field + ±5 stepper + Bid + Pass per FR-028); initial value = `currentHighBid + 5`; rendering rules per FR-026 (active opponent operable; the not-yet-passed waiting opponent disabled; passed opponent hidden; original declarer hidden); wires to `sendSellBid` / `sendSellPass`
- [X] T068 [US3] Extend `src/public/js/thousand/HandView.js` to support selection mode — `setSelectionMode(true)` enables tap-to-toggle behaviour, surfaces `getSelected()` and emits a `selectionchanged` engine event (`Antlion.emit`) consumed by `SellSelectionControls`; mode reset on `phase` change
- [X] T069 [US3] Wire the Sell flow into `src/public/js/thousand/GameScreen.js` — on `phase_changed` to `Selling` and `selling-selection` sub-state, mount `SellSelectionControls` for the declarer and put `HandView` in selection mode; on `sell_exposed`, mount `SellBidControls` for the non-declarer opponents per the FR-026 matrix; on `sell_resolved`, unmount Selling controls and return to the appropriate `Declarer deciding` rendering (the new declarer or original declarer with updated attempt counter)
- [X] T070 [US3] Wire `sell_started` handler in `src/public/js/core/ThousandApp.js` — `GameScreen.updateStatus(msg.gameStatus)` (no card movement yet; this message just transitions the UI into selection mode)
- [X] T071 [US3] Wire `sell_exposed` handler in `src/public/js/core/ThousandApp.js` — animate the 3 selected sprites from the declarer's hand region to the centre `TalonView`/centre slot; identities are present for all 3 recipients (FR-022) so all clients flip the sprites face-up at landing
- [X] T072 [US3] Wire `sell_resolved` handler in `src/public/js/core/ThousandApp.js` — animate the 3 centre sprites either back to the old declarer's hand (`outcome:'returned'`) or to the new declarer's hand (`outcome:'sold'`); per FR-024 they animate face-up for the entire motion and flip to face-back at landing for any recipient who is **about to lose visibility**; on animation complete, drop those ids from `cardsById` per FR-023 on every viewer except the new card-owner; receiving hand re-sorts per FR-005

### Tests for US3

- [X] T073 [P] [US3] Create `tests/Round.selling.test.js` — assert: `commitSellSelection` rejects when the set duplicates a prior attempt (FR-016); rejects when any id is not in the declarer's hand or set has duplicates (FR-029); `submitSellBid` from the declarer is rejected per FR-015; opponent rotation starts clockwise-left of the declarer per FR-015 (paralleling FR-004); on a sale, hand sizes swap and `declarerSeat` updates; on two passes without any bids, cards return and `attemptCount` increments; after 3 failed attempts the original declarer's `startSelling` is rejected
- [X] T074 [P] [US3] Create `tests/SellSelectionControls.test.js` — using `jsdom`: Sell button disabled at 0, 1, 2, 4, 5 selected; enabled at exactly 3; Cancel always clickable; declarer's `HandView` taps toggle selection state visible in the DOM
- [X] T075 [P] [US3] Extend `tests/StatusBar.test.js` with Selling cases — `phase: 'Selling'` with `sellAttempt: 1`, `2`, `3`; passed-opponents chip during `selling-bidding`; transition back to `Declarer deciding` after a failed attempt still shows the attempt counter; after 3 fails the bar drops `sellAttempt` to `null` once `phase` moves to `Round ready to play`
- [X] T076 [P] [US3] Extend `tests/round-messages.test.js` with selling end-to-end — `sell_select` valid produces `sell_started` + `sell_exposed` (identities for all 3 recipients) + `phase_changed`; `sell_bid` produces `bid_accepted`; final `sell_pass` produces `sell_resolved` with `outcome: 'returned'` when both opponents passed and `outcome: 'sold'` when one bought; per-recipient identity drops on the losing-visibility recipients are observable in the message payload

**Checkpoint**: US3 ships the selling phase. All three priorities are independently testable and shippable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T077 [P] Validate the implementation against `specs/004-game-round-bidding-selling/quickstart.md` by walking the 16-step 3-browser-tab manual verification; record any deviations as new tasks or specs
- [ ] T078 [P] Measure `src/services/Round.js` line count after all three stories land; if > 150 lines per R-001 in `plan.md`, extract phase-transition helpers into `src/services/RoundPhases.js` and/or the dealing-sequence logic into `src/services/DealSequencer.js`, leaving a one-line comment in `Round.js` documenting the decomposition
- [ ] T079 [P] Profile the deal animation on the slowest target device (R-002): ensure `CardSprite.setPosition` short-circuits when the target equals the current position; cache table-slot DOM references; eliminate per-tick layout reads
- [ ] T080 Run `.specify/scripts/powershell/update-agent-context.ps1` to refresh `CLAUDE.md` with the new active technologies and feature files
- [ ] T081 Run `npm run lint && npm test && npm run test:coverage`; confirm overall coverage is ≥ 90 % per the constitution; address any gaps surfaced by the new feature

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — T001 can start immediately
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**
- **US1 (Phase 3)**: depends on Foundational completion only
- **US2 (Phase 4)**: depends on Foundational completion only (the bidding-resolution call-site referenced by T041 is left as a clear TODO in T024/T025 when US1 lands first, so US2 can also be picked up by a different developer in parallel with US1)
- **US3 (Phase 5)**: depends on Foundational and on US2's `post-bid-decision` state existing (T041, T042) — US3 builds on top of the declarer-deciding state
- **Polish (Phase 6)**: depends on whichever stories are in scope for the release

### Story dependencies

- **US1** is the smallest end-to-end slice (MVP). It can ship on its own without US2/US3 if `start_game` is stubbed to broadcast a placeholder.
- **US2** can be developed in parallel with US1 but must merge after T024/T025 land. US2 makes the round end cleanly with cleanup.
- **US3** requires US2's `post-bid-decision` transition. It is an additive overlay; US2 still works without US3 (the declarer just doesn't have Sell available — or sees Sell disabled).

### Within each story

- Round-level methods + handlers come before the frontend controls that call them.
- Tests for a story land in the same phase as the production code; they should be runnable as soon as the matching code is in place.

### Parallel opportunities

- All `[P]`-marked Foundational frontend primitives (T010–T016) can be built in parallel — independent files, no cross-dependencies.
- All `[P]`-marked test files inside a story can be written in parallel once the production code lands.
- The three user stories themselves can be staffed in parallel once Foundational is complete (US3 will rebase on US2's merge before its handler integration lands).

---

## Parallel Example: Foundational frontend primitives

```bash
# After T002-T009 land, launch the visual primitives in parallel:
Task: "Create CardSprite class in src/public/js/thousand/CardSprite.js"        # T010
Task: "Create CardTable class in src/public/js/thousand/CardTable.js"          # T011
Task: "Create StatusBar class in src/public/js/thousand/StatusBar.js"          # T012
Task: "Create HandView class in src/public/js/thousand/HandView.js"            # T013
Task: "Create OpponentView class in src/public/js/thousand/OpponentView.js"    # T014
Task: "Create TalonView class in src/public/js/thousand/TalonView.js"          # T015
Task: "Create RoundActionDispatcher in src/public/js/thousand/RoundActionDispatcher.js"  # T016
```

## Parallel Example: US1 tests

```bash
# Once T021-T033 are merged, all US1 test files are independent:
Task: "Tests in tests/Round.deal.test.js"          # T034
Task: "Tests in tests/Round.bidding.test.js"       # T035
Task: "Tests in tests/Round.gating.test.js"        # T036
Task: "Tests in tests/Round.ratelimit.test.js"     # T037
Task: "Tests in tests/round-messages.test.js"      # T038
Task: "Tests in tests/HandView.test.js"            # T039
Task: "Tests in tests/BidControls.test.js"         # T040
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Complete Phase 1 (T001)
2. Complete Phase 2 (T002–T020) — backend scaffold + frontend primitives
3. Complete Phase 3 (T021–T040) — US1
4. **STOP and VALIDATE**: three browser tabs, watch the deal, watch bidding resolve to a declarer
5. Demo / ship MVP. (`start_game` and the declarer-deciding screen are stubs; this is acceptable for the MVP if the demo ends at "declarer determined".)

### Incremental delivery

1. Setup + Foundational → foundation ready
2. US1 → MVP ships
3. US2 → declarer can finish the round; lobby cleanup works; disconnect handling visible
4. US3 → selling phase bolted on; each demo adds depth without breaking the previous level
5. Polish → R-001/R-002 follow-ups; quickstart validation; coverage gate

### Parallel team strategy

With multiple developers:

1. Together: Setup + Foundational (one developer per file pair; all Foundational frontend primitives are `[P]`)
2. After Foundational lands:
   - Dev A: US1 (Round dealing + bidding + DealAnimation + BidControls + tests)
   - Dev B: US2 (post-bid-decision + StartGame + RoundReady + disconnect/reconnect + tests)
   - Dev C: US3 (selling state machine + SellSelection + SellBid + tests) — rebases on US2 after merge
3. Each story ships its own PR with its own tests; Polish wraps the release.

---

## Notes

- `[P]` = different file, no incomplete-task dependency.
- `[Story]` labels are required for tasks in the US1/US2/US3 phases and omitted everywhere else.
- Verify tests fail before implementing the production code that satisfies them.
- Commit after each task or logical group; the repository's existing pre-commit `lint` + `test` hook is the safety net.
- Stop at every checkpoint to validate the story independently.
- Avoid: cross-story dependencies that would prevent shipping US1 alone; same-file [P] conflicts; speculative scope creep beyond the FRs in `spec.md`.
