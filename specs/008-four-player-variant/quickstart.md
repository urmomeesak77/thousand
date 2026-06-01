# Quickstart: 4-Player Variant with Extended Deck

How to run and manually verify the feature end-to-end.

## Run

```bash
npm start          # server on http://localhost:3000
npm test           # full suite (must stay green; ≥90% coverage)
npm run lint
```

## Automated checks

```bash
npm test
```
Key new suites: `Deck.fourplayer`, `DealSequencer.fourplayer`, `Scoring.fourplayer`, `Round.fourplayer`, `Game.fourplayer`, `round-messages.fourplayer`, `CardTable.fourplayer`, `GameScreen.fourplayer`, plus extended `validators` tests. The **entire pre-existing 3-player suite must pass unmodified** (US2 / FR-006).

## Manual: 3-player regression (must be unchanged)

1. Open `http://localhost:3000` in 3 tabs; claim 3 nicknames.
2. New Game → select **3 players** → create; join from the other two tabs.
3. Confirm: deal gives 7 cards each + a 3-card talon; declarer reaches 10 after talon pickup, then 8 after **2** exchange passes; tricks contain **3** cards; scoring/victory identical to today.

## Manual: 4-player happy path (US1)

1. Open `http://localhost:3000` in 4 tabs; claim 4 nicknames.
2. New Game → select **4 players** → create. The waiting room shows **"(4 needed to start)"**.
3. Join from the other three tabs; the round starts when the 4th joins.
4. Verify:
   - Deal: 7 cards to each of the four players, **4-card talon**, 32-card deck containing **7s and 8s** in all suits.
   - Bidding rotates over all four seats; if three pass, the fourth is forced to declare at the floor.
   - Declarer picks up the talon → **11 cards**, then passes **one card to each of the three opponents** (3 passes) → **8 cards each**.
   - The table renders **three opponents** (left, across/top, right); the trick-centre shows up to **4** played cards.
   - A **7 or 8** scores **0** and never beats a 9-or-higher of the same suit.
   - Play eight tricks of four cards; round summary and scoreboard list all four players.
   - Continue rounds until someone reaches **≥1000**; final results rank all four. (Tiebreak: declarer-first, else P1→P2→P3→Dealer.)

## Manual: four-nines / crawl in 4-player (deck seam)

Force a rare deal via the generalized test seam (works against the 32-card deck):

```bash
THOUSAND_STACK_DECK=four-nines npm start     # all four 9s land on one seat → +100 bonus, ack-gate needs all 4
THOUSAND_STACK_DECK=no-ace-declarer npm start # ace-less declarer → crawl offered on trick 1 (4 commits)
```
Confirm the four-nines modal waits for **all four** acknowledgments, and a 4-player crawl resolves after **four** face-down commits.

## Responsive check (§VI / R-302)

Open the 4-player game on a narrow (mobile) viewport; confirm all four seats (self + three opponents incl. the across/top slot) and the 4-card trick-centre remain visible and the touch targets are usable.
