# Quickstart: Play Phase, Scoring, Multi-Round & Victory

## What changed

Feature 004 ended at the "Round ready to play — next phase coming soon" handoff after the declarer pressed **Start the Game**. This feature replaces that handoff with the actual gameplay loop:

1. **Card exchange** — declarer passes one card to each opponent (FR-002 .. FR-005).
2. **Trick play** — 8 tricks, follow-suit / trump enforcement, marriage declarations on tricks 2–6 (FR-006 .. FR-012).
3. **Round summary** — scoring per FR-013 / FR-014, made/missed indicator, per-player deltas + cumulative totals (FR-015).
4. **Multi-round flow** — Continue presses, dealer rotation, cumulative carry-over (FR-016).
5. **Victory at 1000+** — final-results screen with per-round history (FR-017).
6. **Special scoring** — barrel rule [880, 1000) with 120-bid floor and 3-round counter; three-consecutive-zero penalty (FR-021 .. FR-024).

The persistent status display (FR-018) is extended to show the trick number, current trump suit, cumulative scores at all times, barrel markers, and the round number.

The game record's cleanup rule is **superseded**: it now persists across rounds and is purged only at game-end (FR-029).

## New files

### Backend

| File | Purpose |
|---|---|
| `src/services/Game.js` | Persists-across-rounds entity: cumulative scores, dealer rotation, barrel/zero state, round-history log, Continue-press tracking. |
| `src/services/TrickPlay.js` | R-001 extraction: trick-play state machine (lead, current-trick cards, trump suit, declared marriages, collected tricks). |
| `src/services/Scoring.js` | Pure functions: `cardPoints`, `roundScores`, `roundDeltas`, `determineWinner`, `buildFinalResults`. |
| (extension) `src/services/Round.js` | Adds `card-exchange` and `trick-play` actions + the round-summary build; delegates trick state to `TrickPlay`. |
| (extension) `src/services/RoundPhases.js` | Adds card-exchange → trick-play and trick-play → round-summary transitions. |
| (extension) `src/services/RoundSnapshot.js` | Adds reconnect-snapshot fields for the new phases (FR-026). |
| (extension) `src/controllers/RoundActionHandler.js` | New message branches: `exchange_pass`, `play_card`, `continue_to_next_round`. |
| (extension) `src/services/ThousandStore.js` | Instantiates `Game` once per game-session; persists across rounds; new cleanup callsites (FR-029). |

### Frontend (`src/public/js/thousand/`)

| File | Class / purpose |
|---|---|
| `CardExchangeView.js` | Mounts during `card-exchange` — tap-to-select + destination buttons; opponent waiting state. |
| `TrickPlayView.js` | Mounts during `trick-play` — centre-trick area + lead/follow prompts; integrates `MarriageDeclarationPrompt`. |
| `MarriageDeclarationPrompt.js` | Modal for the K/Q-tap prompt (FR-009). Declare-and-play / Play-without-declaring / Cancel buttons. |
| `CollectedTricksStack.js` | Renders a per-seat face-down stack with `× N` badge (FR-008). |
| `RoundSummaryScreen.js` | Mounts during `round-summary` — per-player rows, made/missed indicator, Continue button. |
| `FinalResultsScreen.js` | Mounts during `game-over` — final ranking + per-round history table + Back-to-Lobby. |
| (extension) `GameScreen.js` | New phase routing: `Card exchange` → `CardExchangeView`, `Trick play` → `TrickPlayView`, `Round complete` → `RoundSummaryScreen`, `Game over` → `FinalResultsScreen`. |
| (extension) `GameScreenControls.js` | Mount/unmount the new control widgets per FR-020. |
| (extension) `StatusBar.js` | Renders new fields: `trickNumber`, `currentTrumpSuit`, `cumulativeScores`, `barrelMarkers`, `roundNumber`. |
| (extension) `RoundActionDispatcher.js` | Outbound wrappers for `exchange_pass`, `play_card`, `continue_to_next_round`. |
| (extension) `constants.js` | Adds `MARRIAGE_BONUS` map, `CARD_POINT_VALUE` map, `RANK_ORDER`. |

### Tests

| File | What it covers |
|---|---|
| `tests/Round.cardexchange.test.js` | FR-002 / FR-003 pass validation; final on commit; second-pass destination restriction. |
| `tests/Round.trickplay.test.js` | FR-006 / FR-007 / FR-008 follow-suit, trump priority, Ten outranks K/Q, winner determination. |
| `tests/Round.marriage.test.js` | FR-009 / FR-010 / FR-011 marriage conditions, trump replacement on current trick, no-prompt on tricks 1 / 7 / 8. |
| `tests/Scoring.test.js` | FR-013 card-point totals, FR-014 declarer made/missed, opponent deltas, FR-017 tiebreak via `determineWinner`. |
| `tests/Game.multiround.test.js` | FR-016 dealer rotation, FR-029 cleanup at game-end (not round-end), cumulative carry-over. |
| `tests/Game.barrel.test.js` | FR-021 / FR-022 / FR-023 barrel state transitions, bid-floor enforcement, 3-round penalty. |
| `tests/Game.consecutivezeros.test.js` | FR-024 zero-counter, penalty + reset, simultaneous barrel-and-zeros (both fire). |
| `tests/Round.disconnect.play.test.js` | FR-025 trick-play disconnect pause/continue; round-summary sticky press; grace-expiry abort variants. |
| `tests/round-messages.005.test.js` | End-to-end via `ConnectionManager`: exchange → trick → summary → next-round → victory. |
| `tests/CardExchangeView.test.js` | FR-002 selection UI, destination restriction after first pass. |
| `tests/TrickPlayView.test.js` | FR-007 client-side card-disable; FR-008 collected-stack growth and badge update. |
| `tests/MarriageDeclarationPrompt.test.js` | FR-009 Cancel returns to selection; combined `play_card` outbound payload on Declare and play. |
| `tests/RoundSummaryScreen.test.js` | FR-015 rendering of made/missed, Continue button gating; sticky press indicator. |
| `tests/FinalResultsScreen.test.js` | FR-017 ranking sort, history table, winner highlight. |
| `tests/StatusBar.005.test.js` | FR-018 new fields rendered (trick number, trump, cumulative scores, barrel markers). |

## Modified files

| File | Change |
|---|---|
| `src/services/ConnectionManager.js` | New message branches: `exchange_pass`, `play_card`, `continue_to_next_round` (delegated to `RoundActionHandler`). Reconnect (`hello`) flow extended: `round_state_snapshot` now carries the new per-phase fields. |
| `src/controllers/GameController.js` | `_admitPlayerToGame` now instantiates `Game` (once) AND `Round` (once per round) — previously it only created `Round`. |
| `src/public/js/core/ThousandApp.js` | Lifecycle routing for `final_results` and `game_aborted` (new terminal screens). |
| `src/public/js/core/ThousandMessageRouter.js` | New validators + handlers for `card_exchange_started`, `card_passed`, `trick_play_started`, `card_played`, `marriage_declared`, `trump_changed`, `trick_resolved`, `round_summary`, `continue_press_recorded`, `next_round_started`, `final_results`, `game_aborted`. |
| `src/public/css/index.css` | Layout for card-exchange destination buttons; centre-trick slot; collected-tricks stacks per seat; round-summary table; final-results ranking + history table; barrel marker badge. |

## Config

No new environment variables. `GRACE_PERIOD_MS` (feature 003) still governs disconnect tolerance during card exchange, trick play, and round-summary. The 250 ms per-player throttle (FR-027) reuses the existing `RateLimiter`.

## Running tests

```bash
npm test
# or filter to the new tests only:
node --test tests/Round.cardexchange.test.js tests/Round.trickplay.test.js \
            tests/Round.marriage.test.js tests/Scoring.test.js \
            tests/Game.multiround.test.js tests/Game.barrel.test.js \
            tests/Game.consecutivezeros.test.js tests/Round.disconnect.play.test.js \
            tests/round-messages.005.test.js
# or frontend only:
node --test tests/CardExchangeView.test.js tests/TrickPlayView.test.js \
            tests/MarriageDeclarationPrompt.test.js tests/RoundSummaryScreen.test.js \
            tests/FinalResultsScreen.test.js tests/StatusBar.005.test.js
```

## Manual verification (3 browser tabs)

1. `npm start`
2. Open three browser tabs at `http://localhost:3000/`.
3. Set three nicknames; from tab 1 host a public 3-player game; tabs 2 and 3 join. Game auto-starts (feature 004 path).
4. **Round 1 bid + start** (feature 004 path): cycle through bidding to a declarer at 100 (no marriages, all-pass scenario also fine). Declarer presses **Start the Game**.
5. **Card exchange (FR-001 .. FR-005, SC-001)**: within 1 s, all three tabs show the Card-Exchange view. The declarer's hand is operable; the two opponents see "Waiting for {declarerNickname} to pass cards…".
6. **First pass (FR-002, FR-004)**: declarer taps a card → two destination buttons appear. Tap "Pass to {leftOpponentNickname}". Animation: card flies face-up (on declarer's tab), card-back (on the third-opponent tab), card-back (on the recipient tab) — then **flips to face-up** for the recipient on landing. The recipient's `cardsById` now contains the identity; the third opponent's never does. `exchangePassesCommitted` in the status display reads `1`.
7. **Second-pass destination restriction (FR-002, US1 AS-2)**: declarer taps a second card. **Only the "Pass to {rightOpponentNickname}" button is shown** — the left destination is hidden. Tap it; the second card animates over.
8. **Trick play start (FR-005, FR-006)**: all three tabs hold 8 cards each. Declarer's tab transitions to TrickPlayView with "Lead trick 1 of 8"; opponents see "Waiting for {declarerNickname} to lead…". Status display shows `Phase: Trick play, Trick: 1 of 8, Trump: No trump`.
9. **Lead trick 1 (FR-006, FR-007)**: declarer plays a card. It flies to the centre face-up on all three tabs. Turn rotates clockwise; the next player's cards-of-the-led-suit are operable and other cards are disabled (FR-020).
10. **Follow-suit rejection (FR-007, SC-003)**: open dev tools on the second player's tab and force a `play_card` for an off-suit card (while they hold a card of the led suit). Server returns `action_rejected` with reason "You must follow suit with {suit}". The turn does not advance.
11. **Trick resolution (FR-008)**: third player plays. After a brief pause (~350 ms) the 3 cards animate from the centre to the winner's collected-stack slot, **face-up during the flight, flipping face-down on landing**. The winner's collected-tricks badge updates to `× 1`. All three clients drop the 3 card identities from `cardsById`. The winner is prompted to lead the next trick.
12. **Marriage declaration (FR-009 / FR-010 — only if the leader has K + Q of a suit on tricks 2..6)**: on trick 2 lead, leader taps their K of Hearts (holding Q♥ too). A prompt appears: "Declare marriage in Hearts (+60)?" with three buttons: **Declare and play**, **Play without declaring**, **Cancel**. Tap Cancel — prompt closes, no server message, leader still selecting. Tap K♥ again, then Declare and play. Server broadcasts `marriage_declared` + `trump_changed`. Status display updates to `Trump: ♥` on all three tabs. Leader's round score chip flashes `+60`. K♥ animates to centre.
13. **Trump priority (FR-007, FR-008)**: on a later trick where the led suit is Spades and a player is out of Spades, they must play a trump (Hearts) if they hold any (FR-007). Server rejects any non-trump non-followsuit play with `action_rejected` "You must play trump". The trump card wins the trick if it's the only trump played, or the highest trump wins.
14. **Round summary (FR-013, FR-014, FR-015, SC-005)**: after trick 8 resolves, all three tabs show the RoundSummaryScreen within 1 s. Each player's row shows nickname, trick points, marriage bonus, round total, delta, and new cumulative score. The declarer's row shows the made-or-missed indicator. The viewer's own collected cards are visible on their row; the other two players' collected cards are NOT visible. The only operable control is **Continue to Next Round**.
15. **Continue presses (FR-016, US3 AS-1, AS-2)**: tap Continue on tab 1 — a "Continued ✓" indicator appears next to tab 1's row on all three tabs. Tap Continue on tab 2 — same for tab 2. Tap Continue on tab 3 — within 1 s, all three tabs transition to the deal animation for round 2, with the dealer rotated one seat clockwise. Status display shows `Round: 2`. Cumulative scores carry forward.
16. **Multi-round play (SC-006)**: play through several rounds until any player approaches 1000.
17. **Victory (FR-017, US3 AS-4, AS-5)**: round-end scoring pushes a player to ≥ 1000. Round summary shows briefly; then all three tabs transition to the FinalResultsScreen within 1 s. The winner row is highlighted (descending order by score). The per-round history table is visible (every round's number, declarer, bid, and each player's delta + cumulative). The only operable control is **Back to Lobby**. Tab 1 presses Back; tab 1 navigates to lobby alone. Tabs 2 and 3 remain on the screen until they press their own.
18. **Tiebreak (FR-017)**: contrive two players to reach exactly 1000 in the same round (force-load a high-bid scenario). The player whose round it was as declarer wins the tie; if neither tied player was the declarer, P1 (dealer+1) wins over P2 wins over Dealer.
19. **Barrel rule (FR-021 .. FR-023, SC-007)**: drive a player's cumulative to ~895. On the next round, status display shows "On barrel — round 1 of 3" next to their seat. During bidding, they try to bid 100 → rejected with reason "Players on barrel must bid at least 120." They bid 120 → accepted. After 3 on-barrel rounds without reaching 1000, the round summary shows "Barrel penalty: −120" for them; cumulative drops by 120; barrel indicator clears (assuming post-penalty score is < 880).
20. **Three consecutive zeros (FR-024, SC-008)**: drive a player to 3 consecutive rounds with round score = 0 (no trick points and no marriage). On the third such round, the round summary shows "Zero-round penalty: −120" for them; cumulative drops by 120.
21. **Disconnect mid-trick (FR-025)**: close tab 2 while their turn is active mid-trick. Status display shows "Connection lost…" next to tab 2's seat on tabs 1 and 3. Tab 1 tries to play — blocked (the active player is disconnected; the round pauses). Reopen tab 2; `round_state_snapshot` rehydrates them; the pause clears; play resumes.
22. **Disconnect on round summary (FR-025 sticky press)**: tab 1 presses Continue on a round summary. Then tab 1 closes. Tab 2 and tab 3 press Continue. As long as tab 1's grace window has not expired, the next round begins — tab 1 will rehydrate into round 2's bidding via `round_state_snapshot` on reconnect. If tab 1's grace expires first, all three tabs receive `game_aborted` with reason `player_grace_expired`.
23. **Game-record cleanup (FR-029)**: trigger any of `final_results`, `round_aborted` (mid-round grace expiry), or `game_aborted` (between-rounds grace expiry). Server logs the game record being purged immediately after the broadcast. A disconnected player who reconnects after the purge is routed to the lobby (their `connected` payload returns `gameId: null`).

## Notes for downstream specs

- 4-player mode and accessibility (colorblind suit signalling) remain out of scope.
- Persistent game state across server restarts is out of scope (in-memory only, consistent with features 003 / 004).
- The rulebook's "Rospisat'" (round-pass) variant is explicitly out of scope (see spec Assumptions).
- Game-end is currently always victory-driven. A future feature could add explicit resignation / surrender flows; these are not implemented in v1.
