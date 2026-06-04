# Implementation Plan: AI Opponents (Bots)

**Branch**: `009-ai-opponents` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/009-ai-opponents/spec.md`

## Summary

Let a host fill empty seats in the waiting room with server-side bots so a short-handed
table can start and play to completion. A bot is modelled as an ordinary seated player
with `isBot: true` and **no WebSocket** — every existing broadcast (`sendToPlayer`) already
no-ops for socketless players, and the disconnect/grace lifecycle never touches a player
that never connected. Bots reuse the *entire* existing round/scoring/variant engine
unchanged; the only new behaviour is (a) host endpoints to add/remove a bot before start,
and (b) a server-side driver that, whenever it becomes a bot's turn, waits a randomized
1–3 s then submits one legal action through the **same** `RoundActionHandler` methods a
human's WebSocket message would invoke. Decision logic is the smart-bot strategy currently
living in `tests/e2e-live-smart.js`, ported from DOM-scraping to authoritative round state.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS backend); Vanilla JS ES6+ (frontend, ES modules)
**Primary Dependencies**: `ws` ^8 (existing); Node built-in `crypto`, `setTimeout`. No new deps.
**Storage**: In-memory (`ThousandStore` / `PlayerRegistry`) — bots are registry entries; not persisted.
**Testing**: Node.js built-in test runner (`*.test.js`); existing `tests/e2e-live-smart.js` for live verification.
**Target Platform**: Node server + browser clients (responsive: mobile/tablet/desktop).
**Project Type**: Web application (single backend + static vanilla-JS frontend).
**Performance Goals**: Bot turn latency = randomized ~1–3 s (FR-009); no added stalls (SC-006).
**Constraints**: Constitution §I (no new deps, no build step), §IX (small units), §XI (frontend timers via Antlion — N/A to server-side bot timers).
**Scale/Scope**: 3- or 4-seat tables; ≤ (requiredPlayers − 1) bots per table; ≥1 human always present.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| I. Stack / IV. Thin server / V. No build step | ✅ Server-side bots in plain Node; no new dependencies, no transpilation. |
| II. Single-file frontend / VI. Responsive | ✅ Only additive waiting-room badge + host add/remove controls; styled with existing media-query patterns. |
| III. Simplicity First | ✅ Reuses the full engine and the existing **auto-start-when-full** path; no new game rules; ports existing strategy rather than inventing one. |
| VII. Classes over functions / VIII. One class per file | ✅ New `BotTurnDriver` and `BotStrategy` classes (one per file); pure card-evaluation helpers as a functions module (feature-specific pure utilities, permitted by §VII/§X). |
| IX. Small units | ✅ Strategy decomposed into per-phase deciders (~≤20 lines each) + small pure helpers; driver kept ≤100 lines by delegating decisions to `BotStrategy`. |
| X. Logical cohesion | ✅ Bot code lives under `src/services/bots/`; turn-trigger hook lives on the store/handler where turn state already changes. |
| XI. Frontend logic via Antlion | ✅ Bot timers are **server-side** (not subject to §XI). New client buttons register via `Antlion.bindInput`; no raw DOM listeners. |
| Testing ≥90% coverage / §XII built-in tools | ✅ Unit tests for strategy + driver + endpoints; no new CLI tools. |

**Result: PASS — no violations. Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/009-ai-opponents/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── http-bot-management.md      # add/remove bot REST endpoints
│   ├── bot-action-mapping.md       # phase → RoundActionHandler call the bot makes
│   └── serialized-player.md        # isBot field added to player view-models
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/services/
  bots/
    BotStrategy.js          # NEW — decides one action for (round, seat); ports e2e-live-smart logic; bidding scaled by per-bot aggressiveness (FR-016/FR-017)
    botStrategyHelpers.js   # NEW — pure card-evaluation utilities (rankStrength, cardBeats, estimateMakeable, findMarriages, pickCard…)
    BotTurnDriver.js        # NEW — detects a bot's pending turn, schedules randomized 1–3 s timer, executes one action via RoundActionHandler
    botNames.js             # NEW — themed unique bot-name pool + picker ("Robo-Ada", …)
    botConstants.js         # NEW — MAX_TALON_GAMBLE (≈30) and any bot-specific numeric constants
  PlayerRegistry.js         # EDIT — createBot(nickname) → { isBot:true, sockets:Set(), aggressiveness:random∈[0,1] }; serializePlayers includes isBot
  ThousandStore.js          # EDIT — addBot/removeBot; purge bots on game delete/disband; "no human left" cleanup (FR-014); invoke driver after turn-changing broadcasts
  ConnectionLifecycle.js    # (verify) bots are skipped — they never disconnect; no change expected
src/controllers/
  GameController.js         # EDIT — handleAddBot / handleRemoveBot (host-only, waiting, not-full); reuse fill→startRound path
  RequestHandler.js         # EDIT — routes: POST /api/games/:id/bots, DELETE /api/games/:id/bots/:botId
  RoundActionHandler.js     # (reused unchanged) bot actions invoke its existing methods with the bot's playerId
src/public/js/
  network/GameApi.js        # EDIT — addBot(gameId) / removeBot(gameId, botId)
  screens/WaitingRoom.js    # EDIT — render seats with bot badge; host-only Add Bot / Remove controls (Antlion-bound)
  core/ThousandApp.js | LobbyBinder.js  # EDIT — wire add/remove actions
src/public/css/index.css    # EDIT — bot badge + control styles (responsive)
tests/
  BotStrategy.test.js       # NEW — incl. aggressiveness bid monotonicity + upper-bound (SC-007, FR-016/017)
  BotTurnDriver.test.js     # NEW
  GameController.bots.test.js  # NEW (add/remove, host-only, full/already-started guards)
  ThousandStore.bots.test.js   # NEW (auto-start on fill, no-human cleanup, bot purge)
```

**Structure Decision**: Single web-app layout (constitution file structure). All bot
*decision and scheduling* logic is backend, isolated under `src/services/bots/`. Frontend
changes are limited to the waiting room (badge + host controls) and the API client.

## Complexity Tracking

> No constitution violations — section intentionally empty.
