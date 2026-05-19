# Trick Winner Hold — Reorder Resolve Sequence

**Date:** 2026-05-19
**Branch:** 005-play-phase-scoring
**Scope:** Frontend-only timing change in `TrickPlayView`.

## Problem

After the 3rd card of a trick lands, the current sequence is:

1. Brief ~350 ms pause with cards in center.
2. Cards fly to the winner's stack.
3. Status box shows "X won the trick" for 5 s with the center already empty.
4. Controls unlock; next trick begins.

The 5 s winner announcement is disconnected from the cards — by the time the
player reads who won, the cards have already flown away. The "hold" feels like
dead time rather than a celebration of the resolved trick.

## Desired Behavior

After the 3rd card lands:

1. Status box immediately shows "X won the trick".
2. **5 s hold** with the three played cards still sitting in the center slots
   and controls locked.
3. Cards fly to the winner's stack (existing collect-flight, ~500 ms).
4. Center clears, controls unlock. Whatever the server sends next (next-trick
   `gameStatus` or round-summary message) renders normally — including the
   final trick of the round.

## Affected Code

Single file: `src/public/js/thousand/TrickPlayView.js`.

### Constants

| Constant | Before | After |
|----------|--------|-------|
| `RESOLVE_PAUSE_MS` | 350 (used as pre-flight pause) | removed |
| `TRICK_WINNER_HOLD_MS` | 5000 (post-flight hold) | 5000 (pre-flight hold) |
| `FLIGHT_MS` | 500 | 500 (unchanged) |

### `_handleTrickResolve(winnerSeat)` — new sequence

1. If the 3rd card came from an opponent and is not yet committed, run its
   play-to-center flight (existing branch). Track `extraPauseMs = FLIGHT_MS`
   so the hold begins only after that card has landed.
2. Lock controls, set `_resolveFinalized = false`, remember `_pendingWinnerSeat`.
3. Call `setStatusOverride(\`${nickname} won the trick\`, TRICK_WINNER_HOLD_MS + FLIGHT_MS)`
   so the message persists through both hold and flight.
4. Schedule a single Antlion timer at `extraPauseMs + TRICK_WINNER_HOLD_MS`
   that fires `_collectFlightToWinner(winnerSeat)`.
5. Keep the rAF-throttle safety net: schedule a fallback at
   `extraPauseMs + TRICK_WINNER_HOLD_MS + FLIGHT_MS + 200` that calls
   `_finalizeTrickResolve()` in case the flight never reports onLand
   (background tab, throttled rAF).

### `_finalizeTrickResolve()` — simplified

The status-override + post-flight schedule logic moves to
`_handleTrickResolve`. `_finalizeTrickResolve` now:

1. Idempotency guard (`_resolveFinalized`).
2. Clear center cards.
3. Unlock controls.

No more nickname lookup or override re-application here.

## Last-Trick Parity

No special-case code. The server already drives the post-flight transition:

- Non-final trick → next `gameStatus` arrives; `TrickPlayView` renders the new
  state once controls unlock.
- Final trick → round-summary message arrives; `GameScreen` swaps to
  `RoundSummaryScreen`.

Both flow naturally after `_finalizeTrickResolve` unlocks controls.

## Tests

- Existing collect-flight test (`tests/...trick-collect-flight*.test.js`)
  asserts on flight destination, not timing — should pass unchanged.
- If any test asserts on the 350 ms pause or on cards being cleared before the
  5 s window, update it to match the new sequence.
- Add a focused test: after 3rd-card render, `_centerCards` still contains all
  three cards while controls are locked and the override is active; flight
  starts after the hold; finalize clears center.

## Non-Goals

- No new overlay UI in the center — reuse existing `setStatusOverride` /
  `GameStatusBox` (user choice).
- No change to server-side trick resolution or scoring.
- No change to the play-to-center flight for the first two cards of a trick.
