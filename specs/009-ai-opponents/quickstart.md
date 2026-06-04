# Quickstart & Validation: AI Opponents (Bots)

How to exercise the feature once implemented. Maps each check to spec acceptance criteria.

## Run

```bash
npm start            # server on :3000
npm test             # unit suites incl. BotStrategy / BotTurnDriver / GameController.bots
npm run lint
```

## Manual happy path (US1 + US2) — single human + bots

1. Open `http://localhost:3000`, set a nickname, create a **3-player** public game.
2. In the waiting room you are 1 of 3 seats. Click **Add Bot** twice.
   - ✅ Each bot seat shows a themed name (`Robo-Ada`, …) and a bot badge. *(SC-005, FR-012/013)*
   - ✅ Adding the 2nd bot fills the table and the round **auto-starts**. *(US1 AS-1, FR-004)*
3. Watch a full round without touching anything for the bot seats:
   - ✅ Each bot bids/passes on its turn after a ~1–3 s pause; bolder bots reach higher, cautious ones pass/bid low. *(US2 AS-1/AS-6, FR-009, FR-016)*
   - ✅ The declarer bot exchanges cards (3-player: 2 passes) and plays out trick play. *(US2 AS-2/3)*
   - ✅ Trick play never offers an illegal card; follow-suit/trump respected. *(SC-002, FR-007)*
   - ✅ Round summary scores all seats; press Continue (or let bots auto-continue). *(US2 AS-4, FR-010)*
4. Let it run to 1000+:
   - ✅ Final results rank bots alongside the human. *(US2 AS-5, SC-001)*

## 4-player variant (SC-003)

Repeat with a **4-player** game and 3 bots (or 2 humans + 2 bots). ✅ Completes to victory.

## Manage bots (US3)

1. Create a 4-player game; add 1 bot (table not yet full).
2. ✅ Click **Remove** on the bot → seat returns to empty; a second human can now join. *(US3 AS-1, FR-002)*
3. ✅ From a second (non-host) browser that joined, no Add/Remove controls are visible. *(US3 AS-3, FR-005)*
4. ✅ Try to add a bot when the table is full → rejected (`game_full`). *(US1 AS-3, FR-003)*

## Edge cases

- **Last human leaves a table with bots** → game is torn down, bot records purged (verify via a
  test that `store.games` no longer has the id and the bot ids are gone from `store.players`). *(FR-014)*
- **Host leaves the waiting room** with bots present → game disbanded, bots purged.
- **Bot turn while paused for a disconnected human** → bot does not act out of turn (it only acts
  when `currentTurnSeat` is its own seat and the round is not paused). *(FR-015)*

## Automated live check (optional)

The existing smart live e2e (`tests/e2e-live-smart.js`) drives all seats via browsers. A
lighter follow-up (not required for the feature) is a headless check that creates a game with
**one** real client and fills the rest with `POST /api/games/:id/bots`, asserting the game
reaches final results — exercising the real server-side bot loop end-to-end with a single client.

## Aggressiveness (SC-007, FR-016/FR-017)

Unit-level (no browser): with a fixed hand, call `BotStrategy.decideBid` across
`aggressiveness` 0 → 1 and assert (a) bid is monotonic non-decreasing in the trait, and
(b) `bid ≤ roundDownToStep(safeEstimate + MAX_TALON_GAMBLE, BID_STEP)` at the top end.

## Definition of done

- All FR-001…FR-017 covered by tests with `// per FR-NNN` annotations.
- `npm test` green, `npm run lint` clean, coverage ≥ 90% on new files.
- Manual happy path completes for both 3- and 4-player variants.
