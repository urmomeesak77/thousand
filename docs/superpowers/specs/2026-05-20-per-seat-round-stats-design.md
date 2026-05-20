# Per-seat round tricks/points display

**Date**: 2026-05-20
**Branch**: 005-play-phase-scoring
**Status**: Approved (design)

## Goal

During a round, show each player how many **tricks** and how many **points**
they have won so far, in a dedicated place next to that player's cards:

- **Each opponent**: a `Tricks N, Points MMM` line *below* their card stack.
- **Viewer (self)**: the same line *above* their own hand.

Remove the now-redundant trick/points UI from elsewhere:

- Remove the cumulative `N pts` scores from the top status bar.
- Remove the `× N` collected-trick count badges from the controls strip
  below the table.

The `Trick X of 8` counter in the status bar stays. The barrel markers in
the status bar stay.

## Data flow (server)

`collectedTrickCounts` (per-seat trick counts) is already in the view-model.
Points won so far are **not** sent to clients today: collected-card
identities are dropped client-side (FR-019) and points are only computed at
round end (`Scoring.roundScores`).

Add a `roundPoints: { 0, 1, 2 }` field to the view-model in
`RoundSnapshot.buildViewModel`:

- Compute via the existing `Scoring.roundScores(round)`. `Round` already
  exposes `collectedTricks`, `declaredMarriages`, and `deck`, which is the
  exact input `roundScores` needs. The result is the running per-seat total
  (collected-card point values + declared-marriage bonuses).
- Populate only for the `trick-play` and `round-summary` phases; emit `null`
  otherwise. This keeps the line hidden during dealing/bidding/exchange,
  where no points have been won.

`roundPoints` carries the same per-seat shape for all three seats. There is
no per-viewer identity leakage concern: it is an aggregate integer per seat,
not card identities.

## Rendering (frontend)

### Opponents — `OpponentView`

Add `setRoundStats(tricks, points)`. Store the values and render a stats line
inside `_render()`, positioned **after** the card stack and **before** the
last-action / disconnected lines. The line is omitted when stats are unset
(pre-trick-play). Class: `opponent-view__round-stats`.

Text format: `Tricks {n}, Points {mmm}`.

### Viewer — `GameScreen`

Add a `selfStatsEl` element in `_buildDom`, appended to `tableEl` immediately
before `handEl`. It spans all grid columns (`grid-column: 1 / -1`), so grid
auto-flow places it in the row directly above the full-width hand. Class:
`self-round-stats`. Hidden (`.hidden`) when stats are unset.

### Wiring — `GameScreen._renderRoundStats(gameStatus)`

Called from `_renderStatus(gameStatus)` (already invoked from `init`,
`initFromSnapshot`, and `updateStatus`, so every state change refreshes it).

Behavior:
- If `gameStatus.roundPoints == null`: hide `selfStatsEl` and clear both
  opponents' stat lines.
- Else, for each seat resolve tricks = `collectedTrickCounts[seat]`, points =
  `roundPoints[seat]`, and push to the matching widget:
  - `seats.left` → left `OpponentView.setRoundStats`
  - `seats.right` → right `OpponentView.setRoundStats`
  - `seats.self` → `selfStatsEl`

## Removals

- `StatusBar._renderCumulativeScores`: drop the `status-bar__cumulative-score`
  `N pts` spans. Restructure the method to render the barrel markers only
  (barrel markers are unchanged and were not requested for removal). The
  method continues to take `(cumulativeScores, barrelMarkers)` but only reads
  `barrelMarkers`; rename to `_renderBarrelMarkers(barrelMarkers)` and update
  the call site in `render`.
- `TrickPlayView._renderCollectedBadges` and its call in `render`: removed.
  The `trick-play__collected` / `collected-tricks__*` markup is no longer
  produced.

## CSS

- `.self-round-stats` — full-width, centered, same muted-label styling as
  `.opponent-view__last-action`. `.hidden` toggles visibility.
- `.opponent-view__round-stats` — centered line under the stack, consistent
  with the opponent label typography.
- Remove now-unused rules: `.status-bar__cumulative-score`,
  `.status-bar__scores` (if only used for the pts spans — keep the wrapper if
  barrel markers still need it), `.trick-play__collected`,
  `.collected-tricks__item`, `.collected-tricks__badge`. Audit before
  deleting in case barrel markers reuse `.status-bar__scores`.

## Tests

- `tests/StatusBar.005.test.js` — currently asserts cumulative `pts` are
  rendered (FR-018). Update: assert the `pts` spans are **gone** and barrel
  markers are still rendered.
- `tests/TrickPlayView.test.js` — currently asserts `× N` collected-badge
  growth. Update: remove those assertions (badges no longer rendered).
- New snapshot assertion: `roundPoints` present and correct for trick-play /
  round-summary, `null` for earlier phases (extend an existing
  `RoundSnapshot` / round-messages test).
- New frontend assertion: per-seat stat lines render the expected
  `Tricks N, Points MMM` text for self and both opponents, and are hidden
  before trick-play. Add to `tests/TrickPlayView.test.js` or a GameScreen
  test.

## Divergence from spec

FR-018 currently requires cumulative game scores (progress toward 1000) to be
"visible at all times" in the status bar. This change removes them from the
play view; cumulative totals remain visible only on the round-summary and
final-results screens. The new per-seat line shows **per-round** points, not
cumulative. Accepted by the user as a deliberate divergence.

## Constitution notes

- §IX (small units): additions are small (one view-model field, one
  `OpponentView` method, one `GameScreen` helper, a few CSS rules). No file
  approaches the size budget.
- §XI (frontend through Antlion): rendering only; no new timers, intervals,
  or raw DOM listeners.
