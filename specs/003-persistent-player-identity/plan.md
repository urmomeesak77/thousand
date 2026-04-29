# Implementation Plan: Persistent Player Identity

**Branch**: `003-persistent-player-identity` | **Date**: 2026-04-29 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/003-persistent-player-identity/spec.md`

## Summary

Add browser-scoped persistent identity using localStorage (playerId + sessionToken) sent to the server on every WS connection via a `hello` handshake. Server validates credentials: match within grace period → restore player record and game membership; mismatch or expired → fresh identity. Grace period (default 30 s) keeps disconnected players' records alive for reconnect, then purges them.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS) / Vanilla JS ES6+ (browser)  
**Primary Dependencies**: `ws` npm package, Node.js built-in `crypto` (already in use)  
**Storage**: In-memory server state + browser `localStorage` (client)  
**Testing**: Node.js built-in `--test` runner (`*.test.js`); `jsdom` available for frontend tests; minimum 90% coverage  
**Target Platform**: Node.js server + modern browser (ES6+)  
**Project Type**: Web application (lobby + real-time game)  
**Performance Goals**: Reconnect completes within 2 seconds (SC-001)  
**Constraints**: In-memory only — identity lost on server restart (acceptable); no DB  
**Scale/Scope**: Small LAN/shared gaming context (<100 concurrent players)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| §   | Principle               | Status    | Notes |
|-----|-------------------------|-----------|-------|
| §I  | Vanilla JS + Node.js    | ✓ PASS    | No new dependencies; `crypto` built-in already in use |
| §II | Single-file frontend    | ✓ PASS    | Modifying existing files; no new pages |
| §III | Least code             | ✓ PASS    | Built-in `crypto.randomUUID()` for tokens; no new libs |
| §IV | Backend as thin server  | ✓ PASS    | Session logic lives in `ThousandStore` (service layer) |
| §V  | No build step           | ✓ PASS    | Plain `.js` files; no transpilation |
| §VI | Responsive design       | ✓ PASS    | Reconnecting overlay uses existing CSS patterns |
| §VII | Classes over functions | ✓ PASS    | `IdentityStore`, `ReconnectOverlay` as ES6 classes |
| §VIII | One class per file    | ✓ PASS    | New classes in their own files |
| §IX | Small units             | ✓ PASS    | Each new class <100 lines; each method <20 lines |
| §X  | Logical cohesion        | ✓ PASS    | Session validation in `ThousandStore`; localStorage in `IdentityStore` |
| §XI | Frontend through Antlion | ✓ PASS   | WS property assignments acceptable in socket wrapper; localStorage calls not DOM events; overlay control driven by `_handleMessage` in `ThousandApp` |

No gate violations.

**Post-design re-check**: See research.md and data-model.md — no new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/003-persistent-player-identity/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ws-messages.md   # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code

```text
# New files
src/public/js/IdentityStore.js        # localStorage wrapper — read/write/clear client identity
src/public/js/ReconnectOverlay.js     # reconnecting overlay class — show/hide

# Modified files
src/services/ThousandStore.js         # grace period timers, reconnectPlayer, createOrRestorePlayer
src/services/ConnectionManager.js     # hello handshake, deferred identity assignment
src/public/js/ThousandSocket.js       # send hello with stored creds on WS open
src/public/js/ThousandApp.js          # restored-state handling, overlay control, save identity
src/public/index.html                 # reconnecting overlay element
src/public/css/index.css              # reconnecting overlay styles

# New test files
tests/ThousandStore.reconnect.test.js # grace period, reconnect, expiry, last-connect-wins
tests/ConnectionManager.hello.test.js # hello handshake flow — new/restore/reject
tests/IdentityStore.test.js           # localStorage wrapper (jsdom)
```

**Structure Decision**: Single project (Option 1). Backend services in `src/services/`, frontend modules in `src/public/js/`, tests in `tests/`. Follows existing layout exactly.

## Complexity Tracking

*(No constitution violations — section not required)*

## Known Risks

| Risk | Detail | Mitigation |
|------|--------|------------|
| ThousandStore size (§IX signal) | `ThousandStore` is 165 lines before this feature; adding `createOrRestorePlayer`, `reconnectPlayer`, `_purgePlayer`, and grace timer config pushes it to ~220 lines. §IX treats this as a signal to decompose ("a class should represent a single concept"). | Monitor during implementation. If the class exceeds ~220 lines or becomes hard to read, extract session-lifecycle methods (`createOrRestorePlayer`, `reconnectPlayer`, `_purgePlayer`, `_gracePeriodMs`) into a `PlayerRegistry` class in `src/services/PlayerRegistry.js`. This is not required to ship the feature but should be the first refactor task if the file grows further. |
