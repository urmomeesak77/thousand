# Bot Bidding Realism & Smarter Selling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make server-side bots bid realistically (declarer make-rate ≈ 65–75% instead of chronically negative), sell hands the talon failed to support, and offer K/Q when selling to entice a marriage-completing buyer.

**Architecture:** One root cause — `estimateMakeable` assumes a full ~120-point sweep (flat base 105). Rewrite it into a realistic expected-capture model; the bid policy, sell decision, and buy decision all consume it and improve automatically. Add a K/Q-first sell-exposure rule and a headless measurement harness to tune the constants.

**Tech Stack:** Node.js (CommonJS), `node:test` + `node:assert/strict`, ESLint. No new dependencies.

---

## File structure

- `src/services/bots/botStrategyHelpers.js` — rewrite `estimateMakeable`; add module-local capture-weight constants + a `chooseTrumpSuit` helper.
- `src/services/bots/botConstants.js` — add `SAFETY_MARGIN` (bid-policy constant).
- `src/services/bots/BotStrategy.js` — re-base `decideBid` around expectation − safety margin.
- `src/services/bots/sellEvaluator.js` — `chooseSellExposure` exposes K/Q first.
- `tests/botStrategyHelpers.test.js` — rewrite the value-specific `estimateMakeable` assertions to qualitative ones that survive constant tuning.
- `tests/sellEvaluator.test.js` — add K/Q-first exposure test + a talon-starved sell test.
- `tests/sim-bots-measure.js` — NEW headless measurement harness (declarer make-rate).

Note on test style: estimate unit tests assert **qualitative invariants** (ordering, bounds), never exact tuned values, because Task 6 tunes the numeric constants. Precise make-rate is verified by the harness, not unit tests.

---

### Task 1: Realistic expected-capture `estimateMakeable`

**Files:**
- Modify: `src/services/bots/botStrategyHelpers.js` (the `estimateMakeable` function, ~line 117-146)
- Test: `tests/botStrategyHelpers.test.js` (replace two `describe` blocks)

- [ ] **Step 1: Replace the estimate unit tests with the new semantics**

In `tests/botStrategyHelpers.test.js`, replace the entire `describe('botStrategyHelpers.estimateMakeable', …)` block (currently lines ~75-87) with:

```js
describe('botStrategyHelpers.estimateMakeable', () => {
  it('reports a complete marriage in `complete` and values it near its bonus', () => {
    const hand = [card(0, 'K', 'C'), card(1, 'Q', 'C'), card(2, 'A', 'S')];
    const est = H.estimateMakeable(hand);
    assert.deepEqual(est.complete, ['C']);
    // Clubs marriage (100) dominates; an off-suit ace adds a little. Realistic, not a sweep.
    assert.ok(est.value >= 90 && est.value <= 115, `value ${est.value} in [90,115]`);
  });

  it('values a marriage-less weak hand well below the 100 minimum bid', () => {
    const weak = [card(0, '9', 'D'), card(1, 'J', 'D'), card(2, '9', 'S'), card(3, 'J', 'H')];
    assert.ok(H.estimateMakeable(weak).value < 60, 'weak hand reads weak');
  });

  it('keeps the half-marriage nudge small (a talon might complete it)', () => {
    const halves = [card(0, 'K', 'C'), card(1, 'K', 'S'), card(2, 'K', 'H')]; // 3 half-marriages
    assert.ok(H.estimateMakeable(halves).value <= 20, 'half-marriage-only hand stays low');
  });
});
```

And replace the entire `describe('estimateMakeable — trump length + extra aces nudge (FR-competent)', …)` block (currently lines ~160-180) with:

```js
describe('estimateMakeable — realistic capture model', () => {
  const hand = (cards) => cards.map(([rank, suit]) => ({ rank, suit }));

  it('values surplus aces above an otherwise-flat hand', () => {
    const flat = hand([['J', 'H'], ['9', 'S'], ['J', 'D'], ['9', 'C']]);
    const aces = hand([['A', 'C'], ['A', 'S'], ['A', 'H'], ['9', 'D']]);
    assert.ok(H.estimateMakeable(aces).value > H.estimateMakeable(flat).value);
  });

  it('values a long trump suit above a flat hand (ruffing power)', () => {
    const flat = hand([['J', 'H'], ['9', 'S'], ['J', 'D'], ['9', 'C']]);
    const long = hand([['J', 'C'], ['9', 'C'], ['Q', 'C'], ['10', 'C'], ['J', 'H']]);
    assert.ok(H.estimateMakeable(long).value > H.estimateMakeable(flat).value);
  });

  it('discounts a bare ten (no same-suit ace) below a protected ten', () => {
    const bare = hand([['10', 'H'], ['9', 'S'], ['J', 'D']]);        // 10♥ with no A♥
    const protectedTen = hand([['10', 'H'], ['A', 'H'], ['J', 'D']]); // 10♥ guarded by A♥
    assert.ok(H.estimateMakeable(protectedTen).value > H.estimateMakeable(bare).value);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/botStrategyHelpers.test.js`
Expected: FAIL — the old function still uses the flat-105 base, so the marriage-less hand reads ≥105 (not `< 60`) and the bare-vs-protected ten assertion does not hold.

- [ ] **Step 3: Rewrite `estimateMakeable` and add helpers**

In `src/services/bots/botStrategyHelpers.js`, add these module-local constants just below the existing `MARRIAGE_BONUS` declaration (after line ~18):

```js
// Realistic expected-capture weights (tunable in Task 6 of the bidding-realism plan).
// A declarer in a CONTESTED game does not sweep all 120 trick points, so we estimate
// the points the hand can actually win rather than assuming a full sweep.
const ACE_OFFSUIT_FACTOR = 0.85;  // an off-trump ace can be ruffed away
const TEN_BARE_FACTOR = 0.4;      // a ten with no same-suit ace usually loses to it
const MARRIAGE_FACTOR = 0.9;      // a declared marriage is reliable but needs one lead
const RUFF_PER_TRUMP = 8;         // each trump beyond the third ruffs an opponent point trick
const HALF_MARRIAGE_NUDGE = 5;    // a hidden talon card may complete a half marriage
const HALF_MARRIAGE_CAP = 10;
```

Add this helper just above `estimateMakeable`:

```js
// The suit a declarer would make trump: the longest suit, breaking ties toward the
// higher marriage bonus (so a K/Q-bearing suit wins a length tie). Returns null on an
// empty/suitless hand.
function chooseTrumpSuit(bySuit) {
  let best = null;
  let bestLen = 0;
  let bestBonus = 0;
  for (const suit of Object.keys(bySuit)) {
    const len = bySuit[suit].size;
    const bonus = MARRIAGE_BONUS[suit] ?? 0;
    if (len > bestLen || (len === bestLen && bonus > bestBonus)) {
      best = suit; bestLen = len; bestBonus = bonus;
    }
  }
  return best;
}
```

Replace the whole `estimateMakeable` function body with:

```js
// Estimate the points a declarer can realistically CAPTURE against contesting
// opponents (not a full sweep): discounted aces/tens, ruffing power from a long
// trump suit, and complete-marriage bonuses. Keeps the { value, complete, half }
// shape its callers (bidding, selling, buying) read.
function estimateMakeable(hand) {
  const bySuit = {};
  for (const c of hand) {
    if (!c.suit) { continue; }
    (bySuit[c.suit] ||= new Set()).add(c.rank);
  }
  const trump = chooseTrumpSuit(bySuit);

  let points = 0;
  let completeBonus = 0;
  let halfCount = 0;
  const complete = [];

  for (const suit of Object.keys(bySuit)) {
    const has = bySuit[suit];
    const isTrump = suit === trump;
    if (has.has('A')) {
      points += isTrump ? RANK_VALUE.A : RANK_VALUE.A * ACE_OFFSUIT_FACTOR;
    }
    if (has.has('10')) {
      const protectedTen = isTrump || has.has('A');
      points += protectedTen ? RANK_VALUE['10'] : RANK_VALUE['10'] * TEN_BARE_FACTOR;
    }
    if (has.has('K') && has.has('Q')) {
      completeBonus += MARRIAGE_BONUS[suit] * MARRIAGE_FACTOR;
      complete.push(suit);
    } else if (has.has('K') || has.has('Q')) {
      halfCount += 1;
    }
  }

  const trumpLen = trump ? bySuit[trump].size : 0;
  const ruffBonus = Math.max(0, trumpLen - 3) * RUFF_PER_TRUMP;
  const halfNudge = Math.min(halfCount * HALF_MARRIAGE_NUDGE, HALF_MARRIAGE_CAP);

  const value = Math.round(points + completeBonus + ruffBonus + halfNudge);
  return { value, complete, half: halfCount };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/botStrategyHelpers.test.js`
Expected: PASS (all estimate tests green).

- [ ] **Step 5: Commit**

```bash
git add src/services/bots/botStrategyHelpers.js tests/botStrategyHelpers.test.js
git commit -m "feat(bots): realistic expected-capture estimateMakeable"
```

---

### Task 2: Re-base the bid policy around a safety margin

**Files:**
- Modify: `src/services/bots/botConstants.js` (add `SAFETY_MARGIN`)
- Modify: `src/services/bots/BotStrategy.js:42-53` (`decideBid`)
- Test: `tests/BotStrategy.test.js` (existing `decideBid` suite already covers this)

- [ ] **Step 1: Confirm the existing decideBid tests still express the intended contract**

The existing suite in `tests/BotStrategy.test.js` (`describe('BotStrategy.decideBid', …)`) already asserts: monotonic in aggressiveness; never exceeds `estimateMakeable + MAX_TALON_GAMBLE`; a cautious weak hand passes; the forced last bidder takes the floor. These remain correct under the new policy and need no edit. No new test code in this step.

- [ ] **Step 2: Run them against the new estimate to see the weak-hand pass still holds and nothing regressed**

Run: `node --test tests/BotStrategy.test.js`
Expected: PASS (the suite is robust to the new estimate; this step is a regression gate before editing `decideBid`).

- [ ] **Step 3: Add the `SAFETY_MARGIN` constant**

In `src/services/bots/botConstants.js`, add after the `MAX_TALON_GAMBLE` block (~line 16):

```js
// FR-016/FR-017: a declarer must CAPTURE at least its bid to make the contract, so a
// realistic bot bids below its mean expectation by this margin (mean-bidding ≈ 50% miss).
// Aggressiveness erodes the margin via the talon gamble. Tuned in the bidding-realism plan.
const SAFETY_MARGIN = 15;
```

And add `SAFETY_MARGIN` to the `module.exports` object on the last line:

```js
module.exports = { MIN_BID, MAX_BID, BID_STEP, BARREL_BID_FLOOR, MAX_TALON_GAMBLE, SAFETY_MARGIN, SELL_CUSHION, BUY_MARGIN };
```

- [ ] **Step 4: Re-base `decideBid`**

In `src/services/bots/BotStrategy.js`, add `SAFETY_MARGIN` to the constants import (line ~9):

```js
const { MIN_BID, MAX_BID, BID_STEP, BARREL_BID_FLOOR, MAX_TALON_GAMBLE, SAFETY_MARGIN } = require('./botConstants');
```

Replace the body of `decideBid` (lines ~42-53) with:

```js
  static decideBid(hand, aggressiveness, floor, { forced = false } = {}) {
    const expected = estimateMakeable(hand).value;
    const gamble = Math.round(aggressiveness * MAX_TALON_GAMBLE);
    // Bid below the mean expectation by a safety margin; aggressiveness erodes it.
    const target = roundDownToStep(expected - SAFETY_MARGIN + gamble, BID_STEP);
    if (target >= floor) {
      return { kind: 'bid', amount: Math.min(target, MAX_BID) };
    }
    if (forced) {
      return { kind: 'bid', amount: Math.min(floor, MAX_BID) };
    }
    return { kind: 'pass' };
  }
```

- [ ] **Step 5: Run the bid tests**

Run: `node --test tests/BotStrategy.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/bots/botConstants.js src/services/bots/BotStrategy.js
git commit -m "feat(bots): bid below mean expectation by a safety margin"
```

---

### Task 3: K/Q-first sell exposure + talon-starved sell test

**Files:**
- Modify: `src/services/bots/sellEvaluator.js:29-34` (`chooseSellExposure`)
- Test: `tests/sellEvaluator.test.js` (add two tests)

- [ ] **Step 1: Add the failing tests**

In `tests/sellEvaluator.test.js`, inside `describe('sellEvaluator.chooseSellExposure (FR-competent)', …)`, add this test after the existing one:

```js
  it('exposes a K/Q ahead of a high-point ten to bait a marriage', () => { // per competent-play
    const h = [['A', 'S'], ['10', 'H'], ['10', 'C'], ['Q', 'D']]
      .map(([rank, suit], cardId) => ({ cardId, rank, suit }));
    const ids = sellEvaluator.chooseSellExposure(h, 3);
    assert.ok(ids.includes(3), 'Q♦ exposed as marriage bait');   // the queen
    assert.ok(!ids.includes(2), '10♣ dropped to make room for the queen');
  });
```

In `describe('sellEvaluator.takeOrSell (FR-competent)', …)`, add:

```js
  it('sells when the talon did not lift the hand to the bid', () => { // per competent-play
    const starved = hand([['A', 'S'], ['10', 'S'], ['J', 'H'], ['9', 'D']]); // ~21 expected
    assert.equal(sellEvaluator.takeOrSell(starved, 200, 0.5, 1).kind, 'sellStart');
  });
```

- [ ] **Step 2: Run to verify the exposure test fails**

Run: `node --test tests/sellEvaluator.test.js`
Expected: FAIL — current `chooseSellExposure` sorts by point value only, so it exposes A♠/10♥/10♣ and excludes Q♦ (the new assertion `ids.includes(3)` fails). The talon-starved sell test should already pass with Task 1's estimate.

- [ ] **Step 3: Implement K/Q-first exposure**

In `src/services/bots/sellEvaluator.js`, replace `chooseSellExposure` (lines ~29-34) with:

```js
// Expose `count` cards most likely to entice a buyer. Kings and queens go first — a
// buyer holding the matching half can complete a marriage — then the highest-point
// cards. (buyOrPass re-estimates the merged hand, so exposed marriage bait pays off.)
function chooseSellExposure(hand, count) {
  const isMarriageHalf = (c) => c.rank === 'K' || c.rank === 'Q';
  const sorted = hand.slice().sort((a, b) => {
    const am = isMarriageHalf(a) ? 1 : 0;
    const bm = isMarriageHalf(b) ? 1 : 0;
    if (am !== bm) { return bm - am; }
    return rankValue(b.rank) - rankValue(a.rank);
  });
  return sorted.slice(0, count).map((c) => c.cardId);
}
```

- [ ] **Step 4: Run the sell tests**

Run: `node --test tests/sellEvaluator.test.js`
Expected: PASS (including the existing "exposes the strongest count cards" test, which still holds because its K♣ is exposed first and A♠/10♣ remain the top point cards).

- [ ] **Step 5: Commit**

```bash
git add src/services/bots/sellEvaluator.js tests/sellEvaluator.test.js
git commit -m "feat(bots): expose K/Q first when selling to bait a marriage"
```

---

### Task 4: Headless declarer-make-rate measurement harness

**Files:**
- Create: `tests/sim-bots-measure.js`

- [ ] **Step 1: Write the harness**

Create `tests/sim-bots-measure.js`:

```js
/**
 * Headless bots-only MEASUREMENT harness. Runs full games of 3 server-side bots
 * (no human, no browser) through the real ThousandStore + BotTurnDriver path and
 * reports declarer make-rate + average declarer delta — the metric for "bots don't
 * go negative when they declare" (2026-06-05 bidding-realism work).
 *
 * Usage:  node tests/sim-bots-measure.js [targetRounds]   (default 300)
 */

'use strict';

// Collapse the bot turn timers so games run as fast as the event loop allows.
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, _delay, ...args) => realSetTimeout(fn, 0, ...args);

const ThousandStore = require('../src/services/ThousandStore');
const { VICTORY_THRESHOLD } = require('../src/services/GameRules');

const TARGET_ROUNDS = Number(process.argv[2]) || 300;
const BOT_NAMES = ['Robo-Ada', 'Robo-Max', 'Robo-Vera'];

function seatBots(store, gameId) {
  const players = new Set();
  for (const name of BOT_NAMES) {
    const { playerId } = store._registry.createBot(name);
    store.players.get(playerId).gameId = gameId;
    players.add(playerId);
  }
  store.games.set(gameId, {
    id: gameId, type: 'public', hostId: [...players][0],
    players, requiredPlayers: BOT_NAMES.length, status: 'waiting', inviteCode: null,
    createdAt: Date.now(), round: null, session: null,
  });
}

function playOneGame(store, gameId) {
  return new Promise((resolve) => {
    seatBots(store, gameId);
    store.startRound(gameId);
    const rows = [];
    let lastActivity = Date.now();
    const poll = setInterval(() => {
      const session = store.games.get(gameId)?.session;
      if (!session) { return; }
      while (rows.length < session.history.length) {
        rows.push(session.history[rows.length]);
        lastActivity = Date.now();
      }
      const top = Math.max(0, ...Object.values(session.cumulativeScores));
      if (top >= VICTORY_THRESHOLD || Date.now() - lastActivity > 4000) {
        clearInterval(poll);
        store._botDriver.clearForGame(gameId);
        resolve(rows);
      }
    }, 5);
  });
}

async function main() {
  const store = new ThousandStore();
  const all = [];
  let g = 0;
  while (all.length < TARGET_ROUNDS && g < 200) {
    all.push(...await playOneGame(store, `measure-${g}`));
    g++;
  }

  const decl = all.filter((r) => r.bid != null && r.declarerSeat != null);
  const made = decl.filter((r) => r.declarerMadeBid).length;
  const deltas = decl.map((r) => r.perPlayer[r.declarerSeat].delta);
  const negs = deltas.filter((d) => d < 0);
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const n = decl.length || 1;

  console.log('\n════ BOT DECLARER MEASUREMENT ════');
  console.log(`games played       : ${g}`);
  console.log(`declarer rounds    : ${decl.length}`);
  console.log(`made / missed      : ${made} / ${decl.length - made}`);
  console.log(`MAKE RATE          : ${(100 * made / n).toFixed(1)}%`);
  console.log(`avg declarer delta : ${(sum(deltas) / n).toFixed(1)}`);
  console.log(`avg winning bid    : ${(sum(decl.map((r) => r.bid)) / n).toFixed(1)}`);
  console.log(`negative rounds    : ${negs.length} (avg ${(sum(negs) / (negs.length || 1)).toFixed(0)})`);
  console.log('══════════════════════════════════\n');
  process.exit(0);
}

main();
```

- [ ] **Step 2: Run the harness to confirm it produces stats**

Run: `node tests/sim-bots-measure.js 200`
Expected: prints the measurement block with a numeric MAKE RATE (any value — this step only verifies the harness runs end-to-end without crashing).

- [ ] **Step 3: Commit**

```bash
git add tests/sim-bots-measure.js
git commit -m "test(bots): headless declarer make-rate measurement harness"
```

---

### Task 5: Tune the capture constants to the 65–75% make-rate target

**Files:**
- Modify: `src/services/bots/botStrategyHelpers.js` (capture-weight constants)
- Modify: `src/services/bots/botConstants.js` (`SAFETY_MARGIN`)

- [ ] **Step 1: Establish the baseline**

Run: `node tests/sim-bots-measure.js 300`
Record the MAKE RATE, avg declarer delta, and avg winning bid.

- [ ] **Step 2: Adjust constants toward the target and re-measure**

Target: **MAKE RATE 65–75%** with avg declarer delta ≥ 0. Adjustment levers (change one at a time, re-run `node tests/sim-bots-measure.js 300`):

- Make-rate **too low** (< 65%, bots still overbid/miss): raise `SAFETY_MARGIN` (e.g. 15 → 20/25) in `botConstants.js`, and/or lower `RUFF_PER_TRUMP`/`TEN_BARE_FACTOR`/`MARRIAGE_FACTOR` in `botStrategyHelpers.js` so estimates are more conservative.
- Make-rate **too high** (> 75%, bots too timid, avg bid near 100): lower `SAFETY_MARGIN`, and/or raise the capture weights.

Re-run after each change. Iterate until two consecutive 300-round runs land in 65–75%.

- [ ] **Step 3: Re-run the unit tests to confirm the tuned constants still satisfy the qualitative invariants**

Run: `node --test tests/botStrategyHelpers.test.js tests/sellEvaluator.test.js tests/BotStrategy.test.js`
Expected: PASS. (Invariants are ranges/orderings, so reasonable tuning keeps them green. If a bound is violated, the tuning went outside a sane range — reconsider.)

- [ ] **Step 4: Commit the tuned constants**

```bash
git add src/services/bots/botStrategyHelpers.js src/services/bots/botConstants.js
git commit -m "tune(bots): capture weights for ~70% declarer make-rate"
```

---

### Task 6: Full verification — suite, lint, live browser run

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS (all suites; no regressions in non-bot tests).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: clean (no errors).

- [ ] **Step 3: Final measurement snapshot**

Run: `node tests/sim-bots-measure.js 300`
Expected: MAKE RATE in 65–75%, avg declarer delta ≥ 0. Capture the output for the completion report.

- [ ] **Step 4: One live browser confirmation**

Run: `node tests/e2e-live-bots.js` (1 human host who always passes + 2 bots; watch the bots bid and play a full game in Chrome). Confirm the game completes back in the lobby with no page errors, and the bot bids look sane (not a wall of 200s that then miss).

- [ ] **Step 5: Report results**

Summarize for the user: baseline vs tuned make-rate, avg declarer delta, the live-run outcome. Do not claim success without the actual harness/lint/test output (per verification-before-completion).
```
