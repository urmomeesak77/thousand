# Phase 0 Research: Game History Panel

All five clarifications from `/speckit-clarify` are resolved in the spec; the remaining unknowns were "how do we integrate with the existing engine" questions, answered below from the codebase.

## R1. Where the log lives (source of truth & lifetime)

- **Decision**: A new `GameHistory` class, instantiated once per `Game` session and held on `Game`. It accumulates entries across all rounds of the game (uncapped) and is cleared only when a new `Game` is created.
- **Rationale**: FR-018/FR-019 require a server-authoritative, full-game, uncapped log. `Game` already persists across rounds (cumulative scores, `history` of round summaries, barrel state) and is the natural owner. `Round`/`TrickPlay` are per-round and rebuilt each round (`buildRound`), so they cannot hold game-long history.
- **Alternatives considered**:
  - *Client-side log built from messages* — rejected at clarify (Q1=A); loses data on reload, diverges between viewers.
  - *Reuse `Game.history` (round-summary array)* — rejected: that array is round-summary granularity only (no bids/passes/trick winners) and is consumed by scoring/final-results; overloading it would couple unrelated concerns (Constitution X).

## R2. How history reaches the client

- **Decision**: Add an `actionHistory` array to the per-viewer view-model in `RoundSnapshot.buildViewModel`. It is identical for every seat (public information only).
- **Rationale**: `buildViewModel` already ships on every `round_state_snapshot` and is regenerated for each recipient on every broadcast and on reconnect (`getViewModelFor`). Riding the existing snapshot gives reconnect-proof delivery (SC-001, FR-018) with zero new message types and no new client routing — the panel just re-renders from `gameStatus` like `ScoreboardPanel` does.
- **Alternatives considered**:
  - *Dedicated `history_appended` WebSocket message* — rejected (Constitution III): adds a message type, a router handler, and a reconnect-replay path the snapshot already provides for free.
  - *Send only deltas* — rejected: the full array is small (a few hundred compact objects max) and a full array makes reconnect trivially correct.

## R3. Where each event is recorded (resolution sites)

Recording happens at the action-resolution boundary, not inside pure state machines:

| Event | Recording site | Available facts |
|-------|----------------|-----------------|
| Bid placed | `RoundActionHandler` (auction bid path; `Round.placeBid` sets `currentHighBid`, `src/services/Round.js:127`) | seat, amount |
| Pass | `RoundActionHandler` (`handlePass`) | seat |
| Marriage declared | `TrickPlayActionHandler` / existing `_broadcastMarriage` in `RoundActionBroadcaster` | seat, suit, bonus, trickNumber |
| Trick won | `RoundActionBroadcaster.broadcastPlayCardResults` (has `winnerSeat` via `_resolveTrick` result, `src/services/TrickPlay.js:173`, and `trickNumber`) | winnerSeat, trickNumber |
| Round scores | `RoundActionBroadcaster.computeRoundEnd` (builds `summaryEntry` with per-seat deltas) | roundNumber, per-seat delta, declarer, bid |
| Special scoring (four-nines / barrel / three-zeros) | `Game.applyFourNinesBonus` / `Game.applyRoundEnd` (where penalties are applied) | seat, kind, amount |

- **Decision**: Add thin `record*` calls at these sites that delegate to `session.history` log's `GameHistory` instance. The `Game` session is reachable from these layers (`round._game.session`, `game.session`), and nicknames via `this._store.players` / `round._store.players`.
- **Rationale**: Constitution X (logical cohesion) — keep presentation/event-log concerns out of `Round`/`TrickPlay`/`Scoring`. These boundary classes already broadcast outcomes (e.g. `_broadcastMarriage`, `_broadcastRoundSummary`), so appending a log entry alongside the broadcast is cohesive.
- **Note**: Bots act through the same `RoundActionHandler`/`TrickPlayActionHandler` paths (`BotTurnDriver`), so bot actions are logged identically with no extra wiring.

## R4. Frontend panel pattern

- **Decision**: Model `HistoryPanel` on `ScoreboardPanel` (`src/public/js/thousand/ScoreboardPanel.js`): constructed with `(container, antlion)`, a single Antlion input (`history-toggle`) bound via `antlion.bindInput`, `localStorage` persistence with a screen-width default, and a `render(actionHistory, seats)` method that rebuilds an inner scroll container and pins `scrollTop = scrollHeight` (chat-style bottom, Q4=B).
- **Rationale**: Proven, constitution-compliant pattern already in the codebase (Antlion-wired toggle, best-effort `localStorage`, scroll-pinned-to-latest). Reuse over reinvention (Constitution III). `ScoreboardPanel` literally already pins to the bottom (`scroll.scrollTop = scroll.scrollHeight`) — the exact behavior Q4 asked for.
- **localStorage key**: `thousand_history_open` (parallels `thousand_scoreboard_open`). Responsive default via `window.innerWidth > SMALL_SCREEN_PX` when unset (FR-010/FR-010a).
- **Alternatives considered**:
  - *Reuse the existing `last-action-box`* (`GameScreen.js:92`) — rejected: it shows a single last action, not a scrollable list; the spec wants a 10-visible, scrollable, collapsible log. They can coexist (out of scope to merge).

## R5. Rendering & accessibility

- **Decision**: Each entry renders as a list row; the panel body is a fixed-height scroll container (FR-011/FR-013). Empty state shows a muted "No activity yet" row (FR-015). Toggle button mirrors `ScoreboardPanel`'s `aria-expanded`. Entry text comes from a pure `historyEntryText(entry, seats)` helper, so wording/localization lives in one place (Constitution X) and is unit-testable without the DOM.
- **Rationale**: Keeps DOM construction small (Constitution IX) and testable; separates "what to say" (pure) from "how to mount" (panel).

## Resolved unknowns

No `NEEDS CLARIFICATION` remain. No new dependencies, no new WebSocket message types, no schema migrations.
