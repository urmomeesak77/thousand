# Quickstart: Four Nines Bonus

How to verify the feature, both automated and via a 3-tab manual walkthrough.

## Prerequisites

- Feature 005 (play phase, scoring, multi-round, barrel) is in place.
- `npm install` done; `npm start` serves on `http://localhost:3000`.

## Automated verification

```bash
npm test          # all unit + integration tests, incl. the new four-nines suites
npm run lint      # ESLint on src/
```

New suites to expect green:
- `tests/Scoring.fournines.test.js` — `findFourNinesSeat` / `handHoldsFourNines`: positive (one hand holds all four), negative (9s split, or one in talon / passed away), and the declarer-after-exchange cases.
- `tests/Round.fournines.test.js` — detection at the `card-exchange → trick-play` transition; ack-gate rejects the first `play_card` until all three ack; once-only award (FR-005); reconnect snapshot fields (FR-010).
- `tests/Game.fournines.test.js` — `applyFourNinesBonus` banks +100; post-round cumulative = `before + 100 + roundDelta` (no double count); barrel/victory recompute at round end includes it.
- `tests/round-messages.fournines.test.js` — end-to-end: `exchange_pass` ×2 → `four_nines_awarded` → `acknowledge_four_nines` ×3 → first lead unlocked → `round_summary` line item.
- `tests/FourNinesPrompt.test.js`, `tests/RoundSummaryScreen.fournines.test.js` — modal render + dispatch (no Antlion handler leak); distinct "Four nines: +100" line item.

### Forcing a four-nines hand in tests

Tests build a `Round` and manipulate `round.deck` + `round.hands` directly (see `tests/Round.trickplay.test.js`):

```js
const round = makeTrickPlayRound();           // post-exchange, phase 'trick-play'
const nines = ['♣','♠','♥','♦'].map(s => findCardId(round.deck, '9', s));
setHand(round, 1, [...nines, /* 4 more non-9 cards */]);   // seat 1 holds all four 9s
// then drive the transition / detection and assert the +100 + gate
```

## Manual 3-tab walkthrough

1. Open three browser tabs, create a game, and seat three players (per the 005 quickstart).
2. To force the rare hand deterministically, use the same test-deck seam the 005 quickstart uses (a stacked deck where seat 1's post-exchange hand holds 9♣ 9♠ 9♥ 9♦). Without the seam, the event is too rare to hit by hand.
3. Play through bidding → selling → declarer decision → card exchange as normal.
4. **At the moment card exchange completes** (the declarer's second pass), confirm on all three tabs:
   - A blocking modal appears: "{seat-1 nickname} holds four nines: +100", with a single **Acknowledge** button.
   - Seat 1's cumulative score in the status bar / scoreboard has increased by exactly 100.
   - The declarer cannot lead trick 1 yet (the hand is gated).
5. Acknowledge on tabs one at a time. After the **third** acknowledgment, the modal closes everywhere and the declarer's lead becomes operable. (Acknowledging on only two tabs must NOT unlock the lead.)
6. Play the hand to completion. At the round summary, seat 1's row shows a distinct **"Four nines: +100"** line item separate from trick points / marriage bonus / made-missed delta, and its `cumulativeAfter` reconciles to `before + 100 + roundDelta`.
7. Continue rounds to game end; on the final-results screen, the per-round history row for that round reflects the +100 in seat 1's running cumulative.

### Spot-checks for edge cases

- **Reconnect mid-gate**: while the modal is open, refresh seat 2's tab. On reconnect the modal reappears with seat 2's prior acknowledgment preserved if it had already been pressed; cumulative already shows the +100.
- **No trigger**: a deal where the four 9s are split (or one is in the talon / passed away in the exchange) shows no modal and no bonus — trick play begins immediately.
- **Premature lead**: attempting to lead trick 1 before all three ack produces an `action_rejected` toast on the declarer's tab only.
