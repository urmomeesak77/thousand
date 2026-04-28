# thousand Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-16

> Architectural principles are governed by `.specify/memory/constitution.md`, which supersedes this file on matters of principle.

## Active Technologies
- Node.js v18+ (CommonJS backend) / Vanilla JS ES6+ (frontend, ES modules) + `ws` npm package (backend WebSocket); no frontend dependencies (001-card-game-lobby)
- N/A (in-memory backend state) (001-card-game-lobby)

- Node.js v18+ (CommonJS) / HTML5, Vanilla JS (ES6+) + `ws` npm package (WebSocket — genuinely needed for real-time lobby updates and future gameplay; no other external packages) (001-card-game-lobby)

## Project Structure

```text
src/server.js                        # single backend entry point
src/                                 # backend source code (all server-side modules)
src/public/                          # frontend assets
  index.html / index.css / index.js  # lobby entry point (uses Antlion — see §XI)
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

**Applies to all frontend pages including lobby files.**

### Antlion engine API surface (`src/public/js/antlion/`)
- `Antlion.onInput(type, handler)` — register a named input handler
- `Antlion.onTick(handler)` — register a per-tick callback
- `Antlion.emit(type, data)` — dispatch an engine-level event
- `Antlion.bindInput(element, domEvent, type)` — wire a DOM event to a named engine input
- `Antlion.schedule(delay, cb)` / `Antlion.cancelScheduled(id)` — managed `setTimeout`
- `Antlion.scheduleInterval(delay, cb)` / `Antlion.cancelInterval(id)` — managed `setInterval`
- `Antlion.start()` / `Antlion.stop()` — lifecycle control (stop also tears down all timers and listeners)

### Feature logic (`src/public/js/<feature-name>/`)
- Registers into Antlion via the API above — no direct DOM listeners, no raw `setInterval`.
- Lobby modules (`LobbyApp.js`, `LobbyRenderer.js`, `LobbySocket.js`) follow this pattern.
- Game-specific logic lives under `src/public/js/thousand/`.

## Recent Changes
- 001-card-game-lobby: Added Node.js v18+ (CommonJS backend) / Vanilla JS ES6+ (frontend, ES modules) + `ws` npm package (backend WebSocket); no frontend dependencies

- 001-card-game-lobby: Added Node.js v18+ (CommonJS) / HTML5, Vanilla JS (ES6+) + `ws` npm package (WebSocket — genuinely needed for real-time lobby updates and future gameplay; no other external packages)

<!-- MANUAL ADDITIONS START -->

## Coding conventions
- check file docs/CODING_CONVENTIONS.md
<!-- MANUAL ADDITIONS END -->
