# Turn Reminder ("wakeup") — Design

**Date:** 2026-06-05
**Status:** Approved (pre-implementation)

## Problem

When it is the local player's turn, an inattentive player may not notice and
the game stalls. We want an audible nudge: if it is the player's turn and they
have not acted within 30 seconds, play `wakeup.mp3`, and keep replaying it every
30 seconds until they act.

## Decisions

- **Respect mute** — the reminder is treated like the other cues and stays
  silent when the game is muted (reuses the existing `SoundManager.play()`
  mute guard).
- **Any turn the player must act** — fires whenever `gameStatus.viewerIsActive`
  is true (bidding, declarer decision, selling, card exchange, trick play,
  four-nines ack). Not limited to trick play.

## Behavior

- On the false→true edge of `gameStatus.viewerIsActive`, arm a repeating
  30 000 ms timer.
- Each fire emits the engine event `sound:wakeup`, which plays `wakeup.mp3`
  (no-op when muted).
- On the true→false edge (player acted, or the round/game ended →
  `viewerIsActive` becomes false), cancel the timer.
- Net effect: the cue plays at 30s, 60s, 90s, … of continuous "your turn"
  until the player acts.

## Components

1. **`SoundManager.js`** — add a fourth cue `wakeup: 'sound/wakeup.mp3'` to
   `CUE_FILES` and subscribe to a new engine input `sound:wakeup`. The existing
   preload/clone/mute-guard machinery covers the rest. `wakeup.mp3` already
   exists in `src/public/sound/`.

2. **`TurnReminder.js`** (new, `src/public/js/thousand/`) — owns the timer.
   - `update(isViewerActive)` — drives the arm/disarm edges via
     `Antlion.scheduleInterval` / `Antlion.cancelInterval`. Idempotent: will not
     double-arm while already armed, and is a no-op when called with `false`
     while disarmed.
   - `stop()` — cancels any pending timer for screen teardown.

3. **`GameScreen.js`** — construct a `TurnReminder` (passing `antlion`) and call
   `this._turnReminder.update(gameStatus.viewerIsActive)` inside `_renderStatus`,
   alongside the existing `_emitTurnCueOnChange`. Call `stop()` in the teardown
   path so a half-armed timer never outlives the screen.

## Why this shape

- The timer lives in its own focused, testable module instead of being tangled
  into `GameScreen`'s render method.
- Driven from the same single render funnel (`_renderStatus`) the existing turn
  cue already uses — one place that knows about turn changes.
- Arming on the active-edge (not on every render) keeps it robust regardless of
  render cadence; no dependency on how often `_renderStatus` runs.

## Known simplification

During card exchange the player stays `viewerIsActive` across three card passes;
the timer measures continuous "your-turn" time rather than resetting per pass.
In practice an engaged player passes well within 30 seconds, so the cue will not
fire there. Per-action reset is not worth the added complexity (YAGNI).

## Testing

- **`TurnReminder`** unit test with a fake Antlion (stub
  `scheduleInterval`/`cancelInterval`): arms on `update(true)`, emits
  `sound:wakeup` on fire, disarms on `update(false)`, does not double-arm on
  repeated `update(true)`, and `stop()` cancels.
- **`SoundManager`** test extension: `sound:wakeup` plays the `wakeup` cue when
  unmuted and is a no-op when muted.
