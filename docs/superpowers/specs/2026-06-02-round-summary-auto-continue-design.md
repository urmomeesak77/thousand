# Round-summary auto-continue timer — design

Date: 2026-06-02
Status: approved (pending spec review)

## Problem

The round-summary screen advances to the next round only once **every** seat
has pressed "Continue to Next Round" (`RoundActionHandler.handleContinueToNextRound`
starts the next round when `session.continuePresses.size === round.playerCount`).
If one player walks away or forgets to click, the whole table stalls indefinitely.

## Goal

Add a 30-second auto-continue timer to the round-summary screen so that, if the
local viewer has not pressed Continue, their press fires automatically — removing
the "someone forgot to click" stall without changing the all-seats-must-press rule.

## Behavior

- When the round-summary screen renders **with a Continue button** — i.e.
  `victoryReached === false`, `onContinue` is provided, and the viewer has not
  already pressed — start a 30-second countdown.
- The remaining seconds are folded into the button label:
  `Continue to Next Round (30)` → `(29)` → … When the count reaches 0, the screen
  fires the same path as a manual click (`_onContinueClick`), which records the
  local viewer's continue press and disables the button with a ✓ indicator.
- The timer only ever fires the **local viewer's own** press. It does not force
  other seats forward. The round still advances only once all seats have pressed
  (existing server rule, unchanged).

## Cancellation / edge cases

- Manual click → cancel the timer (the button is disabled by the existing flow).
- No timer on the victory / "Back to Lobby" variant (no Continue button rendered).
- If the viewer has already pressed (reconnect/refresh seeds
  `_continuePressedSeats`), the button renders disabled → no timer starts.
- `update()` re-renders only the table on *other* players' presses, so the
  countdown is untouched.
- `render()` (full rebuild) restarts the timer; cancel any existing timer at the
  start of render to avoid stacking intervals.

## Implementation

All changes are contained in `src/public/js/thousand/RoundSummaryScreen.js`:

- Add a module constant `AUTO_CONTINUE_SECONDS = 30`.
- In `_renderContinueButton()`, when the button is enabled, start the countdown
  using Antlion's managed `scheduleInterval(1000, …)` (per constitution §XI — no
  raw `setInterval`). Each tick decrements a remaining-seconds counter, updates
  the button label, and on reaching 0 cancels the interval and calls
  `_onContinueClick()`.
- Track the interval id on the instance; cancel it via `cancelInterval` in
  `destroy()` and at the top of `render()` (alongside the existing button
  teardown).

No server changes. No CSS changes (button text only).

## Testing

jsdom test driving a controllable Antlion timer:

- Button label shows the countdown and decrements per tick.
- After 30 ticks with no click, `onContinue` fires exactly once and the button
  becomes disabled.
- A manual click before expiry cancels the timer (no second `onContinue`).
- No timer is started on the victory / Back-to-Lobby variant or when the viewer
  has already pressed.
