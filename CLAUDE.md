# thousand Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-14

## Active Technologies

- Node.js v18+ (CommonJS) / HTML5, Vanilla JS (ES6+) + `ws` npm package (WebSocket — genuinely needed for real-time lobby updates and future gameplay; no other external packages) (001-card-game-lobby)

## Project Structure

```text
src/server.js                        # single backend entry point
src/                                 # backend source code (all server-side modules)
src/public/                          # frontend assets
  lobby.html / lobby.css / lobby.js  # lobby entry point (pre-engine UI — no engine pattern)
  js/
    LobbyApp.js                      # lobby coordinator — state + orchestration
    LobbyRenderer.js                 # lobby stateless DOM rendering
    LobbySocket.js                   # lobby WebSocket wrapper
    Toast.js                         # shared notification utility
    antlion/                         # engine layer — generic, game-agnostic
    <game-name>/                     # game logic layer — one directory per game
tests/                               # backend test files (*.test.js)
specs/                               # feature specs, plans, and contracts (read-only at runtime)
```

## Commands

# Add commands for Node.js v18+ (CommonJS) / HTML5, Vanilla JS (ES6+)

## Code Style

Node.js v18+ (CommonJS) / HTML5, Vanilla JS (ES6+): Follow standard conventions

## Frontend Architecture

**Applies to game pages only. Lobby files (`LobbyApp.js`, `LobbyRenderer.js`, `LobbySocket.js`) are pre-engine UI — do not apply this pattern to them.**

### Layer 1 — Engine (`src/public/js/antlion/`)
- Generic, game-agnostic runtime: game loop, input capture, event bus, render cycle.
- Zero game-specific logic. Exposes a registration API only.
- Key API surface (implement as needed):
  - `engine.onInput(type, handler)` — register a handler for a named input event
  - `engine.onTick(handler)` — register a per-frame/per-tick callback
  - `engine.emit(type, data)` — dispatch an engine-level event
  - `engine.start()` / `engine.stop()` — lifecycle control

### Layer 2 — Game Logic (`src/public/js/<game-name>/`)
- Game-specific: rules, state transitions, win conditions, UI wiring.
- Plugs into the engine via the registration API only.
- One directory per game (e.g., `src/public/js/thousand/`).

### Hard rules
- Engine never imports or references any game-specific module.
- Game logic never attaches raw DOM input listeners or `setInterval` for game ticks directly — always registers via engine APIs.

## Recent Changes

- 001-card-game-lobby: Added Node.js v18+ (CommonJS) / HTML5, Vanilla JS (ES6+) + `ws` npm package (WebSocket — genuinely needed for real-time lobby updates and future gameplay; no other external packages)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
