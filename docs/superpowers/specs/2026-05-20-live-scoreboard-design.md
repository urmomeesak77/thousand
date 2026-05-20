# Live Scoreboard Panel — Design

**Date**: 2026-05-20
**Branch**: `fix-hand-card-sort-order` (current) → new feature branch
**Status**: Approved design, pending implementation plan

## Goal

Add an always-available scoreboard to the top-right corner of the in-round game
screen. It shows per-round scores for every player and a running total, is
collapsible, and defaults to collapsed on small screens.

## Requirements

- **Position**: fixed overlay in the top-right corner of the game screen.
- **Columns**: one per player, headed by nickname (3 players).
- **Rows**: for each round, two stacked sub-rows —
  - `cum` — cumulative points after that round (`perPlayer[seat].cumulativeAfter`)
  - `rnd` — points scored that round (`perPlayer[seat].delta`)
- **Total footer**: a pinned `TOTAL` row at the bottom showing the current
  `cumulativeScores` per player. Stays visible while the round list scrolls.
- **Scroll**: the most recent five rounds are visible; when more rounds exist the
  round list scrolls (auto-scrolled to the most recent round), with the header
  row and the `TOTAL` footer pinned.
- **Collapse**: a header toggle opens/closes the panel.
  - Open/closed state is persisted in `localStorage`.
  - First visit: open on normal screens, closed on small screens
    (`max-width: 480px`, matching the existing smallest media-query breakpoint).
  - After a manual toggle, the stored choice wins on subsequent loads.
- **Empty state**: before round 1 completes (`scoreHistory` empty), the panel
  shows the header row and a `TOTAL` row of zeros, with no round rows.

## Architecture

### Data path (server → client)

The per-round history already lives on the server in `Game.history`. Each entry
(built in `Round.js`, pushed in `Game.applyRoundEnd`) has the shape:

```js
{
  roundNumber,
  declarerNickname,
  bid,
  perPlayer: {
    0: { nickname, seat, trickPoints, marriageBonus, roundTotal, delta, cumulativeAfter, penalties },
    1: { ... },
    2: { ... },
  },
}
```

Today this history is only sent at game-end (consumed by `FinalResultsScreen`).
The live `gameStatus` view-model carries only the current `cumulativeScores` and
`roundNumber`.

**Chosen approach (A): include a compact `scoreHistory` in the in-round
view-model.** In `RoundSnapshot.buildViewModel`, add:

```js
scoreHistory: session
  ? session.history.map((h) => ({
      roundNumber: h.roundNumber,
      perPlayer: Object.fromEntries(
        [0, 1, 2].map((s) => [s, {
          delta: h.perPlayer[s].delta,
          cumulativeAfter: h.perPlayer[s].cumulativeAfter,
        }]),
      ),
    }))
  : [],
```

Rationale vs. alternatives:
- It rides the existing `gameStatus` delivery, so **reconnect works for free**
  (snapshots already carry `gameStatus`). No new message type.
- Payload is tiny — at most ~20 rounds × 3 players × 2 integers.
- Single source of truth: the client never recomputes scores.
- Rejected **B** (separate `score_history` message) — adds a message type and a
  reconnect rehydration path for no real payload saving.
- Rejected **C** (client accumulates deltas) — fragile on reconnect, duplicates
  server truth.

### Component (client)

New `src/public/js/thousand/ScoreboardPanel.js` — one class per file (§VIII),
mounted by `GameScreen`.

- **Construction**: `new ScoreboardPanel(container, antlion)`. Reads the persisted
  collapse state (or computes the small-screen default) and renders the initial
  collapsed/open chrome.
- **`render(scoreHistory, cumulativeScores, seats)`**: rebuilds the table —
  header from `seats.players` nicknames, one `cum`/`rnd` sub-row pair per history
  entry, and the pinned `TOTAL` footer from `cumulativeScores`. Auto-scrolls the
  round list to the most recent round.
- **Collapse toggle**: header button wired via `Antlion.bindInput(btn, 'click',
  'scoreboard-toggle')` (§XI — no raw `addEventListener`). Toggling updates the
  DOM and writes the new state to `localStorage`.
- **Persistence helper**: a small read/write against `localStorage` under a
  dedicated key (e.g. `thousand.scoreboard.open`). Mirrors the existing
  `localStorage` usage pattern in `IdentityStore`.

### Integration (GameScreen)

- `GameScreen._buildDom` creates a `scoreboardEl` container and constructs
  `this._scoreboard = new ScoreboardPanel(scoreboardEl, antlion)`.
- `GameScreen._renderStatus` (already invoked on every state change) calls
  `this._scoreboard.render(gameStatus.scoreHistory, gameStatus.cumulativeScores,
  this._seats)`.
- Teardown follows the existing pattern when the game screen unmounts.

### CSS (`src/public/css/index.css`)

- `.scoreboard` — `position: fixed`, top-right, above the table; bounded width.
- `.scoreboard__rounds` — scroll container capped at ~5 rounds tall
  (`max-height` in `rem`), `overflow-y: auto`.
- `.scoreboard__header-row` and `.scoreboard__total` — pinned (sticky) so they
  stay visible while the round list scrolls.
- Collapsed state hides the body, leaving only the header bar with the toggle.
- `@media (max-width: 480px)` — narrower panel; (default-closed handled in JS,
  not CSS, since it's a stored preference).

## Testing

- `tests/ScoreboardPanel.test.js` (jsdom):
  - header renders one column per player nickname
  - per-round `cum`/`rnd` sub-rows render the right values
  - `TOTAL` footer reflects `cumulativeScores`
  - empty `scoreHistory` → headers + zero TOTAL, no round rows
  - collapse toggle flips state and persists to `localStorage`
  - stored state is honored on construction; small-screen default-closed on first
    visit
- View-model test: assert `scoreHistory` is present and compactly shaped in the
  `RoundSnapshot.buildViewModel` output (and `[]` before any round completes).

## Constitution notes

- §VIII one class per file — `ScoreboardPanel.js`.
- §XI frontend through Antlion — toggle via `Antlion.bindInput`; no raw listeners
  or timers.
- §IV thin server — no new server logic, only an additive view-model field.
- §VI responsive — fixed overlay with a small-screen breakpoint and default.

## Out of scope

- Showing trick-points / marriage-bonus / penalty breakdown per round (that stays
  on the round-summary and final-results screens).
- Any change to `FinalResultsScreen`.
