# Implementation Plan: Game History Panel

**Branch**: `012-history-panel` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/012-history-panel/spec.md`

## Summary

Add a collapsible history panel in the bottom-left corner of the game screen that shows a running, chronological log of game events — auction bids and passes, marriage declarations, trick winners, end-of-round per-player scores, and special scoring (four-nines bonus, barrel, three-zeros penalty). History is **server-authoritative**: the server records each event onto a session-scoped log (`GameHistory`, owned by `Game`) and ships it inside the existing `round_state_snapshot` view-model, so every player — including reconnecting/late-joining ones — sees the identical, complete log (FR-018/FR-019). The frontend `HistoryPanel` (a `src/public/js/thousand/` module, mounted by `GameScreen`, wired through Antlion like `ScoreboardPanel`) renders entries chat-style (newest at the bottom, auto-scroll), keeps a fixed footprint with an inner scrollbar, and persists its collapsed/expanded choice in `localStorage` with a responsive default.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS backend); Vanilla JS ES6+ ES modules (frontend)
**Primary Dependencies**: `ws` (WebSocket) — no new dependencies
**Storage**: In-memory server session state (`Game`/`ThousandStore`); browser `localStorage` for the view preference
**Testing**: Node.js built-in test runner (`node --test`), `jsdom` for DOM-facing units
**Target Platform**: Modern browsers (desktop/tablet/mobile) + Node server
**Project Type**: Web application (single backend + vanilla-JS frontend), existing structure
**Performance Goals**: New entry visible ≤1s after the action (SC-001); panel toggle reflects ≤1s (SC-006); fixed footprint with 50+ entries (SC-004)
**Constraints**: No frameworks, no build step (Constitution I/V); all frontend timers/DOM events via Antlion (Constitution XI); responsive (Constitution VI); one class per file, ≤~100-line classes / ≤~20-line functions (Constitution VIII/IX)
**Scale/Scope**: 3–4 players per game; a full game to 1000 points may accumulate a few hundred entries (uncapped, FR-019)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Stack (vanilla JS / Node, no frameworks) | PASS | Plain DOM panel + Node service; no new runtime deps. |
| II. Single-File Frontend (CSS/JS separate, ES modules) | PASS | New `HistoryPanel.js` ES module; styles added to `game.css`. |
| III. Simplicity First | PASS | Reuses snapshot transport + scoreboard/localStorage patterns; no new abstraction layer. |
| IV/V. Thin server / No build step | PASS | Server appends plain entry objects; no compilation. |
| VI. Responsive Design | PASS | Fixed-footprint panel, media-query responsive default state (FR-010a), touch-sized toggle. |
| VII. Classes Over Functions | PASS | `GameHistory` (server class), `HistoryPanel` (frontend class); pure helper for entry-text formatting. |
| VIII. One Class Per File | PASS | `src/services/GameHistory.js`, `src/public/js/thousand/HistoryPanel.js`. |
| IX. Small Units | PASS | Record methods are thin appends; render split into small private methods (mirrors `ScoreboardPanel`). |
| X. Logical Cohesion | PASS | Recording lives next to the resolution sites (action handler/broadcaster); formatting helper is feature-local. |
| XI. All Frontend Logic Through Antlion | PASS | Toggle uses `antlion.onInput` + `antlion.bindInput`; no direct `addEventListener`/timers (auto-scroll is a synchronous render step, not a timer). |
| XII. Built-in Tools Over Shell | PASS | No new CLI tools. |

**Result**: PASS — no violations, Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/012-history-panel/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── history-events.md  # entry schema + snapshot field contract
├── checklists/
│   └── requirements.md  # spec quality checklist (already present)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/services/
  GameHistory.js          # NEW — session-scoped, ordered, uncapped event log + record methods
  Game.js                 # MODIFY — own a GameHistory instance; reset on new game (constructor)
  RoundActionHandler.js   # MODIFY — record bid/pass on resolved auction actions
  TrickPlayActionHandler.js # MODIFY — record marriage declaration on resolved declare action
  RoundActionBroadcaster.js # MODIFY — record trick-win + round-score + special-scoring at resolution
  RoundSnapshot.js        # MODIFY — include actionHistory[] in buildViewModel (shared, server-authoritative)

src/public/js/thousand/
  HistoryPanel.js         # NEW — bottom-left collapsible, scrollable, chat-style panel (Antlion-wired)
  historyEntryText.js     # NEW — pure formatter: entry object → display string (feature-local helper)
  GameScreen.js           # MODIFY — mount HistoryPanel; call render(gameStatus.actionHistory, seats)

src/public/css/
  game.css                # MODIFY — .history-panel styles (bottom-left, fixed height, scroll, collapsed, responsive)

tests/
  GameHistory.test.js     # NEW — record/order/uncapped retention + reset
  history-recording.test.js # NEW — events recorded at correct resolution sites (bid/pass/trick/round/special)
  RoundSnapshot.history.test.js # NEW — actionHistory present + identical across viewers/reconnect
  HistoryPanel.test.js    # NEW — render order, empty state, collapse persistence, fixed footprint (jsdom)
  historyEntryText.test.js # NEW — formatter strings per entry kind / playerCount / unknown name
```

**Structure Decision**: Extend the existing web-app structure in place. A new server class `GameHistory` is owned by the per-game `Game` session (so the log lives exactly as long as the game and survives round rollover, FR-019). Events are recorded at the **action-resolution boundary** (`RoundActionHandler` / `TrickPlayActionHandler` / `RoundActionBroadcaster`) where the resolved outcome, the game/session, and player nicknames are all in hand — keeping `Round`/`TrickPlay` free of presentation concerns (Constitution X). The log is exposed on the existing per-viewer snapshot view-model as `actionHistory`, reusing the transport every other piece of game state already rides; no new WebSocket message type is introduced. The frontend `HistoryPanel` mirrors the proven `ScoreboardPanel` (Antlion-wired toggle, `localStorage` persistence, inner scroll container kept pinned to the bottom).

## Complexity Tracking

> No constitution violations — section intentionally empty.
