# Quickstart: Game History Panel

## What you're building

A collapsible **history panel** in the bottom-left of the game screen that logs
bids, passes, marriage declarations, trick winners, round scores, and special
scoring — server-authoritative, shipped inside the existing snapshot.

## Run it

```bash
npm start          # http://localhost:3000
npm run dev        # auto-restart on change
npm test           # run the suite
npm run lint       # ESLint on src/
```

## Build order (TDD — see /speckit-tasks for the full list)

1. **Server log** — `src/services/GameHistory.js` (+ `GameHistory.test.js`): append-only,
   uncapped, `seq`-ordered; `record*` methods + `toView()`.
2. **Own it on the session** — `Game` constructor creates a `GameHistory`; a fresh game
   ⇒ fresh log.
3. **Record at resolution sites** — add `record*` calls in `RoundActionHandler` (bid/pass),
   `TrickPlayActionHandler`/`RoundActionBroadcaster` (marriage, trick, round-score) and
   `Game` (four-nines/barrel/zeros). (+ `history-recording.test.js`.)
4. **Expose in snapshot** — add `actionHistory` to `RoundSnapshot.buildViewModel`
   (+ `RoundSnapshot.history.test.js`: present, `[]` default, identical across viewers).
5. **Formatter** — `src/public/js/thousand/historyEntryText.js` (+ test): entry → string,
   seat→name via `seats`, unknown-name fallback, suit symbols.
6. **Panel** — `src/public/js/thousand/HistoryPanel.js` (+ jsdom test): mirror
   `ScoreboardPanel` (Antlion `history-toggle`, `localStorage` `thousand_history_open`,
   responsive default, bottom-pinned scroll, empty state).
7. **Mount** — `GameScreen` creates the panel container (bottom-left) and calls
   `render(gameStatus.actionHistory, seats)` from `_renderStatus`.
8. **Styles** — `.history-panel` in `game.css`: bottom-left anchor, fixed height
   (~10 rows), inner scroll, collapsed variant, responsive media query.

## Manual verification (maps to acceptance scenarios)

1. Start a 3-player game vs bots. During the auction, confirm each **bid** and **pass**
   appears as a row (US1 #1).
2. Play tricks; after each completes, confirm a **"Trick N won by …"** row, newest at the
   bottom (US1 #2, US3 ordering).
3. Finish a round; confirm a **per-player round-score** row (US1 #4, FR-007).
4. Declare a marriage; confirm a **marriage** row.
5. Collapse the panel via its toggle; confirm only a compact handle remains; expand again
   (US2). **Reload the page** — the collapsed/expanded state is restored (FR-010).
6. Accumulate 10+ entries; confirm the panel keeps a fixed footprint with a scrollbar and
   the latest entry is visible by default (US3, FR-011/FR-013).
7. Open a second browser as another player / reconnect mid-game; confirm the **same**
   history is shown (FR-018).
8. On a narrow viewport, confirm the panel defaults to collapsed and does not cover the
   hand/controls (FR-010a, Constitution VI).

## Definition of done

- All new tests green; `npm test` and `npm run lint` pass; coverage ≥ 90% (Tech Stack).
- No new dependencies, no new WebSocket message type, no build step.
- Constitution re-check (plan.md) still PASS.
