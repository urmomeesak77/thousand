# thousand Development Guidelines

Last updated: 2026-05-13

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
  ThousandStore.js                     # game/player state (in-memory)
  ConnectionManager.js                 # WebSocket connection lifecycle + message dispatch
  Round.js                             # round lifecycle: deal → bid → declarer → sell → play
  RoundPhases.js                       # phase constants
  Deck.js                              # deck creation and shuffle
  DealSequencer.js                     # async deal animation sequencing
src/controllers/
  RequestHandler.js                    # HTTP routing
  GameController.js                    # game CRUD handlers
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
      CardTable.js                     # shared card table layout
      CardSprite.js                    # individual card rendering
      HandView.js                      # player's hand of cards
      OpponentView.js                  # opponent hand stubs
      TalonView.js                     # talon/widow card display
      StatusBar.js                     # round status line
      BidControls.js                   # bidding-phase action buttons
      DeclarerDecisionControls.js      # declarer take/give controls
      RoundReadyScreen.js              # waiting screen before play starts
      SellBidControls.js               # sell-phase bid entry
      SellSelectionControls.js         # sell-phase card selection
      DealAnimation.js                 # deal card animation sequencer
      RoundActionDispatcher.js         # client-side round action dispatch
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

**004-game-round-bidding-selling** (complete through selling phase): Implements the full round lifecycle — dealing, bidding, declarer decision, selling — with server-side `Round.js` driving phase transitions and a full frontend UI under `src/public/js/thousand/`. Branch 003 (persistent player identity) is fully merged in.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/004-game-round-bidding-selling/plan.md`.
<!-- SPECKIT END -->
