# Quickstart: Bot Card Memory

Backend-only feature. Verify with unit tests plus an optional live game.

## Run the unit tests

```bash
npm test                 # full suite (existing 009 bot tests must stay green — S1)
npm run test:coverage    # confirm ≥90% on new bots/ files
npm run lint             # ESLint on src/
```

New test files and what they prove:

| Test | Proves |
|------|--------|
| `BotMemory.test.js` | recency monotonicity (FR-006), non-zero forgetting (FR-007), skill ordering (FR-011), determinism per seed (FR-008), empty log, SC-002 thresholds |
| `botStrategyHelpers.boss.test.js` | `isBossCard` truth table — gone/in-hand/on-table coverage, trump-aware (H1–H3) |
| `BotStrategy.memory.test.js` | full recall cashes a boss card; same card forgotten ⇒ fallback "memory mistake" (FR-012/FR-013, SC-004); empty knowledge ⇒ identical to 009 (S1) |
| `TrickPlay.playedLog.test.js` | every played card logged with correct `trickNumber`, incl. crawl path; no duplicates (P1–P3) |

## Manual sanity check (deterministic recall)

```js
const BotMemory = require('./src/services/bots/BotMemory');
const log = [{ cardId: 5, trickNumber: 1 }, { cardId: 9, trickNumber: 5 }];

const sharp = new BotMemory(0.95, 12345);
const weak  = new BotMemory(0.05, 12345);

// At trick 6: card 9 (age 1, recent) recalled by both; card 5 (age 5, old)
// recalled by the sharp bot far more often than the weak one.
sharp.recalledGoneCardIds(log, 6, 'r1');  // → likely Set{5, 9}
weak.recalledGoneCardIds(log, 6, 'r1');   // → likely Set{9} only
// Repeat calls with identical args return the identical Set (determinism).
```

## Optional live verification

Start the server, create a 3-player game, add 2 bots, and play a round:

```bash
npm start
```

Watch a bot **cash an ace late in a round once every higher card of that suit has been
played** — and occasionally fail to, on lower-skill bots, when it has "forgotten" a card.
The existing `tests/e2e-live-smart.js` harness can drive the human seat.

## What to look for

- No game-rule or UI change — only smarter/fallible bot decisions (FR-014).
- Bots at the same table behave differently (different `memorySkill`).
- A bot never acts on a card it has not recalled (SC-001).
