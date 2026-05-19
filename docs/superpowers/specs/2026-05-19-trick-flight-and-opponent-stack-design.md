# Trick-Resolve Flight & Opponent Stack Sync — Design

**Date:** 2026-05-19
**Branch:** `005-play-phase-scoring`
**Scope:** Frontend animation polish + server view-model addition.

## Problem

1. When a trick resolves, the centre cards fly toward the winning seat's container element. Because the seat container is much wider than a card, `_spawnFlight`'s `scale = toRect.width / fromRect.width` is large and the cards balloon as they translate — visually they "zoom toward the viewer's face" rather than gather into the winner's pile.
2. Each opponent's face-down stack is sized at deal time (typically 7) and never decrements as they play cards during the trick-play phase. The stack count is only re-synced when a full `round_state_snapshot` arrives (e.g. on reconnect).

## Goals

- Trick-resolve animation visually conveys "winner collects the trick" by translating cards (at roughly constant size) to the winner's hand-stack area.
- Opponents' visible stacks match the server-authoritative hand size in real time during trick play.

## Non-Goals

- Replacing the `× N` collected-tricks tally with a new visible card-pile widget.
- Changing the centre-flight animation that runs when an opponent first plays a card mid-trick.
- Animating self-collected tricks into a separate pile (cards continue to be removed after the flight).

## Approach

### Server: `opponentHandSizes` joins `gameStatus`

`src/services/RoundSnapshot.js::buildViewModel` adds `opponentHandSizes` (a `{ [seat]: count }` map for the two non-self seats). Because `gameStatus` is the payload field carried by `card_played`, `phase_changed`, `bid_accepted`, `pass_accepted`, `talon_absorbed`, `trick_play_started`, `marriage_declared`, `trump_changed`, etc., every status-bearing message will now ship live opponent counts.

The existing top-level `opponentHandSizes` on `round_state_snapshot` payloads is preserved — it's still the source consumed by `initFromSnapshot` for the initial seat layout, and tests reference it. The new `gameStatus.opponentHandSizes` is the *live-update* channel after init.

### Client: `GameScreen.updateStatus` applies the counts

In `src/public/js/thousand/GameScreen.js::updateStatus`, when `gameStatus.opponentHandSizes` is present, call `setCardCount` on `_leftOpponent` / `_rightOpponent`. Apply only when seats are known (`this._seats != null`) so initial messages don't crash.

The dealing phase still drives the count via the deal-animation callback; the `updateStatus` path becomes the steady-state source during bidding/exchange/trick-play.

### Client: `TrickPlayView._collectFlightToWinner` targets a card-sized rect

New helper `_destRectForWinner(seat)` returns a card-sized `DOMRect`-like object positioned over the winner's stack area:

- **Self winner:** rightmost `[data-card-id]` element inside `HandView`; fall back to the hand row's centre with width clamped to one card.
- **Opponent winner:** the `.opponent-view__stack` element of the appropriate `OpponentView`; fall back to the seat container with width clamped to one card.

`_collectFlightToWinner` uses this rect as `toRect`. Because the destination width ≈ source card width, `_spawnFlight`'s scale calculation stays ≈ 1 — no zoom.

To make the fallback clamp work, `_spawnFlight` itself doesn't change; only the destination rect we hand it does. Cards are still removed on land (the flight clone disappears; the underlying centre slot is cleared by `_finalizeTrickResolve`).

### Tests

- `tests/RoundSnapshot.test.js` (or the relevant view-model test) — assert `gameStatus.opponentHandSizes` is present in the trick-play view model and tracks `round.hands[s].length` for non-self seats.
- A new client-side test (e.g. `tests/TrickPlayView.flight.test.js` using jsdom) — assert the collect-flight destination width matches a card, not the seat container width, given a stubbed `getSeatEl` and a populated `OpponentView`.

## Risks & Mitigations

- **Risk:** Existing tests rely on the top-level `opponentHandSizes` shape on `round_state_snapshot`. **Mitigation:** keep it in place; the change is additive.
- **Risk:** `gameStatus` consumers downstream may have validators rejecting unknown fields. **Mitigation:** `MESSAGE_VALIDATORS` in `ThousandMessageRouter` only asserts known fields, not exclusivity, so adding one is safe.
- **Risk:** Card-sized destination rect for self may land at an inconvenient hand position when the hand is empty. **Mitigation:** fall back to the hand row's centre with width = one card.

## File list

- `src/services/RoundSnapshot.js` — add `opponentHandSizes` to `buildViewModel`.
- `src/public/js/thousand/GameScreen.js` — apply counts from `gameStatus` in `updateStatus`.
- `src/public/js/thousand/TrickPlayView.js` — replace seat-container `toRect` with card-sized destination rect.
- `tests/` — view-model assertion + flight-destination assertion.
