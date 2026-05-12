# thousand Development Guidelines

Last updated: 2026-05-12

> Architectural principles are governed by `.specify/memory/constitution.md`, which supersedes this file on matters of principle.

## Active Technologies
- Node.js v18+ (CommonJS server) / Vanilla JS ES6+ ES modules (browser) + `ws` ^8 (already in use), Node.js built-in `crypto` (for deck shuffle entropy); reuses existing `Antlion`, `Toast`, `RateLimiter`, `IdentityStore`, `ReconnectOverlay` (004-game-round-bidding-selling)
- In-memory only (`ThousandStore` already in-memory; round state attached as `game.round`); server restart aborts in-flight rounds (consistent with feature 003) (004-game-round-bidding-selling)

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
src/controllers/
  RequestHandler.js                    # HTTP routing
  GameController.js                    # game CRUD handlers
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
      ModalController.js               # modal dialogs
      PlayerTooltip.js                 # player hover tooltip
      Toast.js                         # notification utility
      ReconnectOverlay.js              # reconnect overlay (branch 003)
    storage/
      IdentityStore.js                 # session token storage (branch 003)
    utils/HtmlUtil.js                  # DOM helpers
    antlion/                           # engine layer — generic, game-agnostic
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
- Game-specific logic will live under `src/public/js/thousand/` (not yet created).

## Active Feature Branch

**003-persistent-player-identity** (in progress): Adds session tokens + `localStorage` so players survive page refreshes and short network disconnects. New files: `storage/IdentityStore.js`, `overlays/ReconnectOverlay.js`. Extends `ThousandStore`, `ConnectionManager`, `core/ThousandApp.js`, `network/ThousandSocket.js`. Grace period (default 30 s) keeps player records alive during disconnect.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/004-game-round-bidding-selling/plan.md`.
<!-- SPECKIT END -->
