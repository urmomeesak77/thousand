# Barrel: Freeze Non-Declarer Scoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player on the barrel (cumulative score in `[880, 1000)`) scores 0 as a non-declarer, so the only way to gain points or win is to win a bid.

**Architecture:** Gate the round-delta at its single source — `Scoring.roundDeltas`. Add an optional `onBarrelSeats` set; a non-declarer in that set gets `delta = 0`. The one caller, `RoundActionBroadcaster.computeRoundEnd`, builds the set from `game.session.barrelState`. Because the same `deltas` object feeds both the summary `delta` field and the cumulative-score update, display and scoring stay consistent.

**Tech Stack:** Node.js CommonJS, `node:test` runner, `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-06-05-barrel-non-declarer-scoring-design.md`

---

## File Structure

- `src/services/Scoring.js` — `roundDeltas` gains the `onBarrelSeats` parameter (the rule).
- `src/services/RoundActionBroadcaster.js` — `computeRoundEnd` builds and passes the on-barrel set (the wiring).
- `tests/Scoring.test.js` — unit tests for the gated `roundDeltas`.
- `tests/Game.barrel.test.js` — integration test: frozen non-declarer cannot cross 1000 without bidding.

---

### Task 1: Gate `roundDeltas` on barrel state

**Files:**
- Modify: `src/services/Scoring.js:54-67`
- Test: `tests/Scoring.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the `describe('Scoring.roundDeltas — FR-014', ...)` block in `tests/Scoring.test.js`:

```js
it('non-declarer on barrel scores 0 instead of their collected points', () => {
  const scores = { 0: 110, 1: 40, 2: 5 };
  // seat 1 is on the barrel → its 40 points are frozen to 0
  const deltas = Scoring.roundDeltas(scores, 0, 100, 3, new Set([1]));
  assert.equal(deltas[0], 100); // declarer unaffected
  assert.equal(deltas[1], 0);   // on-barrel non-declarer frozen
  assert.equal(deltas[2], 5);   // other non-declarer unaffected
});

it('declarer on barrel still scores ±bid (gating must not touch the declarer)', () => {
  const made = Scoring.roundDeltas({ 0: 120, 1: 0, 2: 0 }, 0, 100, 3, new Set([0]));
  assert.equal(made[0], 100);
  const missed = Scoring.roundDeltas({ 0: 80, 1: 0, 2: 0 }, 0, 100, 3, new Set([0]));
  assert.equal(missed[0], -100);
});

it('multiple on-barrel non-declarers are all frozen', () => {
  const deltas = Scoring.roundDeltas({ 0: 60, 1: 30, 2: 30 }, 0, 100, 3, new Set([1, 2]));
  assert.equal(deltas[1], 0);
  assert.equal(deltas[2], 0);
});

it('omitting onBarrelSeats preserves legacy behavior', () => {
  const withDefault = Scoring.roundDeltas({ 0: 110, 1: 40, 2: 5 }, 0, 100);
  assert.equal(withDefault[1], 40);
  assert.equal(withDefault[2], 5);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/Scoring.test.js`
Expected: FAIL — the "on barrel" cases report `deltas[1]` of `40`/`30` instead of `0`.

- [ ] **Step 3: Implement the gate**

Replace the body of `roundDeltas` in `src/services/Scoring.js` (lines 54-67):

```js
function roundDeltas(roundScoresMap, declarerSeat, bid, playerCount = 3, onBarrelSeats = new Set()) {
  // The 4th positional arg was historically an (ignored) `penalties` array in
  // feature 005; tolerate a non-integer here so those legacy callers default to 3.
  const n = Number.isInteger(playerCount) ? playerCount : 3;
  const deltas = initSeatMap(n, 0);
  for (const seat of seatRange(n)) {
    if (seat === declarerSeat) {
      deltas[seat] = roundScoresMap[seat] >= bid ? bid : -bid;
    } else if (onBarrelSeats.has(seat)) {
      // On the barrel: a non-declarer scores nothing — points come only from
      // winning a bid (design 2026-06-05-barrel-non-declarer-scoring).
      deltas[seat] = 0;
    } else {
      deltas[seat] = roundScoresMap[seat];
    }
  }
  return deltas;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/Scoring.test.js`
Expected: PASS (all roundDeltas cases, including the legacy `[]`-as-4th-arg test).

- [ ] **Step 5: Commit**

```bash
git add src/services/Scoring.js tests/Scoring.test.js
git commit -m "feat(scoring): freeze non-declarer round delta while on the barrel"
```

---

### Task 2: Wire barrel state into `computeRoundEnd`

**Files:**
- Modify: `src/services/RoundActionBroadcaster.js:25-27`
- Test: `tests/Game.barrel.test.js`

- [ ] **Step 1: Read the existing barrel integration test setup**

Open `tests/Game.barrel.test.js` and note how it constructs a `Game`/session, seeds `cumulativeScores`/`barrelState`, and drives a round to end (so the new test matches the existing harness rather than inventing one).

- [ ] **Step 2: Write the failing integration test**

Add a test that asserts a non-declarer who *enters a round on the barrel* gains 0 cumulative from collected points. Match the file's existing setup style; the assertion is the new part:

```js
it('a non-declarer on the barrel gains no cumulative points from collected tricks', () => {
  // Arrange: build a round at end-of-trick-play where a non-declarer seat is
  // on the barrel (barrelState[seat].onBarrel === true) and has collected
  // point-bearing cards, while a different seat is the declarer.
  // (Use the same Game/Round construction helper this file already uses.)
  const before = game.session.cumulativeScores[onBarrelSeat];

  broadcaster.computeRoundEnd(game, round);

  assert.equal(round.roundDeltas[onBarrelSeat], 0);
  assert.equal(game.session.cumulativeScores[onBarrelSeat], before);
});
```

If `tests/Game.barrel.test.js` has no end-to-end round driver, place this test in the file that already exercises `RoundActionBroadcaster.computeRoundEnd` end-to-end and reuse its setup; do not build a fresh harness.

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/Game.barrel.test.js`
Expected: FAIL — `roundDeltas[onBarrelSeat]` equals the collected points, and cumulative increased.

- [ ] **Step 4: Pass the on-barrel set through `computeRoundEnd`**

In `src/services/RoundActionBroadcaster.js`, replace line 27:

```js
round.roundDeltas = roundDeltas(round.roundScores, round.declarerSeat, round.currentHighBid, round.playerCount);
```

with:

```js
const onBarrelSeats = new Set(
  seatRange(round.playerCount).filter((s) => game.session.barrelState[s]?.onBarrel),
);
round.roundDeltas = roundDeltas(
  round.roundScores, round.declarerSeat, round.currentHighBid, round.playerCount, onBarrelSeats,
);
```

Confirm `seatRange` is imported in this file; if not, add it to the existing `require('./Seats')` destructure (it is already used for `perPlayer` construction at line 39, so the import exists).

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/Game.barrel.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/RoundActionBroadcaster.js tests/Game.barrel.test.js
git commit -m "feat(round): apply barrel scoring freeze at round end"
```

---

### Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (no regression in `Game.barrel`, `Game.multiround`, `Round.buildSummary.penalties`, `Scoring`).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit any lint fixes (only if needed)**

```bash
git add -A
git commit -m "chore: lint after barrel scoring freeze"
```

---

## Self-Review

- **Spec coverage:** Approach A (gate in `roundDeltas`) → Task 1. Wiring from `barrelState` → Task 2. Declarer-untouched, multi-seat, legacy-default cases → Task 1 tests. Cumulative-not-crossing-1000 behavior → Task 2 integration test. Four-nines and UI explicitly out of scope per spec — no tasks, intentionally.
- **Placeholder scan:** Task 2's test body intentionally defers the *setup* to the file's existing harness (a real constraint, not a placeholder) while specifying the exact assertions; all code that constitutes the change (Task 1 implementation, Task 2 wiring) is given in full.
- **Type consistency:** `onBarrelSeats` is a `Set<number>` everywhere — built with `new Set([...])` in Task 2, consumed via `.has(seat)` in Task 1. `seatRange` and `barrelState[s].onBarrel` match the names used in `RoundActionBroadcaster.js` and `Game.js`.
