# Trick Winner Hold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the trick-resolve sequence so the 5 s winner announcement happens with the three played cards still visible in the center, *before* they fly to the winner's stack.

**Architecture:** Single-file frontend timing change in `TrickPlayView`. `_handleTrickResolve` now schedules the collect-flight to run *after* a 5 s hold, and applies the status override up front. `_finalizeTrickResolve` simplifies — its previous responsibilities (status override, nickname lookup) move to `_handleTrickResolve`, leaving it as a clean "clear center + unlock controls" hook for the flight's onLand and the rAF safety-net.

**Tech Stack:** Vanilla JS ES6 modules, Antlion engine timers, jsdom + Node test runner.

**Spec:** `docs/superpowers/specs/2026-05-19-trick-winner-hold-design.md`

---

## File Structure

Only one source file changes plus its test:

- Modify: `src/public/js/thousand/TrickPlayView.js`
  - Remove `RESOLVE_PAUSE_MS` constant.
  - Rewrite `_handleTrickResolve(winnerSeat)`.
  - Simplify `_finalizeTrickResolve()`.
- Modify: `tests/TrickPlayView.test.js`
  - Update the existing "trick resolve schedules collect-flight after pause" test's comments to reflect the new 5 s hold.
  - Add a new focused test asserting the pause-schedule delay is `TRICK_WINNER_HOLD_MS` (not the old 350 ms).
  - Add a test asserting `setStatusOverride` is called up front (before the flight) when a `getPlayerNickname` resolver is provided.

No other files are affected. The server, scoring code, message contracts, and round-summary handoff all remain unchanged.

---

### Task 1: Add failing test for new pause duration

**Files:**
- Test: `tests/TrickPlayView.test.js`

- [ ] **Step 1: Add the failing test**

Insert this new `describe` block after the existing "trick resolve schedules collect-flight after pause" block (after line 385 in the current file):

```javascript
describe('TrickPlayView — trick resolve holds 5 seconds before collect-flight', () => {
  it('pause-schedule delay is 5000ms (TRICK_WINNER_HOLD_MS), not 350ms', () => {
    const cardsById = {
      1: { id: 1, rank: 'A', suit: '♣' },
      2: { id: 2, rank: 'K', suit: '♣' },
      3: { id: 3, rank: 'Q', suit: '♣' },
    };
    const { view, antlion } = makeTrickPlayView(DEFAULT_SEATS, { cardsById });

    view.render(makeGameStatus({
      currentTrick: [
        { seat: 0, cardId: 1, rank: 'A', suit: '♣' },
        { seat: 1, cardId: 2, rank: 'K', suit: '♣' },
      ],
    }));

    // Own play (seat 0) of the 3rd card. extraPauseMs is 0 in this branch,
    // so the pause schedule delay equals TRICK_WINNER_HOLD_MS exactly.
    view.notifyCardPlayed(0, 3);
    view.render(makeGameStatus({
      currentTrick: [],
      collectedTrickCounts: { 0: 1, 1: 0, 2: 0 },
    }));

    // Two schedules: the pause (collect-flight trigger) and the safety-net.
    // The lower of the two delays is the pause; assert it is the 5s hold.
    const delays = antlion._scheduled.map((s) => s.delay).sort((a, b) => a - b);
    assert.equal(delays[0], 5000,
      'pause schedule must be 5000ms (TRICK_WINNER_HOLD_MS), not the old 350ms');
  });

  it('opponent-3rd-card adds FLIGHT_MS to the pause delay', () => {
    const cardsById = {
      1: { id: 1, rank: 'A', suit: '♣' },
      2: { id: 2, rank: 'K', suit: '♣' },
      3: { id: 3, rank: 'Q', suit: '♣' },
    };
    const { view, antlion } = makeTrickPlayView(DEFAULT_SEATS, { cardsById });

    view.render(makeGameStatus({
      currentTrick: [
        { seat: 0, cardId: 1, rank: 'A', suit: '♣' },
        { seat: 1, cardId: 2, rank: 'K', suit: '♣' },
      ],
    }));

    // Opponent (seat 2) plays the 3rd card. extraPauseMs is FLIGHT_MS (500),
    // so the pause schedule delay is 5500.
    view.notifyCardPlayed(2, 3);
    view.render(makeGameStatus({
      currentTrick: [],
      collectedTrickCounts: { 0: 1, 1: 0, 2: 0 },
    }));

    const delays = antlion._scheduled.map((s) => s.delay).sort((a, b) => a - b);
    assert.equal(delays[0], 5500,
      'opponent-3rd-card: pause delay must be TRICK_WINNER_HOLD_MS + FLIGHT_MS');
  });

  it('setStatusOverride is called up front with the winner nickname', () => {
    const cardsById = {
      1: { id: 1, rank: 'A', suit: '♣' },
      2: { id: 2, rank: 'K', suit: '♣' },
      3: { id: 3, rank: 'Q', suit: '♣' },
    };
    const overrideCalls = [];
    const doc = dom.window.document;
    const el = doc.createElement('div');
    doc.body.appendChild(el);
    const trickCenterEl = doc.createElement('div');
    doc.body.appendChild(trickCenterEl);
    const seatEls = {
      0: doc.createElement('div'),
      1: doc.createElement('div'),
      2: doc.createElement('div'),
    };
    for (const e of Object.values(seatEls)) { doc.body.appendChild(e); }

    const antlion = makeMockAntlion();
    const view = new dom.window.TrickPlayView(el, {
      antlion,
      dispatcher: makeMockDispatcher(),
      seats: DEFAULT_SEATS,
      handView: makeMockHandView(),
      cardsById,
      trickCenterEl,
      getSeatEl: (s) => seatEls[s] ?? null,
      setControlsLocked: () => {},
      setStatusOverride: (text, ms) => overrideCalls.push({ text, ms }),
      getPlayerNickname: (seat) => (seat === 0 ? 'kashka' : `seat${seat}`),
    });

    view.render(makeGameStatus({
      currentTrick: [
        { seat: 0, cardId: 1, rank: 'A', suit: '♣' },
        { seat: 1, cardId: 2, rank: 'K', suit: '♣' },
      ],
    }));
    view.notifyCardPlayed(0, 3);
    view.render(makeGameStatus({
      currentTrick: [],
      collectedTrickCounts: { 0: 1, 1: 0, 2: 0 },
    }));

    assert.equal(overrideCalls.length, 1,
      'setStatusOverride must be called exactly once during trick resolve');
    assert.equal(overrideCalls[0].text, 'kashka won the trick');
    // Duration spans the 5s hold + 500ms collect-flight = 5500ms (own 3rd card).
    assert.equal(overrideCalls[0].ms, 5500,
      'override duration must cover hold + flight');
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- --test-name-pattern="holds 5 seconds before collect-flight"`
Expected: 3 tests fail. `delays[0]` is `350` not `5000`; the second test's `delays[0]` is `850` not `5500`; `overrideCalls.length` is `0` (override currently happens in `_finalizeTrickResolve`, after the safety-net fires, which doesn't run in this test).

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/TrickPlayView.test.js
git commit -m "Test: trick-winner hold of 5s precedes collect-flight"
```

---

### Task 2: Reorder `_handleTrickResolve` and simplify `_finalizeTrickResolve`

**Files:**
- Modify: `src/public/js/thousand/TrickPlayView.js` (constants, `_handleTrickResolve`, `_finalizeTrickResolve`)

- [ ] **Step 1: Remove `RESOLVE_PAUSE_MS` constant**

In `src/public/js/thousand/TrickPlayView.js`, delete the constant at the top of the file. Current state:

```javascript
const FLIGHT_MS = 500;
const RESOLVE_PAUSE_MS = 350;
const TRICK_WINNER_HOLD_MS = 5000;
```

Replace with:

```javascript
const FLIGHT_MS = 500;
const TRICK_WINNER_HOLD_MS = 5000;
```

- [ ] **Step 2: Replace `_handleTrickResolve`**

Find the existing method (starts at line 233 in the current file, ends at line 272) and replace its body with the new sequence:

```javascript
  _handleTrickResolve(winnerSeat) {
    // The 3rd card needs to appear before the collect-flight kicks off. For the
    // opponent case we run a normal flight (not a snap) so the play is visible —
    // and add FLIGHT_MS to the hold so the flight lands before the 5s hold begins
    // ticking down.
    let extraPauseMs = 0;
    if (this._pendingPlayed) {
      const { seat, cardId } = this._pendingPlayed;
      const identity = this._cardsById[cardId];
      if (identity && !this._centerCards.some((c) => c.cardId === cardId)) {
        if (seat === this._seats.self) {
          this._commitToCenter(seat, cardId, identity.rank, identity.suit);
        } else {
          this._startOpponentFlight(seat, cardId, identity.rank, identity.suit);
          extraPauseMs = FLIGHT_MS;
        }
      }
    }

    this._resolveFinalized = false;
    this._pendingWinnerSeat = winnerSeat;
    this._setControlsLocked(true);

    // Set the winner banner up front so it is visible during the hold AND the
    // collect-flight. Duration spans the opponent-landing pause (if any), the
    // 5s hold, and the collect-flight.
    const nickname = this._getPlayerNickname(winnerSeat);
    const totalSequenceMs = extraPauseMs + TRICK_WINNER_HOLD_MS + FLIGHT_MS;
    if (nickname) {
      this._setStatusOverride(`${nickname} won the trick`, totalSequenceMs);
    }

    // Hold the three cards in the centre for 5 seconds (plus any opponent-landing
    // pause), then run the collect-flight to the winner's stack.
    const holdMs = extraPauseMs + TRICK_WINNER_HOLD_MS;
    const pauseId = this._antlion.schedule(holdMs, () => {
      this._scheduledIds.delete(pauseId);
      this._collectFlightToWinner(winnerSeat);
    });
    this._scheduledIds.add(pauseId);

    // Why: rAF is throttled/paused in occluded or background browser windows, so
    // an onLand-only release can hang forever (the game lock would stay engaged and
    // mountForPhase would stop firing). This setTimeout-based safety net guarantees
    // the lock releases on a real-time deadline regardless of frame painting.
    const safetyId = this._antlion.schedule(holdMs + FLIGHT_MS + 200, () => {
      this._scheduledIds.delete(safetyId);
      this._finalizeTrickResolve();
    });
    this._scheduledIds.add(safetyId);
  }
```

- [ ] **Step 3: Simplify `_finalizeTrickResolve`**

Find the existing method (starts at line 274) and replace its body. The status-override and nickname-lookup logic moves to `_handleTrickResolve`, so this method just clears and unlocks:

```javascript
  _finalizeTrickResolve() {
    if (this._resolveFinalized) { return; }
    this._resolveFinalized = true;
    this._clearCenter();
    this._pendingWinnerSeat = null;
    this._setControlsLocked(false);
  }
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npm test -- --test-name-pattern="holds 5 seconds before collect-flight"`
Expected: all 3 tests pass.

- [ ] **Step 5: Run the full TrickPlayView test file to catch regressions**

Run: `node --test tests/TrickPlayView.test.js`
Expected: all tests pass. The existing "trick resolve schedules collect-flight after pause" test still passes — it asserts on schedule count (still 2) and the visible 3 cards during the pause (still true; the pause is now 5 s instead of 350 ms but the assertion is unchanged).

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: clean (no warnings or errors on `TrickPlayView.js`).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass. No other test asserts on `RESOLVE_PAUSE_MS` or the 350 ms timing — grep confirms zero matches outside the deleted constant.

- [ ] **Step 8: Commit**

```bash
git add src/public/js/thousand/TrickPlayView.js
git commit -m "Trick resolve: 5s winner hold precedes collect-flight"
```

---

### Task 3: Update the comment on the existing resolve-pause test

**Files:**
- Modify: `tests/TrickPlayView.test.js` (one outdated comment)

- [ ] **Step 1: Update the test name and inline comment**

The existing `describe` block at line 329 has the outdated text:

```javascript
describe('TrickPlayView — trick resolve schedules collect-flight after pause', () => {
  it('counts diff triggers controls-lock, 350ms pause holds 3 cards, then spawns collect-flight', () => {
```

Replace with:

```javascript
describe('TrickPlayView — trick resolve schedules collect-flight after hold', () => {
  it('counts diff triggers controls-lock, 5s hold keeps 3 cards in centre, then spawns collect-flight', () => {
```

(The test body itself stays — it asserts on schedule count and visible card count, both of which remain accurate.)

- [ ] **Step 2: Run the renamed test**

Run: `node --test tests/TrickPlayView.test.js`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/TrickPlayView.test.js
git commit -m "Test: rename resolve-pause test to reflect 5s hold"
```

---

### Task 4: Manual verification

**Files:** none

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts on port 3000.

- [ ] **Step 2: Open three browser windows and play through a round to a complete trick**

Steps:
1. Open three windows to `http://localhost:3000/`.
2. Three players join the same game, complete bidding, declarer's exchange, and reach trick-play.
3. Play through a full trick (3 cards).

Expected behavior:
- After the 3rd card lands, the three cards remain in the centre slots for ~5 seconds.
- The status box (above the talon) reads `"<winner> won the trick"` for the entire hold.
- After 5 seconds, all three cards fly to the winner's stack.
- The status override clears as the flight lands; the next trick begins.

- [ ] **Step 3: Verify last-trick behavior**

Continue playing all 10 tricks of the round.

Expected: the final trick follows the same flow — 5 s hold with cards in center, flight to winner — and *then* the round summary screen appears. No regression in the transition.

- [ ] **Step 4: Verify background-tab safety net**

Trigger a trick resolve, then immediately switch to another browser tab. Wait 10–15 seconds, switch back.

Expected: controls are unlocked and the next trick is playable, even though rAF was throttled while the tab was occluded. (The setTimeout-based safety-net schedule fires regardless of rAF.)

- [ ] **Step 5: If all manual checks pass, no commit needed (no file changes)**

---

## Spec Coverage Self-Check

- Spec §"Affected Code · Constants": Task 2 Step 1 removes `RESOLVE_PAUSE_MS`. ✅
- Spec §"Affected Code · `_handleTrickResolve`" steps 1–5: Task 2 Step 2's replacement body implements all five steps in order. ✅
- Spec §"Affected Code · `_finalizeTrickResolve` — simplified" steps 1–3: Task 2 Step 3's replacement body. ✅
- Spec §"Last-Trick Parity": Task 4 Step 3 manual verification. No code changes needed (server-driven). ✅
- Spec §"Tests": Task 1 adds focused tests for delay and override-up-front; Task 3 updates the outdated test comment. The existing collect-flight destination test (`tests/TrickPlayView.test.js:510`) asserts on rect math — untouched by this change. ✅
- Spec §"Non-Goals": no overlay UI, no server change, no first-two-cards flight change — confirmed in Task 2's edits. ✅
