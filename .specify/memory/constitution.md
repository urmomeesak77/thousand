# Thousand Constitution

## Core Principles

### I. Stack
Frontend: Vanilla JS, HTML, CSS — no frameworks, no build tools. Backend: Node.js — no TypeScript, no transpilation. Open files directly or serve via Node's built-in `http` module.

### II. Single-File Frontend
Each game page is a single `.html` file. No inline CSS or JS. No bundlers, no imports, no CDN dependencies.

### III. Simplicity First
Write the least code that works. No abstractions for future requirements. No utility libraries unless a feature genuinely needs them.

### IV. Backend as Thin Server
Node.js backend.

### V. No Build Step
What ships is what you wrote. No compilation, no minification, no transpilation in the hot path.

### VI. Responsive Design
Every page must be usable on mobile, tablet, and desktop. Use CSS media queries and relative units — no fixed-width layouts. Touch targets must be large enough for finger use.

### VII. Classes Over Functions
Prefer ES6 classes over standalone functions for encapsulating state and behaviour. Use functions only for pure utilities with no associated state.

### VIII. One Class Per File
Every class lives in its own file named after the class (e.g. `LobbyManager` → `src/LobbyManager.js`). No file may export more than one class.

### IX. Small Units
Keep classes and functions small and focused. A class should represent a single concept; a function should do one thing. If a function grows beyond ~20 lines or a class beyond ~100 lines, treat that as a signal to decompose.

### X. Logical Cohesion
Place functions where they belong logically — methods that operate on a class's data belong on that class; pure utilities that are feature-specific belong in the feature module, not a generic `utils` file.

### XI. All Frontend Logic Goes Through Antlion
The Antlion engine is the single entry point for all frontend behaviour. This covers: the game loop, all input/event registration, key bindings, timed callbacks, and render cycles. No frontend module — lobby or game — may call `addEventListener`, `setInterval`, `setTimeout`, or `requestAnimationFrame` directly. Layer 1 — the engine (`src/public/js/antlion/`) — owns these primitives and exposes them via its API. Layer 2 — feature modules (`src/public/js/<feature-name>/`) — register behaviour exclusively via the engine API. The engine never references feature modules; feature modules never bypass the engine.

**Antlion engine API:**
- `Antlion.onInput(type, handler)` — register a named input handler
- `Antlion.onTick(handler)` — register a per-tick callback
- `Antlion.emit(type, data)` — dispatch an engine-level event
- `Antlion.bindInput(element, domEvent, type)` — wire a DOM element's native event to a named engine input event
- `Antlion.schedule(delay, cb)` — schedule a delayed callback (replaces direct `setTimeout`)
- `Antlion.start()` / `Antlion.stop()` — lifecycle control

**Feature module rules:**
- Register all behaviour via the API above — no direct DOM listeners, no raw `setInterval`.
- Game-specific logic lives under `src/public/js/thousand/`.

## File Structure

```text
src/server.js                        # single backend entry point (http + ws upgrade)
src/controllers/
  RequestHandler.js                  # routes all HTTP requests
src/services/
  LobbyStore.js                      # all in-memory game state + WS connection handling
src/utils/
  HttpUtil.js                        # shared HTTP response helpers
  StaticServer.js                    # serves src/public/ as static files
src/public/                          # frontend assets
  index.html / index.css / index.js  # lobby entry point (uses Antlion — see §XI)
  js/
    antlion/                         # engine layer — generic, game-agnostic (§XI)
      EventBus.js                    # subscribe/emit for named engine events
      Antlion.js                     # lifecycle, input capture, tick loop, scheduling
    LobbyApp.js                      # lobby coordinator — state + orchestration
    LobbyRenderer.js                 # lobby stateless DOM rendering
    LobbySocket.js                   # lobby WebSocket wrapper
    GameApi.js                       # all HTTP calls to the game API
    ModalController.js               # new-game modal open/close/submit
    Toast.js                         # shared notification utility
    <game-name>/                     # game logic layer — one directory per game (§XI)
tests/                               # test files (*.test.js) — both backend and frontend
specs/                               # feature specs, plans, and contracts (read-only at runtime)
```

## Tech Stack

- **Frontend**: HTML5, CSS3 (inline), Vanilla JS (ES6+)
- **Backend**: Node.js (CommonJS), raw `http` module
- **Data**: In-memory or flat JSON files — no database unless explicitly added
- **Testing**: Both frontend and backend, minimum 90% coverage

## Development Workflow

- Edit files directly; refresh browser to test frontend
- Run `npm start` (`node src/server.js`) to start backend
- ESLint (`npm run lint`) and `npm test` run via pre-commit hook and GitHub Actions CI

## Governance

This constitution supersedes CLAUDE.md for architectural decisions. Keep it minimal — only amend when a new constraint is truly project-wide.

**Version**: 2.1.0 | **Ratified**: 2026-04-14 | **Last Amended**: 2026-04-14
