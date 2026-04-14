# Implementation Plan: Card Game 1000 — Lobby & Game Creation

**Branch**: `001-card-game-lobby` | **Date**: 2026-04-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-card-game-lobby/spec.md`

## Summary

Build a browser-based lobby for the card game 1000: players enter a nickname, see live-updating public game slots, can join one with a click, or create a private invite-only game and share a code with friends. Real-time lobby state is pushed via WebSocket. No accounts, no database, no build step — everything lives in Node.js + plain HTML/CSS/JS files.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS) / HTML5, Vanilla JS (ES6+)
**Primary Dependencies**: `ws` npm package (WebSocket — genuinely needed for real-time lobby updates and future gameplay; no other external packages)
**Storage**: In-memory (`Map` objects in server.js) — no files, no database
**Testing**: Both frontend and backend, minimu 90% coverage
**Target Platform**: Modern browser (desktop-first) + Node.js HTTP server
**Project Type**: Web application (static frontend served by Node.js backend)
**Performance Goals**: Lobby updates within 5 seconds; join flow under 60 seconds end-to-end
**Constraints**: No build step; no frameworks; CSS/JS as separate linked files per page (constitution II); responsive layout required — mobile, tablet, desktop (constitution VI)
**Scale/Scope**: Casual use, < 100 concurrent players initially

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Rule | Status |
|-----------|------|--------|
| I. Stack | Node.js backend, Vanilla JS/HTML/CSS frontend | PASS |
| II. Single-File Frontend | One `.html` per page, linked `.css` and `.js` (no bundlers, no CDN) | PASS |
| III. Simplicity First | In-memory Maps, no abstraction layers, direct server logic | PASS |
| IV. Backend as Thin Server | Node.js `http` + `ws` for WebSocket — `ws` justified by real-time requirement | PASS |
| V. No Build Step | Plain files, no compilation/transpilation | PASS |
| VI. Responsive Design | Lobby CSS uses media queries + relative units; touch-friendly targets | PASS |

**Post-Phase 1 re-check**: All principles maintained. `ws` is the single justified external dependency.

## Project Structure

### Documentation (this feature)

```text
specs/001-card-game-lobby/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   ├── http-api.md      ← Phase 1 output
│   └── websocket-messages.md  ← Phase 1 output
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
package.json
server.js              ← Node.js HTTP + WebSocket server (all backend logic)
public/
├── lobby.html         ← Lobby page shell
├── lobby.css          ← Lobby styles
└── lobby.js           ← Lobby client logic (WebSocket, DOM updates)
```

**Structure Decision**: Web application layout — Node.js serves static files from `public/` and handles WebSocket upgrades on the same port. All game state lives in server.js memory. No subdirectories needed for v1 (single lobby page + future game page).

## Complexity Tracking

No constitution violations — table not required.
