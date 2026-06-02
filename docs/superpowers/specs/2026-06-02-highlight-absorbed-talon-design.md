# Highlight absorbed talon cards in the declarer's hand

**Date:** 2026-06-02
**Status:** Design approved

## Problem

When the declarer wins the bid, the 3 talon cards are absorbed into their hand
(`SellPhaseView.absorbTalon`, `src/public/js/thousand/SellPhaseView.js:146`). The
cards are folded into `cardsById` and the hand is rebuilt with
`setHand(Object.values(cardsById))`, which re-sorts the 10 cards. At that point the
3 newly gained cards are visually indistinguishable from the original 7, so the
declarer cannot tell which cards came from the talon while deciding take/give.

## Goal

Highlight the 3 absorbed talon cards in the declarer's hand so they stand out,
and keep the highlight until the declarer takes an action — specifically, until
they press **Sell** or **Start the Game** (the take/give decision).

## Scope

- **Declarer's own view only.** Non-declarers never receive the talon identities
  (the ids are deleted from `cardsById` on absorb), so there is nothing to
  highlight for them.
- **Live-only.** The highlight is driven by the live `talon_absorbed` event. The
  server snapshot does not record which 3 cards came from the talon, so a declarer
  who disconnects/reconnects during the decision phase loses the highlight. This is
  an accepted limitation for a transient nicety; reconnect support is explicitly
  out of scope (see Out of Scope).

## Design

### 1. `HandView` — persistent per-id highlight

Mirror the existing `_disabledIds` pattern, which already survives `setHand()`
re-sorts because it is applied by card id in `_render()`:

- Add field `_talonIds = new Set()`.
- `setTalonHighlight(ids)` — replace the set with `new Set(ids)` and re-render.
- `clearTalonHighlight()` — no-op if empty; otherwise clear the set and re-render.
- In `_render()`, add class `hand-view__card--from-talon` to any card whose id is
  in `_talonIds`.

`setHand()` must NOT clear `_talonIds` (same as `_disabledIds`) — the highlight is
seeded right after a `setHand()` and the only thing that clears it is the decision.

### 2. `SellPhaseView.absorbTalon()` — seed the highlight

In the `viewerIsDeclarer` branch, after `gs._handView.setHand(...)`, call
`gs._handView.setTalonHighlight(talonIds)`. The non-declarer branch is untouched.

### 3. Clear seam — `DeclarerDecisionControls` + `GameScreenControls`

- `DeclarerDecisionControls` gains a 4th constructor argument `onDecision` (a
  callback). It is invoked inside both the Sell click handler and the Start click
  handler, immediately before the dispatch call. Guard clauses (`_mode` checks)
  still apply — `onDecision` only fires when the click actually dispatches.
- `GameScreenControls._mountDeclarer` constructs `DeclarerDecisionControls` with
  `() => this._handView.clearTalonHighlight()` as `onDecision`.

This keeps `DeclarerDecisionControls` decoupled from `HandView` — it only knows it
should signal "a decision was made."

### 4. CSS — `game.css`

`.hand-view__card--from-talon`: a warm-gold glow with a gentle pulse, distinct from
the blue `--arriving` flash and the green `--selected` ring.

```css
.hand-view__card--from-talon {
  box-shadow: 0 0 10px 3px rgba(245, 197, 66, 0.7);
  animation: talon-pulse 1.6s ease-in-out infinite;
}

@keyframes talon-pulse {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(245, 197, 66, 0.5); }
  50%      { box-shadow: 0 0 14px 5px rgba(245, 197, 66, 0.85); }
}
```

The pulse is slow (1.6s) so it draws the eye without feeling busy while the
declarer decides. The highlight must layer cleanly with `--selected` /
`--disabled` if those are applied to the same card (box-shadow on the talon class,
transform/ring on the others — they do not conflict).

## Testing

- **`HandView` unit test** (`tests/`): assert `hand-view__card--from-talon` is
  applied to exactly the ids passed to `setTalonHighlight`, that it survives a
  subsequent `setHand()` re-sort, and that `clearTalonHighlight()` removes it.
- The `SellPhaseView` → `DeclarerDecisionControls` wiring is exercised by the
  existing live e2e flow (declarer wins bid → decides). No new e2e required.

## Out of Scope

- **Reconnect survival.** Would require tracking the absorbed-talon ids on `Round`
  and exposing them in `RoundSnapshot` (plus a contract change). Deferred.
- Highlighting on the non-declarer views (they have no talon identities).
- Per-card clearing as cards are passed during exchange — the decision press clears
  all three at once, per the approved trigger.
