# thousand Development Guidelines

Last updated: 2026-05-20


> Architectural principles are governed by `.specify/memory/constitution.md`, which supersedes this file on matters of principle.

## Active Technologies
- **Runtime**: Node.js v18+ (CommonJS backend) / Vanilla JS ES6+ (frontend, ES modules)
- **Dependencies**: `ws` ^8 (WebSocket), Node.js built-in `crypto` (session tokens)
- **State**: In-memory server state (`ThousandStore`) + browser `localStorage` (client identity)
- **Dev tools**: ESLint, `jsdom` (tests), Node.js built-in test runner

## Project Structure

```text
src/server.js                          # HTTP + WebSocket server entry point
src/services/
  ThousandStore.js                     # game/player state (in-memory) — delegates player Map to PlayerRegistry, disconnect/reconnect to ConnectionLifecycle
  PlayerRegistry.js                    # players Map + sessionToken index (extracted from ThousandStore)
  ConnectionLifecycle.js               # disconnect grace timers, reconnect (last-connect-wins), grace-expiry purge (extracted from ThousandStore)
  ConnectionManager.js                 # WebSocket connection lifecycle + message dispatch
  Round.js                             # round state machine & action methods
  RoundPhases.js                       # phase-transition helpers (extracted from Round for size)
  DealSequencer.js                     # deal-sequence computation (extracted from Round for size)
  RoundSnapshot.js                     # per-viewer view-model, seats, snapshot payload (extracted from Round for size)
  TrickPlay.js                         # trick-play state machine (lead/follow/trump, collected tricks) — delegated to by Round
  Scoring.js                           # pure scoring functions (card points, round deltas, winner, final results)
  RoundActionBroadcaster.js            # result-emission + round-end scoring for in-round actions (extracted from RoundActionHandler)
  Game.js                              # persists-across-rounds session: cumulative scores, dealer, barrel/zero state, round history
  GameRules.js                         # numeric rule constants (barrel thresholds, victory threshold, special penalty)
  Seats.js                             # seat-range helpers (`seatRange`, `initSeatMap`) used by the playerCount generalization
  Deck.js                              # deck creation and shuffle
  bots/                                # server-side AI opponents (features 009 + 010)
    BotStrategy.js                     # decides one legal action per (round, seat); bidding scaled by per-bot aggressiveness (FR-016/017); routes trick play through trickPlanner and selling through sellEvaluator; uses recalled-gone knowledge to cash boss cards
    botStrategyHelpers.js              # pure card-evaluation utilities (ported from tests/e2e-live-smart.js); includes boss-card / remaining-beaters helpers
    trickPlanner.js                    # competent trick play — chooseLead/chooseFollow (boss-card cashing, draw trumps, win/duck point tricks, marriage timing) + chooseCrawlCard (ace-less declarer's face-down opening card: weighted-random toward higher ranks, never a marriage K/Q)
    sellEvaluator.js                   # take-vs-sell, buy-vs-pass, and which cards to expose when selling
    BotMemory.js                       # per-bot imperfect, decaying per-round card memory (Fourier low-pass recall model + deterministic per-card draw) → recalled-gone card set (feature 010)
    BotTurnDriver.js                   # detects a bot's pending turn, schedules a randomized 1–3 s timer, builds the bot's recalled-gone set via BotMemory, executes one action via RoundActionHandler
    botNames.js                        # themed unique bot-name pool + picker ("Robo-Ada", …)
    botConstants.js                    # bid range + MAX_TALON_GAMBLE (bot-specific numeric constants)
src/controllers/
  RequestHandler.js                    # HTTP routing
  GameController.js                    # game CRUD handlers
  NicknameController.js                # POST /api/nickname handler
  nicknameLookup.js                    # `isNicknameTaken()` helper
  RoundActionHandler.js                # in-round action dispatch (auction actions + shared plumbing); delegates trick-play to TrickPlayActionHandler, emit/scoring to RoundActionBroadcaster
  TrickPlayActionHandler.js            # bypass-the-limiter trick-play actions (start-game, exchange pass, four-nines ack, play card, crawl commit) — extracted from RoundActionHandler
  validators.js                        # input validation
src/utils/
  HttpUtil.js                          # HTTP helpers
  RateLimiter.js                       # per-IP rate limiting
  StaticServer.js                      # static file serving
src/public/
  index.html / css/index.css           # lobby entry point + lobby/waiting-room styles
  css/game.css                         # in-round game-screen styles (split out of index.css)
  css/cards.css                        # card sprite / card-table styling
  js/
    index.js                           # bootstrap — creates ThousandApp, starts Antlion
    core/
      ThousandApp.js                   # app coordinator — state + orchestration
      ThousandMessageRouter.js         # server→client message routing (extracted from ThousandApp)
      LobbyBinder.js                   # binds lobby-screen events to app/socket
    network/
      ThousandSocket.js                # WebSocket wrapper
      GameApi.js                       # REST API client
    screens/
      NicknameScreen.js                # nickname entry screen
      GameList.js                      # game list component
      WaitingRoom.js                   # waiting room screen
    overlays/
      NewGameModal.js                  # new game creation modal
      PlayerTooltip.js                 # player hover tooltip
      Toast.js                         # notification utility
      ReconnectOverlay.js              # reconnect overlay
    storage/
      IdentityStore.js                 # session token storage
      MutePreferenceStore.js           # localStorage boolean mirror of the mute choice (`thousand_muted`), best-effort try/catch (feature 011)
    utils/HtmlUtil.js                  # DOM helpers
    antlion/                           # engine layer — generic, game-agnostic
    thousand/                          # game-specific UI components
      GameScreen.js                    # root game screen; owns all sub-views
      GameScreenControls.js            # mounts/unmounts phase-appropriate control widgets (extracted from GameScreen)
      SellPhaseView.js                 # sell-phase sub-state + selection/expose animation (extracted from GameScreen)
      CardTable.js                     # shared card table layout
      CardSprite.js                    # individual card rendering
      HandView.js                      # player's hand of cards
      OpponentView.js                  # opponent hand stubs
      TalonView.js                     # talon/widow card display
      StatusBar.js                     # fixed top status bar (FR-025)
      GameStatusBox.js                 # status label rendered above the talon
      statusText.js                    # `computeStatusText()` — phase/turn label helper
      BiddingControls.js               # shared base class for BidControls + SellBidControls (FR-028)
      BidControls.js                   # main-bidding controls (extends BiddingControls)
      SellBidControls.js               # selling-bidding controls (extends BiddingControls)
      DeclarerDecisionControls.js      # declarer take/give controls
      SellSelectionControls.js         # sell-phase card selection
      RoundReadyScreen.js              # round-ready / round-aborted handoff screen
      DealAnimation.js                 # deal card animation sequencer
      RoundActionDispatcher.js         # client-side round action dispatch
      cardSymbols.js                   # `SUIT_LETTER` constants
      constants.js                     # bid/round + scoring constants (MIN_BID, MAX_BID, BID_STEP, CARD_POINT_VALUE, MARRIAGE_BONUS, RANK_ORDER)
      CardExchangeView.js              # card-exchange phase UI (declarer passes 1 card to each opponent)
      TrickPlayView.js                 # trick-play phase UI (centre slot, follow-suit gating, trick animations)
      CardFlightAnimator.js            # FLIP-style card-flight clone animation + source/dest rect geometry (extracted from TrickPlayView)
      MarriageDeclarationPrompt.js     # marriage-declaration modal (tricks 2–6)
      CollectedTricksStack.js          # per-seat face-down collected-tricks stack + count badge
      RoundSummaryScreen.js            # round summary (made/missed, deltas) + Continue / Back-to-Lobby
      FinalResultsScreen.js            # final ranking + per-round history table at victory
      ScoreboardPanel.js               # always-available top-right live scoreboard (collapsible); hosts the mute toggle next to the rules icon
      SoundManager.js                  # preloads + plays the three one-shot cues; subscribes to Antlion `sound:card|flip|turn`; no-op when muted (feature 011)
      MuteButton.js                    # binds every `.mute-btn`, toggles mute, reflects state via icon/aria-pressed/title (feature 011)
      roundStatsText.js                # `formatRoundStats()` — per-seat "Tricks N, Points M" label
tests/                                 # Node.js built-in test runner (*.test.js)
specs/                                 # feature specs, plans, and contracts (read-only at runtime)
docs/                                  # developer documentation
```

A `playerCount` parameter (3 or 4) is threaded through the engine
(`Game` / `Round` / `TrickPlay` / `Scoring` / `RoundSnapshot` / `DealSequencer` / `Deck`)
to support the 3- and 4-player variants (feature 008). Seat-range derivation lives in
`src/services/Seats.js`.

## Commands

```bash
npm start              # start server (port 3000 or $PORT)
npm run dev            # start with --watch (auto-restart on file changes)
npm test               # run all tests
npm run test:coverage  # run tests with experimental coverage report
npm run lint           # ESLint check on src/
```

## Code Style

See `docs/CODING_CONVENTIONS.md` for the full reference. Key points:
- Indent 2 spaces; semicolons required; `const` by default
- `camelCase` functions/variables, `PascalCase` classes, `UPPER_SNAKE_CASE` constants
- Max 50-line functions; early returns over nesting; no `var`
- Comments explain *why*, never *what*; no debug logs committed

## Frontend Architecture (see constitution.md §XI for rationale)

**Applies to all frontend JS.**

### Antlion engine API surface (`src/public/js/antlion/`)
- `Antlion.onInput(type, handler)` — register a named input handler
- `Antlion.onTick(handler)` — register a per-tick callback
- `Antlion.emit(type, data)` — dispatch an engine-level event
- `Antlion.bindInput(element, domEvent, type)` — wire a DOM event to a named engine input
- `Antlion.schedule(delay, cb)` / `Antlion.cancelScheduled(id)` — managed `setTimeout`
- `Antlion.scheduleInterval(delay, cb)` / `Antlion.cancelInterval(id)` — managed `setInterval`
- `Antlion.start()` / `Antlion.stop()` — lifecycle control (stop also tears down all timers and listeners)

### Feature modules (`src/public/js/`)
- Register into Antlion via the API above — no direct DOM listeners, no raw `setInterval`.
- `core/ThousandApp.js` is the app coordinator; `network/ThousandSocket.js` wraps the WebSocket connection.
- Game-specific UI lives under `src/public/js/thousand/`; `GameScreen.js` is the root component.

## Feature Status

Features 001–010 have all landed on `master` (the full game is playable end-to-end against humans and bots; 1070 tests pass). Briefly, in order:

- **001 card-game-lobby**, **002 antlion-engine**, **003 persistent-identity**, **004 round/bidding/selling** — lobby, engine layer, reconnect identity, and the auction/sell phases.
- **005 play-phase-scoring** — the full gameplay loop: card exchange, 8-trick play with follow-suit/trump/marriages, made/missed scoring, multi-round flow with dealer rotation and cumulative carry-over, victory at 1000+, and special scoring (barrel + three-consecutive-zeros). Added the persists-across-rounds `Game.js`, the `TrickPlay.js` state machine, pure-function `Scoring.js`, and `GameRules.js`; frontend gained `CardExchangeView`, `TrickPlayView`, `MarriageDeclarationPrompt`, `CollectedTricksStack`, `RoundSummaryScreen`, `FinalResultsScreen`.
- **006 four-nines-bonus**, **007 crawling** — the +100 four-nines bonus (with a 5-second auto-acknowledge) and the no-ace face-down "crawl" first trick.
- **008 four-player-variant** — the 3-/4-player generalization (`playerCount` threaded through the engine; `Seats.js`).
- **009 ai-opponents** + **010 bot-card-memory** — server-side bots under `src/services/bots/` (host adds/removes them in the waiting room): competent bidding/selling/trick play plus an imperfect, decaying per-round card memory (`BotMemory.js`).
- **011 sound-effects** — three one-shot in-game cues routed through the Antlion bus (`sound:card|flip|turn`): card-handling on every card movement, flip on every face-up reveal, turn on every active-player change. A `SoundManager` plays cloned preloaded `Audio` (no-op when muted); a `MuteButton` next to the rules icon toggles all sound; `MutePreferenceStore` persists the choice in `localStorage` (default unmuted).
- **012 history-panel** — a bottom-left collapsible log of game events. Server-authoritative: a session-scoped `GameHistory` (`src/services/GameHistory.js`, owned by `Game`) records bids/passes/marriages/trick wins/round scores/special scoring at the action-resolution sites (`RoundActionHandler`, `TrickPlayActionHandler`, `RoundActionBroadcaster`, `Game`); the full ordered log ships on every snapshot as `gameStatus.actionHistory` (`RoundSnapshot.buildViewModel`), so reconnecting/late players see the identical log (no new WS message type). Frontend `HistoryPanel.js` (mounted by `GameScreen`, mirrors `ScoreboardPanel`) renders entries chat-style (newest at the bottom, auto-scroll) via the pure `historyEntryText.js` formatter, keeps a fixed footprint with an inner scrollbar, and persists its collapsed/expanded choice in `localStorage` (`thousand_history_open`) with a responsive default.

Post-feature UI enhancements (no separate spec dir — design/plan docs live under `docs/superpowers/`): collapsible live scoreboard (`ScoreboardPanel.js` + `scoreHistory`), per-seat round-stats label (`roundStatsText.js` + `roundPoints`), the trump-suit box (`TrumpBox.js`), a rules modal, lobby logout, and multi-tab single-player support.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/012-history-panel/plan.md`.
<!-- SPECKIT END -->
