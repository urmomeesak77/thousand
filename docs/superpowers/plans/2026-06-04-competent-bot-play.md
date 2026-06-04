# Competent Bot Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server-side bots play competently — win point-rich tricks and duck cheap ones, declare marriages by trump utility, sell hopeless contracts and buy good ones, and bid to real hand strength — without changing any game rule.

**Architecture:** Approach A (heuristic upgrade in place). Add two pure helper modules (`trickPlanner.js`, `sellEvaluator.js`) plus shared primitives in `botStrategyHelpers.js`. `BotStrategy` orchestrates them; `BotTurnDriver` routes three new decision kinds to existing handlers. Everything is a pure function of its arguments, deterministic, and flavored by each bot's existing `aggressiveness`/`memorySkill`.

**Tech Stack:** Node.js (CommonJS), `node --test` runner, ESLint. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-04-competent-bot-play-design.md`

**Conventions:** 2-space indent, semicolons, `const` default, functions ≤ ~20 lines, one class/module responsibility per file. Card objects are `{ cardId, rank, suit }`; `deck[id] = { rank, suit }`; suits are single letters `C/S/H/D` in tests. Run all commands from the repo root `C:/projects/thousand`.

---

## Phase 0 — Shared primitives

### Task 1: Trick primitives in `botStrategyHelpers.js`

**Files:**
- Modify: `src/services/bots/botStrategyHelpers.js`
- Test: `tests/botStrategyHelpers.test.js`

- [ ] **Step 1: Write the failing tests** — append to `tests/botStrategyHelpers.test.js`:

```js
const { trickPoints, cheapestWinner, hasTrumpControl } = require('../src/services/bots/botStrategyHelpers');

describe('trickPoints', () => {
  it('sums the point value of the cards on the table', () => { // per competent-play
    assert.equal(trickPoints([{ rank: 'A', suit: 'H' }, { rank: 'K', suit: 'H' }]), 15); // 11 + 4
    assert.equal(trickPoints([{ rank: '9', suit: 'S' }]), 0);
    assert.equal(trickPoints([]), 0);
  });
});

describe('cheapestWinner', () => {
  const C = (rank, suit) => ({ cardId: 0, rank, suit });
  it('returns the lowest-strength card that beats the current best, trump-aware', () => { // per competent-play
    const legal = [C('A', 'H'), C('K', 'H'), C('J', 'H')];
    const best = { rank: '10', suit: 'H' };
    assert.equal(cheapestWinner(legal, best, null).rank, 'A'); // only A beats 10 in hearts
  });
  it('returns null when nothing beats the best', () => { // per competent-play
    const legal = [{ cardId: 1, rank: '9', suit: 'H' }, { cardId: 2, rank: 'J', suit: 'H' }];
    assert.equal(cheapestWinner(legal, { rank: 'A', suit: 'H' }, null), null);
  });
});

describe('hasTrumpControl', () => {
  const deck = [['A', 'S'], ['10', 'S'], ['K', 'S']].map(([rank, suit], id) => ({ id, rank, suit }));
  it('is true when the bot holds the top remaining trump', () => { // per competent-play
    const hand = [{ cardId: 0, rank: 'A', suit: 'S' }];
    const ctx = { goneCardIds: new Set(), hand, currentTrick: [], deck };
    assert.equal(hasTrumpControl(hand, ctx, 'S'), true);
  });
  it('is false when a higher trump is still unaccounted', () => { // per competent-play
    const hand = [{ cardId: 1, rank: '10', suit: 'S' }];
    const ctx = { goneCardIds: new Set(), hand, currentTrick: [], deck };
    assert.equal(hasTrumpControl(hand, ctx, 'S'), false); // A♠ still out
  });
  it('is false with no trump', () => { // per competent-play
    assert.equal(hasTrumpControl([{ cardId: 0, rank: 'A', suit: 'S' }], { goneCardIds: new Set(), hand: [], currentTrick: [], deck }, null), false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/botStrategyHelpers.test.js`
Expected: FAIL — `trickPoints is not a function` (and the other two undefined).

- [ ] **Step 3: Implement the primitives** — in `src/services/bots/botStrategyHelpers.js`, add before `estimateMakeable`:

```js
// Total point value of the cards currently on the table.
function trickPoints(centerCards) {
  return centerCards.reduce((sum, c) => sum + rankValue(c.rank), 0);
}

// The lowest-strength card in `cards` that beats `best` (trump-aware), or null. Lets a
// bot win a trick without overspending a high card.
function cheapestWinner(cards, best, trump) {
  const winners = cards
    .filter((c) => cardBeats(c, best, trump))
    .sort((a, b) => rankStrength(a.rank) - rankStrength(b.rank));
  return winners[0] ?? null;
}

// True when the bot's highest trump is unbeatable by anything still unaccounted — i.e. it
// holds the top remaining trump, so leading trumps strips opponents without being overtaken.
function hasTrumpControl(hand, context, trump) {
  if (!trump) { return false; }
  const trumps = hand.filter((c) => c.suit === trump)
    .sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank));
  return trumps.length > 0 && isBossCard(trumps[0], context, trump);
}
```

- [ ] **Step 4: Export them** — extend the `module.exports` object in the same file with `trickPoints,`, `cheapestWinner,`, `hasTrumpControl,`.

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/botStrategyHelpers.test.js`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add src/services/bots/botStrategyHelpers.js tests/botStrategyHelpers.test.js
git commit -m "feat(bots): trick-play primitives (points, cheapest winner, trump control)"
```

---

## Phase 1 — Trick planner

### Task 2: `trickPlanner.chooseFollow` — win point tricks, duck cheap ones

**Files:**
- Create: `src/services/bots/trickPlanner.js`
- Test: `tests/trickPlanner.test.js`

- [ ] **Step 1: Write the failing test** — create `tests/trickPlanner.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const trickPlanner = require('../src/services/bots/trickPlanner');

// deck indexed by cardId; helper to build hand/legal objects.
function buildDeck(cards) { return cards.map(([rank, suit], id) => ({ id, rank, suit })); }
const obj = (deck, ids) => ids.map((id) => ({ cardId: id, rank: deck[id].rank, suit: deck[id].suit }));

describe('trickPlanner.chooseFollow (FR-competent)', () => {
  it('wins a point-rich trick with the cheapest winner', () => { // per competent-play
    // led K♥ (4 pts). Bot (last to play) holds A♥, J♥ → win with A♥ to capture the points.
    const deck = buildDeck([['A', 'H'], ['J', 'H'], ['K', 'H']]);
    const hand = obj(deck, [0, 1]);
    const ctx = {
      legal: hand, hand, trump: null, deck, goneCardIds: new Set(),
      currentTrick: [{ seat: 1, cardId: 2 }], playerCount: 3, trickNumber: 3,
    };
    assert.equal(trickPlanner.chooseFollow(ctx).cardId, 0); // A♥
  });

  it('ducks a worthless trick to save the high card', () => { // per competent-play
    // led 9♥ (0 pts). Bot holds A♥, 9♥ → duck with 9♥, keep the ace.
    const deck = buildDeck([['A', 'H'], ['9', 'H'], ['9', 'D']]);
    const hand = obj(deck, [0, 1]);
    const ctx = {
      legal: obj(deck, [0, 1]), hand, trump: null, deck, goneCardIds: new Set(),
      currentTrick: [{ seat: 1, cardId: 2 }], playerCount: 3, trickNumber: 3,
    };
    // led 9♦ is off the bot's hand; bot is void in ♦, no trump → may discard. Duck cheapest.
    assert.equal(trickPlanner.chooseFollow(ctx).cardId, 1); // 9♥, not the ace
  });

  it('does not commit a high card mid-trick unless it is a sure winner', () => { // per competent-play
    // led K♥ (4 pts), bot NOT last (seat after still to play), holds A♥ but a higher heart
    // (none) — A♥ is a sure winner so it still wins. Use a case where the winner is not sure:
    const deck = buildDeck([['K', 'H'], ['9', 'H'], ['A', 'H'], ['10', 'H']]);
    const hand = obj(deck, [0, 1]); // K♥, 9♥
    const ctx = {
      legal: hand, hand, trump: null, deck, goneCardIds: new Set(),
      currentTrick: [{ seat: 2, cardId: 3 }], // led 10♥ (10 pts)
      playerCount: 3, trickNumber: 3,
    };
    // Bot is NOT last (1 of 3 played). K♥ would beat 10♥ but A♥ (unaccounted) could overtake
    // → not a sure winner → duck with 9♥.
    assert.equal(trickPlanner.chooseFollow(ctx).cardId, 1); // 9♥
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/trickPlanner.test.js`
Expected: FAIL — cannot find module `trickPlanner`.

- [ ] **Step 3: Implement `chooseFollow`** — create `src/services/bots/trickPlanner.js`:

```js
'use strict';

const {
  rankValue, rankStrength, findMarriages, pickCard, bestCenterCard, cardBeats,
  cheapestWinner, isBossCard, hasTrumpControl, trickPoints, MARRIAGE_BONUS,
} = require('./botStrategyHelpers');

// K/Q of still-declarable marriages, reserved while a declaration remains reachable.
function reservedMarriageCards(legal, trump, trickNumber) {
  if (trickNumber > 6) { return new Set(); }
  const suits = findMarriages(legal).filter((s) => s !== trump);
  return new Set(legal
    .filter((c) => suits.includes(c.suit) && (c.rank === 'K' || c.rank === 'Q'))
    .map((c) => c.cardId));
}

// Following a trick already in progress: capture point-rich tricks as cheaply as possible,
// otherwise duck with the lowest-value card (keeping aces/tens and reserved marriages).
function chooseFollow(ctx) {
  const { legal, hand, trump, currentTrick, deck, goneCardIds, playerCount, trickNumber } = ctx;
  const reserved = reservedMarriageCards(legal, trump, trickNumber);
  const usable = legal.filter((c) => !reserved.has(c.cardId));
  const pool = usable.length > 0 ? usable : legal;

  const center = currentTrick.map(({ cardId }) => ({ rank: deck[cardId].rank, suit: deck[cardId].suit }));
  const best = bestCenterCard(center, trump);
  const points = trickPoints(center);
  const winner = cheapestWinner(pool, best, trump);
  const amLast = currentTrick.length === playerCount - 1;

  if (winner && points > 0) {
    const sure = isBossCard(winner, { goneCardIds, hand, currentTrick, deck }, trump);
    if (amLast || sure) { return { cardId: winner.cardId }; }
  }
  const duck = pickCard(pool, { highest: false });
  return duck ? { cardId: duck.cardId } : null;
}

module.exports = { chooseFollow, reservedMarriageCards };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/trickPlanner.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/bots/trickPlanner.js tests/trickPlanner.test.js
git commit -m "feat(bots): trickPlanner.chooseFollow — win point tricks, duck cheap ones"
```

---

### Task 3: `trickPlanner.chooseLead` — boss, draw trumps, safe lead

**Files:**
- Modify: `src/services/bots/trickPlanner.js`
- Test: `tests/trickPlanner.test.js`

- [ ] **Step 1: Write the failing tests** — append to `tests/trickPlanner.test.js`:

```js
describe('trickPlanner.chooseLead (FR-competent)', () => {
  const base = (deck, ids, extra) => ({
    legal: obj(deck, ids), hand: obj(deck, ids), trump: null, deck,
    goneCardIds: new Set(), currentTrick: [], playerCount: 3, trickNumber: 1,
    isDeclarer: true, declaredMarriages: [], ...extra,
  });

  it('cashes the highest-point boss card on the lead', () => { // per competent-play
    const deck = buildDeck([['A', 'D'], ['9', 'H']]); // A♦ has nothing above it → boss
    const d = trickPlanner.chooseLead(base(deck, [0, 1]));
    assert.equal(d.cardId, 0); // A♦
  });

  it('draws the top trump when it has trump control', () => { // per competent-play
    const deck = buildDeck([['A', 'S'], ['K', 'S'], ['9', 'H']]);
    // trump S, bot holds A♠ (top) + K♠ → control. No side boss (9♥). Lead A♠.
    const d = trickPlanner.chooseLead(base(deck, [0, 1, 2], { trump: 'S' }));
    assert.equal(d.cardId, 0); // A♠
  });

  it('leads a low side card, keeping aces/tens, when it has no boss or trump control', () => { // per competent-play
    const deck = buildDeck([['A', 'H'], ['9', 'D'], ['J', 'D']]); // A♥ live-beatable? nothing above A → boss!
    // Make A♥ NOT a boss by leaving a higher... there is none above A. Use K♥ instead:
    const deck2 = buildDeck([['K', 'H'], ['9', 'D'], ['J', 'D'], ['A', 'H'], ['10', 'H']]);
    // hand K♥,9♦,J♦. K♥ not boss (A♥,10♥ out). No trump. Lead lowest of longest side suit (♦): 9♦.
    const d = trickPlanner.chooseLead(base(deck2, [0, 1, 2]));
    assert.equal(d.cardId, 1); // 9♦
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/trickPlanner.test.js`
Expected: FAIL — `chooseLead is not a function`.

- [ ] **Step 3: Implement `chooseLead` + helpers** — in `src/services/bots/trickPlanner.js`, add and export:

```js
// Small bonus for making `suit` trump: trump length + protected side aces.
function trumpUsefulness(hand, suit) {
  const trumpLen = hand.filter((c) => c.suit === suit).length;
  const sideAces = hand.filter((c) => c.suit !== suit && c.rank === 'A').length;
  return trumpLen * 2 + sideAces * 3;
}

// Declarer marriage lead (tricks 2–6): declare promptly to bank the bonus, choosing which
// marriage by bonus + trump usefulness. Returns a lead-with-declare, or null.
function chooseMarriageLead(ctx) {
  const { legal, hand, trump, trickNumber } = ctx;
  if (trickNumber < 2 || trickNumber > 6) { return null; }
  const suits = findMarriages(legal).filter((s) => s !== trump);
  if (suits.length === 0) { return null; }
  const bestSuit = suits
    .map((suit) => ({ suit, score: MARRIAGE_BONUS[suit] + trumpUsefulness(hand, suit) }))
    .sort((a, b) => b.score - a.score)[0].suit;
  const king = legal.find((c) => c.rank === 'K' && c.suit === bestSuit);
  return king ? { cardId: king.cardId, declareMarriage: true } : null;
}

// Lead a low card from the longest non-trump side suit, keeping aces/tens. Null if none.
function chooseSafeLead(legal, reserved, trump) {
  const candidates = legal.filter((c) => !reserved.has(c.cardId)
    && c.suit !== trump && c.rank !== 'A' && c.rank !== '10');
  if (candidates.length === 0) { return null; }
  const bySuit = {};
  for (const c of candidates) { (bySuit[c.suit] ||= []).push(c); }
  const longest = Object.keys(bySuit).sort((a, b) => bySuit[b].length - bySuit[a].length)[0];
  return bySuit[longest].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
}

// Leading a fresh trick.
function chooseLead(ctx) {
  const { legal, hand, trump, trickNumber, goneCardIds, currentTrick, deck, isDeclarer } = ctx;
  if (isDeclarer) {
    const marriage = chooseMarriageLead(ctx);
    if (marriage) { return marriage; }
  }
  const reserved = reservedMarriageCards(legal, trump, trickNumber);
  const context = { goneCardIds, hand, currentTrick, deck };
  const boss = legal
    .filter((c) => !reserved.has(c.cardId) && rankValue(c.rank) > 0 && isBossCard(c, context, trump))
    .sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0];
  if (boss) { return { cardId: boss.cardId }; }

  if (trump && hasTrumpControl(hand, context, trump)) {
    const trumps = legal.filter((c) => c.suit === trump)
      .sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank));
    if (trumps.length > 0) { return { cardId: trumps[0].cardId }; }
  }
  const safe = chooseSafeLead(legal, reserved, trump);
  if (safe) { return { cardId: safe.cardId }; }
  const fallback = pickCard(legal.filter((c) => !reserved.has(c.cardId)), { highest: false })
    || pickCard(legal, { highest: false });
  return fallback ? { cardId: fallback.cardId } : null;
}

module.exports = { chooseLead, chooseFollow, reservedMarriageCards };
```

(Replace the previous `module.exports` line.)

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/trickPlanner.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/bots/trickPlanner.js tests/trickPlanner.test.js
git commit -m "feat(bots): trickPlanner.chooseLead — boss/draw-trumps/safe-lead + marriage timing"
```

---

### Task 4: Wire `trickPlanner` into `BotStrategy`; update affected tests

**Files:**
- Modify: `src/services/bots/BotStrategy.js` (`_decideTrickPlay`, `_declarerLead`, `_declarerFollow`, `_bossLead` — replace with planner calls)
- Modify: `tests/BotStrategy.test.js` (rewrite the trick-play preference tests)
- Modify: `tests/BotStrategy.memory.test.js` (refresh memory-contrast scenarios)

- [ ] **Step 1: Rewrite the affected `BotStrategy.test.js` trick-play tests.** Replace the three tests `trick-play non-declarer: dumps the lowest legal (follow-suit) card`, `trick-play declarer follow: wins the trick as cheaply as it can`, and (if present) any "wins worthless trick" assertion with:

```js
it('trick-play non-declarer: wins a point-rich trick with the cheapest winner', () => { // per competent-play
  // led K♥ (4 pts); bot (last) holds A♥,J♥ → capture with A♥.
  const { deck } = deckHand([['A', 'H'], ['J', 'H'], ['K', 'H']]);
  const round = {
    phase: 'trick-play', declarerSeat: 1, currentTurnSeat: 0, playerCount: 3,
    fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
    trickNumber: 3, currentTrumpSuit: null,
    currentTrick: [{ seat: 1, cardId: 2 }], hands: { 0: [0, 1] }, deck,
  };
  const d = BotStrategy.decide(round, 0, 0.5);
  assert.equal(d.kind, 'playCard');
  assert.equal(d.cardId, 0); // A♥
});

it('trick-play declarer follow: ducks a worthless trick to save the high card', () => { // per competent-play
  // led 9♥ (0 pts); declarer holds A♥,9♥ → keep the ace, duck 9♥.
  const { deck } = deckHand([['A', 'H'], ['9', 'H'], ['9', 'S']]);
  const round = {
    phase: 'trick-play', declarerSeat: 0, currentTurnSeat: 1, playerCount: 3,
    fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
    trickNumber: 4, currentTrumpSuit: null,
    currentTrick: [{ seat: 0, cardId: 2 }], hands: { 1: [0, 1] }, deck,
  };
  // (declarer is seat 0 but it is seat 1's turn here; seat 1 is an opponent following)
  const d = BotStrategy.decide(round, 1, 0.5);
  assert.equal(d.cardId, 1); // 9♥
});
```

(Keep the existing `declares a held marriage`, `draws trumps`, four-nines, crawl, and bidding tests unchanged — they still pass under the planner because A♠ is cashed as the boss trump and the single clubs marriage is still declared at trick 2.)

- [ ] **Step 2: Refresh `BotStrategy.memory.test.js` scenarios.** Replace the `declarerRound`/`CARDS` block and its three cases (`plays the feature-009 lead`, `cashes a recalled boss card`, `falls back ... when a higher card is forgotten`) with a hand where the empty-memory lead differs from the memory-enabled boss:

```js
const CARDS = [
  ['K', 'C'],  // 0  K♣ — boss only once A♣ & 10♣ are recalled gone
  ['9', 'D'],  // 1  9♦ — the empty-memory safe lead
  ['J', 'D'],  // 2  J♦
  ['A', 'C'],  // 3
  ['10', 'C'], // 4
  ['A', 'H'],  // 5  unrelated gone card
];
function declarerRound(deck) {
  return {
    phase: 'trick-play', declarerSeat: 0, currentTurnSeat: 0, playerCount: 3,
    fourNinesAckPending: false, isPausedByDisconnect: false, crawlActive: false,
    trickNumber: 1, currentTrumpSuit: null, currentTrick: [], hands: { 0: [0, 1, 2] }, deck,
  };
}

it('with empty knowledge, leads a low safe side card (no boss provable)', () => { // per competent-play
  const d = BotStrategy.decide(declarerRound(buildDeck(CARDS)), 0, 0.5);
  assert.equal(d.cardId, 1); // 9♦ — lowest of the long ♦ side suit, K♣ not provably boss
});

it('cashes K♣ once A♣ and 10♣ are recalled gone', () => { // per FR-012
  const knowledge = { goneCardIds: new Set([3, 4]) };
  const d = BotStrategy.decide(declarerRound(buildDeck(CARDS)), 0, 0.5, knowledge);
  assert.equal(d.cardId, 0); // K♣ is now a guaranteed winner
});

it('falls back to the safe lead when a higher club is forgotten (memory mistake)', () => { // per FR-013
  const knowledge = { goneCardIds: new Set([3]) }; // 10♣ forgotten
  const d = BotStrategy.decide(declarerRound(buildDeck(CARDS)), 0, 0.5, knowledge);
  assert.equal(d.cardId, 1); // 9♦ — cannot prove K♣ safe
});
```

(The opponent-boss test that cashes a bare ace `A♣` stays valid — an ace is an inherent boss; keep it but drop its dependence on `goneCardIds` being the *only* reason, updating its comment to "an ace is always a boss.")

- [ ] **Step 3: Run the two test files to verify they FAIL against current `BotStrategy`**

Run: `node --test tests/BotStrategy.test.js tests/BotStrategy.memory.test.js`
Expected: FAIL (old `_declarerLead`/dump logic still active).

- [ ] **Step 4: Replace the trick-play methods in `BotStrategy.js`.** Add `const trickPlanner = require('./trickPlanner');` near the top imports. Replace `_decideTrickPlay`, `_bossLead`, `_declarerLead`, and `_declarerFollow` with:

```js
  static _decideTrickPlay(round, seat, knowledge) {
    if (round.fourNinesAckPending) {
      return round.fourNinesAcks.has(seat) ? null : { kind: 'acknowledgeFourNines' };
    }
    if (round.isPausedByDisconnect || round.currentTurnSeat !== seat) { return null; }
    if (round.crawlActive) {
      const lowest = pickCard(handCards(round, seat), { highest: false });
      return lowest ? { kind: 'crawlCommit', cardId: lowest.cardId } : null;
    }
    const legal = legalCards(round, seat);
    if (legal.length === 0) { return null; }
    const ctx = {
      legal, hand: handCards(round, seat), trump: round.currentTrumpSuit,
      trickNumber: round.trickNumber, goneCardIds: knowledge.goneCardIds || new Set(),
      currentTrick: round.currentTrick, deck: round.deck, playerCount: round.playerCount,
      isDeclarer: seat === round.declarerSeat, declaredMarriages: round.declaredMarriages || [],
    };
    const decision = round.currentTrick.length === 0
      ? trickPlanner.chooseLead(ctx)
      : trickPlanner.chooseFollow(ctx);
    if (!decision) { return null; }
    return { kind: 'playCard', cardId: decision.cardId, ...(decision.declareMarriage ? { declareMarriage: true } : {}) };
  }
```

Delete `_bossLead`, `_declarerLead`, `_declarerFollow` (their logic now lives in `trickPlanner`). Remove now-unused imports/helpers from `BotStrategy.js` only if ESLint flags them (`declarableMarriageSuits`, `reservedMarriageCards`, `bestCenterCard`, `cardBeats`, `rankStrength`, `rankValue`, `isBossCard`, `MARRIAGE_BONUS` may become unused — delete the unused ones to keep lint clean).

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/BotStrategy.test.js tests/BotStrategy.memory.test.js tests/trickPlanner.test.js`
Expected: PASS.

- [ ] **Step 6: Run the broader bot + memory suite for regressions**

Run: `node --test tests/BotMemory.test.js tests/botStrategyHelpers.boss.test.js tests/BotTurnDriver.test.js tests/bots-autoplay.integration.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/bots/BotStrategy.js tests/BotStrategy.test.js tests/BotStrategy.memory.test.js
git commit -m "feat(bots): route trick play through trickPlanner; update strategy tests to competent play"
```

---

## Phase 2 — Selling

### Task 5: `sellEvaluator.takeOrSell` and `buyOrPass`

**Files:**
- Create: `src/services/bots/sellEvaluator.js`
- Modify: `src/services/bots/botConstants.js` (add `SELL_CUSHION`, `BUY_MARGIN`)
- Test: `tests/sellEvaluator.test.js`

- [ ] **Step 1: Add constants** — in `src/services/bots/botConstants.js`, add to the object and exports:

```js
// Selling: how far below the bid a declarer tolerates before selling, and how far above
// the bid an opponent needs before buying. Both shrink with aggressiveness.
const SELL_CUSHION = 30;
const BUY_MARGIN = 20;
```

(Add `SELL_CUSHION, BUY_MARGIN` to `module.exports`.)

- [ ] **Step 2: Write the failing tests** — create `tests/sellEvaluator.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sellEvaluator = require('../src/services/bots/sellEvaluator');

const hand = (cards) => cards.map(([rank, suit], cardId) => ({ cardId, rank, suit }));

describe('sellEvaluator.takeOrSell (FR-competent)', () => {
  it('takes when the hand can make the bid', () => { // per competent-play
    const strong = hand([['K', 'C'], ['Q', 'C'], ['A', 'S'], ['A', 'H']]); // clubs marriage + aces
    assert.equal(sellEvaluator.takeOrSell(strong, 120, 0.5, 1).kind, 'startGame');
  });
  it('sells a hopeless hand', () => { // per competent-play
    const weak = hand([['9', 'D'], ['J', 'D'], ['9', 'S'], ['J', 'H']]);
    assert.equal(sellEvaluator.takeOrSell(weak, 200, 0.5, 1).kind, 'sellStart');
  });
  it('is forced to take when no sell attempts remain', () => { // per competent-play
    const weak = hand([['9', 'D'], ['J', 'D']]);
    assert.equal(sellEvaluator.takeOrSell(weak, 200, 0.5, 0).kind, 'startGame');
  });
  it('a bolder bot takes a thinner hand than a cautious one', () => { // per competent-play
    const marginal = hand([['K', 'S'], ['Q', 'S'], ['9', 'D'], ['J', 'H']]); // spades marriage only
    const cautious = sellEvaluator.takeOrSell(marginal, 130, 0, 1).kind;
    const bold = sellEvaluator.takeOrSell(marginal, 130, 1, 1).kind;
    assert.ok(!(cautious === 'startGame' && bold === 'sellStart')); // bold never more timid
  });
});

describe('sellEvaluator.buyOrPass (FR-competent)', () => {
  it('buys when the exposed cards make the contract clearly profitable', () => { // per competent-play
    const own = hand([['K', 'C'], ['Q', 'C']]);           // own clubs marriage
    const exposed = [{ rank: 'A', suit: 'S' }, { rank: 'A', suit: 'H' }, { rank: '10', suit: 'C' }];
    const d = sellEvaluator.buyOrPass(own, exposed, 100, 0.5, null);
    assert.equal(d.kind, 'sellBid');
    assert.ok(d.amount >= 100);
  });
  it('passes when the merged hand cannot beat the bid', () => { // per competent-play
    const own = hand([['9', 'D'], ['J', 'D']]);
    const exposed = [{ rank: '9', suit: 'S' }, { rank: 'J', suit: 'H' }, { rank: 'Q', suit: 'D' }];
    assert.equal(sellEvaluator.buyOrPass(own, exposed, 200, 0.5, null).kind, 'sellPass');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test tests/sellEvaluator.test.js`
Expected: FAIL — cannot find module `sellEvaluator`.

- [ ] **Step 4: Implement** — create `src/services/bots/sellEvaluator.js`:

```js
'use strict';

const { estimateMakeable, roundDownToStep } = require('./botStrategyHelpers');
const { MIN_BID, MAX_BID, BID_STEP, SELL_CUSHION, BUY_MARGIN } = require('./botConstants');

// Declarer's post-bid decision: take a makeable hand, else sell. Bolder bots tolerate a
// thinner hand (smaller effective cushion). Forced to take when no attempts remain.
function takeOrSell(hand, bid, aggressiveness, attemptsLeft) {
  if (attemptsLeft <= 0) { return { kind: 'startGame' }; }
  const cushion = SELL_CUSHION * (1 - aggressiveness);
  if (estimateMakeable(hand).value >= bid - cushion) { return { kind: 'startGame' }; }
  return { kind: 'sellStart' };
}

// Opponent's sell-auction decision: buy only when the exposed cards merged into the hand
// make the contract clearly profitable, bidding the makeable value within the legal range.
function buyOrPass(hand, exposedCards, bid, aggressiveness, currentHighBid) {
  const merged = [...hand, ...exposedCards.map((c, i) => ({ cardId: -1 - i, rank: c.rank, suit: c.suit }))];
  const makeable = estimateMakeable(merged).value;
  const margin = BUY_MARGIN * (1 - aggressiveness);
  const target = bid + margin;
  if (makeable < target) { return { kind: 'sellPass' }; }
  const smallest = currentHighBid === null || currentHighBid === undefined ? MIN_BID : currentHighBid + BID_STEP;
  const amount = Math.min(MAX_BID, Math.max(smallest, roundDownToStep(makeable, BID_STEP)));
  if (amount < smallest) { return { kind: 'sellPass' }; }
  return { kind: 'sellBid', amount };
}

module.exports = { takeOrSell, buyOrPass };
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/sellEvaluator.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/bots/sellEvaluator.js src/services/bots/botConstants.js tests/sellEvaluator.test.js
git commit -m "feat(bots): sellEvaluator take/sell + buy/pass decisions"
```

---

### Task 6: `sellEvaluator.chooseSellExposure`

**Files:**
- Modify: `src/services/bots/sellEvaluator.js`
- Test: `tests/sellEvaluator.test.js`

- [ ] **Step 1: Write the failing test** — append:

```js
describe('sellEvaluator.chooseSellExposure (FR-competent)', () => {
  it('exposes the strongest `count` cards to entice a buyer', () => { // per competent-play
    const hand = [['A', 'S'], ['9', 'D'], ['K', 'C'], ['J', 'H'], ['10', 'C']]
      .map(([rank, suit], cardId) => ({ cardId, rank, suit }));
    const ids = sellEvaluator.chooseSellExposure(hand, 3);
    assert.equal(ids.length, 3);
    assert.ok(ids.includes(0)); // A♠ (11)
    assert.ok(ids.includes(4)); // 10♣ (10)
    assert.ok(ids.includes(2)); // K♣ (4) — next highest
    assert.ok(!ids.includes(1)); // not the 9♦ (0)
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/sellEvaluator.test.js`
Expected: FAIL — `chooseSellExposure is not a function`.

- [ ] **Step 3: Implement** — add to `sellEvaluator.js` (and add `rankValue` to the require from `./botStrategyHelpers`):

```js
// Expose the strongest `count` cards (highest point value) — the most enticing to a buyer.
function chooseSellExposure(hand, count) {
  return hand.slice()
    .sort((a, b) => rankValue(b.rank) - rankValue(a.rank))
    .slice(0, count)
    .map((c) => c.cardId);
}
```

Add `chooseSellExposure` to `module.exports`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/sellEvaluator.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/bots/sellEvaluator.js tests/sellEvaluator.test.js
git commit -m "feat(bots): sellEvaluator.chooseSellExposure — expose strongest cards"
```

---

### Task 7: Wire selling into `BotStrategy` + `BotTurnDriver`

**Files:**
- Modify: `src/services/bots/BotStrategy.js` (`decide` switch: `post-bid-decision`, new `selling-selection`, `selling-bidding`)
- Modify: `src/services/bots/BotTurnDriver.js` (`_execute`: `sellStart`, `sellSelect`, `sellBid`)
- Test: `tests/BotStrategy.test.js`, `tests/BotTurnDriver.test.js`

- [ ] **Step 1: Write the failing tests** — append to `tests/BotStrategy.test.js`:

```js
describe('BotStrategy.decide — selling (FR-competent)', () => {
  it('post-bid: declarer sells a hopeless hand', () => { // per competent-play
    const { deck } = deckHand([['9', 'D'], ['J', 'D'], ['9', 'S'], ['J', 'H']]);
    const round = {
      phase: 'post-bid-decision', declarerSeat: 0, currentTurnSeat: 0,
      currentHighBid: 200, hands: { 0: [0, 1, 2, 3] }, deck,
      attemptCount: 0, _game: {},
    };
    assert.equal(BotStrategy.decide(round, 0, 0.5).kind, 'sellStart');
  });

  it('post-bid: declarer takes a makeable hand', () => { // per competent-play
    const { deck } = deckHand([['K', 'C'], ['Q', 'C'], ['A', 'S'], ['A', 'H']]);
    const round = {
      phase: 'post-bid-decision', declarerSeat: 0, currentTurnSeat: 0,
      currentHighBid: 120, hands: { 0: [0, 1, 2, 3] }, deck, attemptCount: 0, _game: {},
    };
    assert.equal(BotStrategy.decide(round, 0, 0.5).kind, 'startGame');
  });

  it('selling-selection: declarer exposes exactly playerCount cards', () => { // per competent-play
    const { deck } = deckHand([['A', 'S'], ['9', 'D'], ['K', 'C'], ['J', 'H']]);
    const round = {
      phase: 'selling-selection', declarerSeat: 0, playerCount: 3,
      hands: { 0: [0, 1, 2, 3] }, deck,
    };
    const d = BotStrategy.decide(round, 0, 0.5);
    assert.equal(d.kind, 'sellSelect');
    assert.equal(d.cardIds.length, 3);
  });

  it('selling-bidding: opponent passes a poor exposed hand', () => { // per competent-play
    const { deck } = deckHand([['9', 'D'], ['J', 'D'], ['9', 'S'], ['J', 'H'], ['Q', 'D']]);
    const round = {
      phase: 'selling-bidding', declarerSeat: 0, currentTurnSeat: 1, playerCount: 3,
      currentHighBid: 200, hands: { 1: [0, 1] }, exposedSellCards: [2, 3, 4], deck,
    };
    assert.equal(BotStrategy.decide(round, 1, 0.5).kind, 'sellPass');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/BotStrategy.test.js`
Expected: FAIL (declarer still returns `startGame` always; `selling-selection` returns null).

- [ ] **Step 3: Implement the routing in `BotStrategy.js`.** Add `const sellEvaluator = require('./sellEvaluator');` and `const { MAX_SELL_ATTEMPTS } = ...` is not needed — use `round.attemptCount`. Update the `decide` switch and the sell helpers:

```js
      case 'post-bid-decision': return BotStrategy._decidePostBid(round, seat, aggressiveness);
      case 'selling-selection': return seat === round.declarerSeat ? BotStrategy._decideSellSelection(round, seat) : null;
      case 'selling-bidding': return BotStrategy._decideSellBidding(round, seat, aggressiveness);
```

Add these static methods and replace the old `_decideSellBidding`:

```js
  static _decidePostBid(round, seat, aggressiveness) {
    if (seat !== round.declarerSeat) { return null; }
    const attemptsLeft = 3 - (round.attemptCount || 0); // MAX_SELL_ATTEMPTS is 3
    return sellEvaluator.takeOrSell(handCards(round, seat), round.currentHighBid, aggressiveness, attemptsLeft);
  }

  static _decideSellSelection(round, seat) {
    const cardIds = sellEvaluator.chooseSellExposure(handCards(round, seat), round.playerCount);
    return cardIds.length === round.playerCount ? { kind: 'sellSelect', cardIds } : null;
  }

  static _decideSellBidding(round, seat, aggressiveness) {
    if (seat === round.declarerSeat || round.currentTurnSeat !== seat) { return null; }
    const exposed = (round.exposedSellCards || []).map((id) => ({ rank: round.deck[id].rank, suit: round.deck[id].suit }));
    const bid = round.currentHighBid;
    return sellEvaluator.buyOrPass(handCards(round, seat), exposed, bid, aggressiveness, round.currentHighBid);
  }
```

Note: `MAX_SELL_ATTEMPTS` is `3` in `src/services/Round.js` (confirmed), hence `3 - attemptCount`.

- [ ] **Step 4: Add `_decidePostBid`/`takeOrSell` signature note** — `takeOrSell` is called with `(hand, bid, aggressiveness, attemptsLeft)`. `_decidePostBid` passes `round.currentHighBid` as the bid; ensure `round.currentHighBid` is the winning bid at post-bid (it is — set in `submitBid`).

- [ ] **Step 5: Wire `BotTurnDriver._execute`** — add cases in the `switch (decision.kind)`:

```js
      case 'sellStart': return h.handleSellStart(botId);
      case 'sellSelect': return h.handleSellSelect(botId, decision.cardIds);
      case 'sellBid': return h.handleSellBid(botId, decision.amount);
```

- [ ] **Step 6: Run to verify pass**

Run: `node --test tests/BotStrategy.test.js tests/sellEvaluator.test.js tests/BotTurnDriver.test.js`
Expected: PASS. (If a `BotTurnDriver.test.js` case asserted the old `sellPass`-always behavior, update it to the new buy/pass expectation with a comment.)

- [ ] **Step 7: Run the bots-only integration to confirm a full round still completes**

Run: `node --test tests/bots-autoplay.integration.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/services/bots/BotStrategy.js src/services/bots/BotTurnDriver.js tests/BotStrategy.test.js tests/BotTurnDriver.test.js
git commit -m "feat(bots): bots sell hopeless contracts and buy good ones"
```

---

## Phase 3 — Bidding tune

### Task 8: Refine `estimateMakeable` for trump length + extra aces

**Files:**
- Modify: `src/services/bots/botStrategyHelpers.js` (`estimateMakeable`)
- Test: `tests/botStrategyHelpers.test.js`, `tests/BotStrategy.test.js` (verify bound tests still hold)

- [ ] **Step 1: Write the failing test** — append to `tests/botStrategyHelpers.test.js`:

```js
describe('estimateMakeable — trump length + extra aces (FR-competent)', () => {
  const H = (cards) => cards.map(([rank, suit]) => ({ rank, suit }));
  it('values a long suit and multiple aces above a flat hand of equal marriages', () => { // per competent-play
    const flat = H([['J', 'H'], ['9', 'S'], ['J', 'D'], ['9', 'C']]);
    const rich = H([['A', 'C'], ['A', 'S'], ['A', 'H'], ['10', 'C'], ['K', 'C'], ['Q', 'C']]);
    assert.ok(estimateMakeable(rich).value > estimateMakeable(flat).value);
  });
  it('stays bounded — never exceeds the sweepable ceiling by more than the small nudge', () => { // per competent-play
    const huge = H([['A', 'C'], ['A', 'S'], ['A', 'H'], ['A', 'D'], ['10', 'C'], ['10', 'S']]);
    assert.ok(estimateMakeable(huge).value <= 105 + 100 + 40); // base + clubs-marriage cap region + nudge cap
  });
});
```

- [ ] **Step 2: Run to verify failure / characterize**

Run: `node --test tests/botStrategyHelpers.test.js`
Expected: the first case may already pass via marriage bonus; the bound case characterizes the cap. If both pass, tighten the first to assert the *nudge* specifically (see Step 3) before implementing.

- [ ] **Step 3: Implement the nudge** — in `estimateMakeable`, after computing `completeBonus`/`halfCount`, add a small capped bonus and fold into `value`:

```js
  // Competent nudge: long trump-capable suits and surplus aces make a hand stronger.
  const longestSuit = Math.max(0, ...Object.values(bySuit).map((s) => s.size));
  const aceCount = hand.filter((c) => c.rank === 'A').length;
  const nudge = Math.min((longestSuit >= 4 ? (longestSuit - 3) * 5 : 0) + Math.max(0, aceCount - 1) * 5, 20);
  const value = 105 + completeBonus + Math.min(halfCount * 5, 10) + nudge;
```

(Replace the existing `const value = ...` line. `bySuit[suit]` is a `Set` of ranks — `.size` is the suit length.)

- [ ] **Step 4: Run to verify pass + no decideBid regression**

Run: `node --test tests/botStrategyHelpers.test.js tests/BotStrategy.test.js`
Expected: PASS. The `decideBid` bound test computes its bound from `estimateMakeable`, so it stays consistent; the weak-hand-passes test uses a flat hand with no long suit/extra aces, so the nudge is 0 and it still passes.

- [ ] **Step 5: Commit**

```bash
git add src/services/bots/botStrategyHelpers.js tests/botStrategyHelpers.test.js
git commit -m "feat(bots): value trump length and extra aces in bid estimate"
```

---

## Phase 4 — Polish & validation

### Task 9: Full regression, lint, coverage, and a bots-only sanity sim

**Files:**
- Verify only (no new source); optionally re-run `tests/sim-bots-only.js` if kept.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: `pass` count up, `fail 0`. Fix any regressions before proceeding.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: exit 0, no output. Remove any unused imports flagged in `BotStrategy.js`.

- [ ] **Step 3: Coverage on the new/changed bot files**

Run: `npm run test:coverage`
Expected: `trickPlanner.js`, `sellEvaluator.js`, `botStrategyHelpers.js`, `BotStrategy.js` each ≥ 90% line coverage. Add targeted tests for any uncovered branch.

- [ ] **Step 4: Bots-only sanity (qualitative)** — if `tests/sim-bots-only.js` exists, run it and confirm: declarers now sometimes **sell**, marriages are declared at sensible moments, follow play **captures point tricks**, and the game still reaches a scored result with **no errors**.

Run: `node tests/sim-bots-only.js`
Expected: a clean transcript ending in a final standings block, no thrown errors.

- [ ] **Step 5: Commit any test additions from Step 3**

```bash
git add -A
git commit -m "test(bots): coverage top-up for competent-play helpers"
```

---

## Self-review notes (addressed)

- **Spec coverage:** trick order → Tasks 2–4; marriage timing → Task 3 (`chooseMarriageLead`); selling → Tasks 5–7; bidding → Task 8; personality → `aggressiveness` in Tasks 5/7, `memorySkill` via existing recall feeding `chooseLead`/`chooseFollow` (Task 4).
- **Type consistency:** card objects are `{ cardId, rank, suit }` throughout; `chooseLead`/`chooseFollow` both return `{ cardId, declareMarriage? }`; `takeOrSell`→`{kind:'startGame'|'sellStart'}`, `buyOrPass`→`{kind:'sellBid',amount}|{kind:'sellPass'}`, `chooseSellExposure`→`number[]`.
- **Verify-before-claim:** every implementation task ends by running its tests; Phase 4 gates on full suite + lint + coverage.
- **Open risk:** `MAX_SELL_ATTEMPTS` confirmed `3` in `Round.js` (Task 7 uses `3 - attemptCount`).
```
