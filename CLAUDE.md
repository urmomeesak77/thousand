# thousand Development Guidelines

Last updated: 2026-05-14


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
  ThousandStore.js                     # game/player state (in-memory) — delegates player Map to PlayerRegistry
  PlayerRegistry.js                    # players Map + sessionToken index (extracted from ThousandStore)
  ConnectionManager.js                 # WebSocket connection lifecycle + message dispatch
  Round.js                             # round state machine & action methods
  RoundPhases.js                       # phase-transition helpers (extracted from Round for size)
  DealSequencer.js                     # deal-sequence computation (extracted from Round for size)
  RoundSnapshot.js                     # per-viewer view-model, seats, snapshot payload (extracted from Round for size)
  Deck.js                              # deck creation and shuffle
src/controllers/
  RequestHandler.js                    # HTTP routing
  GameController.js                    # game CRUD handlers
  NicknameController.js                # POST /api/nickname handler
  nicknameLookup.js                    # `isNicknameTaken()` helper
  RoundActionHandler.js                # in-round action dispatch (bid, pass, sell, etc.)
  validators.js                        # input validation
src/utils/
  HttpUtil.js                          # HTTP helpers
  RateLimiter.js                       # per-IP rate limiting
  StaticServer.js                      # static file serving
src/public/
  index.html / css/index.css           # lobby entry point + styles
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
      constants.js                     # bid/round numeric constants (MIN_BID, MAX_BID, BID_STEP)
tests/                                 # Node.js built-in test runner (*.test.js)
specs/                                 # feature specs, plans, and contracts (read-only at runtime)
docs/                                  # developer documentation
```

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

## Active Feature Branch

**004-game-round-bidding-selling** (feature complete; post-feature refactor pass landed): Implements the full round lifecycle — dealing, bidding, declarer decision, selling — with server-side `Round.js` driving phase transitions and a full frontend UI under `src/public/js/thousand/`. Branches 002 (Antlion engine) and 003 (persistent player identity) are fully merged in. The R-001 size-budget mitigation produced three Round extractions (`RoundPhases.js`, `DealSequencer.js`, `RoundSnapshot.js`) and three frontend extractions (`GameScreenControls.js`, `SellPhaseView.js`, shared-base `BiddingControls.js`).

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/004-game-round-bidding-selling/plan.md`.
<!-- SPECKIT END -->
