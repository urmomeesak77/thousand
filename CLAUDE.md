# thousand Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-14

> Architectural principles are governed by `.specify/memory/constitution.md`, which supersedes this file on matters of principle.

## Active Technologies

- Node.js v18+ (CommonJS) / HTML5, Vanilla JS (ES6+) + `ws` npm package (WebSocket — genuinely needed for real-time lobby updates and future gameplay; no other external packages) (001-card-game-lobby)

## Project Structure

```text
src/server.js                        # single backend entry point
src/                                 # backend source code (all server-side modules)
src/public/                          # frontend assets
  index.html / index.css / index.js  # lobby entry point (pre-engine UI — no engine pattern)
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

## Frontend Architecture (see constitution.md §XI for rationale)

**Game pages only — lobby files are exempt.**

### Antlion engine API surface (`src/public/js/antlion/`)
- `Antlion.onInput(type, handler)` — register a named input handler
- `Antlion.onTick(handler)` — register a per-tick callback
- `Antlion.emit(type, data)` — dispatch an engine-level event
- `Antlion.start()` / `Antlion.stop()` — lifecycle control

### Game logic (`src/public/js/<game-name>/`)
- Registers into Antlion via the API above — no direct DOM listeners, no raw `setInterval`.

## Recent Changes

- 001-card-game-lobby: Added Node.js v18+ (CommonJS) / HTML5, Vanilla JS (ES6+) + `ws` npm package (WebSocket — genuinely needed for real-time lobby updates and future gameplay; no other external packages)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
