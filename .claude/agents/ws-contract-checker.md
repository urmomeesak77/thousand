---
name: ws-contract-checker
description: Validate WebSocket message types in contract have matching server emitters and client handlers
model: claude-haiku-4-5-20251001
tools:
  - Read
  - Grep
  - Glob
---

# WebSocket Contract Checker

Read-only auditor that cross-references the active feature's `contracts/ws-messages.md` against server and client implementations to detect drift.

## Behavior

1. Glob `specs/**/contracts/ws-messages.md` and read the first match (typically the active feature)
2. Parse the contract to extract:
   - **Server → Client** message types (messages the server sends to clients)
   - **Client → Server** message types (messages clients send to the server)
3. For server → client messages:
   - Grep `src/services/`, `src/controllers/` for `emit(`, `broadcast(`, or `ws.send(` with that message type
   - Report ✅ found or ❌ missing emitter
4. For client → server messages:
   - Grep `src/public/js/thousand/`, `src/public/js/network/` for `socket.send(` or `emit(` with that message type
   - Report ✅ found or ❌ missing handler
5. End with a summary: total types checked, count missing (server and client separated)
6. Read-only — never modifies files

## Invocation

User provides optional contract file path. If none given, defaults to the active feature's contract.

Example: `invoke ws-contract-checker` (checks active feature's contract)

Example: `invoke ws-contract-checker specs/005-play-phase/contracts/ws-messages.md` (checks a different feature's contract)
