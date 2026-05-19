# Trick-Resolve Flight & Opponent Stack Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the after-trick animation translate cards into the winner's hand-stack region at constant size (no zoom), and keep each opponent's face-down stack synced with their real hand size as they play.

**Architecture:** Add `opponentHandSizes` to the server's `gameStatus` view model so every status-bearing WS message carries live counts. The frontend `GameScreen.updateStatus` applies these counts to the `OpponentView`s. In `TrickPlayView._collectFlightToWinner`, replace the seat-container destination rect with a card-sized rect anchored on the winner's stack element — this makes `_spawnFlight`'s scale calculation stay ≈ 1.

**Tech Stack:** Node.js (server, CommonJS), vanilla ES6 modules (frontend), Node built-in test runner, jsdom for DOM tests.

---

## File Structure

**Server:**
- `src/services/RoundSnapshot.js` — extend `buildViewModel(round, seat)` to include `opponentHandSizes`.

**Client:**
- `src/public/js/thousand/GameScreen.js` — apply `gameStatus.opponentHandSizes` to opponent views in `updateStatus`.
- `src/public/js/thousand/TrickPlayView.js` — new `_destRectForWinner(seat)`; `_collectFlightToWinner` uses it.

**Tests:**
- `tests/Round.trickplay.test.js` — add an assertion that `buildViewModel` exposes `opponentHandSizes` during trick-play.
- `tests/TrickPlayView.test.js` — add an assertion that the collect-flight destination rect has card width (≈ source card width), not the seat container width.
- `tests/GameScreen.gating.test.js` — add an assertion that `updateStatus` with a `gameStatus.opponentHandSizes` map calls `setCardCount` on left/right `OpponentView`.

---

## Task 1: Server — expose `opponentHandSizes` on `gameStatus`

**Files:**
- Modify: `src/services/RoundSnapshot.js` (function `buildViewModel`, ~line 60-91)
- Test: `tests/Round.trickplay.test.js` (append a new `describe` block)

- [ ] **Step 1: Write the failing test**

Append to `tests/Round.trickplay.test.js`:

```javascript
describe('RoundSnapshot — gameStatus.opponentHandSizes (trick-play live counts)', () => {
  it('view model includes opponentHandSizes for the two non-self seats', () => {
    const { round } = setupTrickPlay(); // existing helper in this file
    const { buildViewModel } = require('../src/services/RoundSnapshot');

    // hands are populated by setupTrickPlay; verify per-seat self view
    for (const selfSeat of [0, 1, 2]) {
      const vm = buildViewModel(round, selfSeat);
      assert.ok(vm.opponentHandSizes, `seat ${selfSeat}: opponentHandSizes must be present`);
      const expected = {};
      for (const s of [0, 1, 2]) {
        if (s !== selfSeat) {expected[s] = round.hands[s].length;}
      }
      assert.deepEqual(vm.opponentHandSizes, expected,
        `seat ${selfSeat}: opponentHandSizes must mirror round.hands lengths for non-self seats`);
    }
  });

  it('opponentHandSizes shrinks as a non-self seat plays a card', () => {
    const { round } = setupTrickPlay();
    const { buildViewModel } = require('../src/services/RoundSnapshot');
    const before = buildViewModel(round, 0).opponentHandSizes[1];
    round.hands[1].pop(); // simulate seat-1 having played a card
    const after = buildViewModel(round, 0).opponentHandSizes[1];
    assert.equal(after, before - 1, 'opponent count must decrement with the hand');
  });
});
```

If `setupTrickPlay` does not yet exist in `tests/Round.trickplay.test.js`, replace the helper call with whatever existing test fixture sets up a round with populated hands — the existing file should have something equivalent; reuse it as-is rather than building a new one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="opponentHandSizes"`
Expected: FAIL — `vm.opponentHandSizes` is `undefined`.

- [ ] **Step 3: Implement — add field to `buildViewModel`**

In `src/services/RoundSnapshot.js`, inside `buildViewModel(round, seat)`'s returned object, add a new field. Locate the `return {` block (around line 63) and add this line just above the closing brace:

```javascript
opponentHandSizes: buildOpponentHandSizesFor(round, seat),
```

(`buildOpponentHandSizesFor` is already defined and exported in this file at ~line 115.)

- [ ] **Step 4: Run the new test to verify pass**

Run: `npm test -- --test-name-pattern="opponentHandSizes"`
Expected: PASS, both cases.

- [ ] **Step 5: Run the full test suite to verify no regression**

Run: `npm test`
Expected: All tests pass (no existing test depends on `gameStatus` not having this field).

- [ ] **Step 6: Commit**

```bash
git add src/services/RoundSnapshot.js tests/Round.trickplay.test.js
git commit -m "Add opponentHandSizes to gameStatus view model"
```

---

## Task 2: Client — apply `opponentHandSizes` in `GameScreen.updateStatus`

**Files:**
- Modify: `src/public/js/thousand/GameScreen.js` (method `updateStatus`, lines 238-251)
- Test: `tests/GameScreen.gating.test.js` (append new `describe`)

- [ ] **Step 1: Read the existing test scaffolding**

Open `tests/GameScreen.gating.test.js`. Note how it loads modules and constructs a `GameScreen`. The existing tests use jsdom + `loadModule`; reuse the same setup.

- [ ] **Step 2: Write the failing test**

Append to `tests/GameScreen.gating.test.js` (adjust mock construction to match the file's existing patterns):

```javascript
describe('GameScreen — updateStatus applies opponentHandSizes to opponent views', () => {
  it('setCardCount is called for left and right opponents from gameStatus.opponentHandSizes', () => {
    const { gameScreen, captureOpponentCounts } = makeGameScreenForUpdate();
    // captureOpponentCounts: helper that swaps in spy setCardCount on
    // gameScreen._leftOpponent and gameScreen._rightOpponent, returns
    // { left: [], right: [] } that accumulate calls.
    const counts = captureOpponentCounts();
    gameScreen.updateStatus({
      phase: 'Trick play',
      opponentHandSizes: { 1: 6, 2: 7 },
      collectedTrickCounts: { 0: 0, 1: 0, 2: 0 },
    });
    // seats wired such that left=seat 1, right=seat 2.
    assert.deepEqual(counts.left, [6], 'left opponent setCardCount must receive 6');
    assert.deepEqual(counts.right, [7], 'right opponent setCardCount must receive 7');
  });

  it('no setCardCount calls when seats are not yet known', () => {
    const { gameScreen, captureOpponentCounts } = makeGameScreenForUpdate({ skipSeats: true });
    const counts = captureOpponentCounts();
    gameScreen.updateStatus({
      phase: 'Bidding',
      opponentHandSizes: { 1: 6, 2: 7 },
    });
    assert.deepEqual(counts.left, [], 'no calls before seats are set');
    assert.deepEqual(counts.right, []);
  });
});
```

You will need to add `makeGameScreenForUpdate` near the existing helpers in this file. Implement it as:

```javascript
function makeGameScreenForUpdate(opts = {}) {
  const doc = dom.window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const antlion = makeMockAntlion();          // existing helper
  const dispatcher = makeMockDispatcher();    // existing helper (or stub)
  const gameScreen = new dom.window.GameScreen(antlion, container, dispatcher);
  if (!opts.skipSeats) {
    gameScreen._seats = {
      self: 0, left: 1, right: 2,
      players: [
        { seat: 0, playerId: 'p0', nickname: 'Self' },
        { seat: 1, playerId: 'p1', nickname: 'Left' },
        { seat: 2, playerId: 'p2', nickname: 'Right' },
      ],
    };
  }
  const captureOpponentCounts = () => {
    const left = []; const right = [];
    gameScreen._leftOpponent.setCardCount  = (n) => left.push(n);
    gameScreen._rightOpponent.setCardCount = (n) => right.push(n);
    return { left, right };
  };
  return { gameScreen, captureOpponentCounts };
}
```

If `makeMockDispatcher` doesn't exist in this test file, stub one inline:
```javascript
function makeMockDispatcher() { return { sendRequestSnapshot() {} }; }
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="opponentHandSizes to opponent views"`
Expected: FAIL — `counts.left` is `[]` (or whatever the current behavior emits) because `updateStatus` does not propagate the counts.

- [ ] **Step 4: Implement in `GameScreen.updateStatus`**

Edit `src/public/js/thousand/GameScreen.js`. Replace the existing `updateStatus` method:

```javascript
  updateStatus(gameStatus) {
    this._lastGameStatus = gameStatus;
    this._renderStatus(gameStatus);
    if (gameStatus.phase === 'Card exchange') {
      this._talonView.clear();
    }
    this._applyOpponentHandSizes(gameStatus.opponentHandSizes);
    if (this._canMountNow(gameStatus)) {
      this._controls.mountForPhase(gameStatus);
      this._lastMountedPhase = gameStatus.phase;
      this._pendingMountStatus = null;
    } else {
      this._pendingMountStatus = gameStatus;
    }
  }

  _applyOpponentHandSizes(sizes) {
    if (!sizes || !this._seats) { return; }
    const left = sizes[this._seats.left];
    const right = sizes[this._seats.right];
    if (typeof left === 'number') { this._leftOpponent.setCardCount(left); }
    if (typeof right === 'number') { this._rightOpponent.setCardCount(right); }
  }
```

- [ ] **Step 5: Run the new tests to verify pass**

Run: `npm test -- --test-name-pattern="opponentHandSizes to opponent views"`
Expected: PASS, both cases.

- [ ] **Step 6: Run the full test suite to verify no regression**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/public/js/thousand/GameScreen.js tests/GameScreen.gating.test.js
git commit -m "Sync opponent stack to gameStatus.opponentHandSizes on every status update"
```

---

## Task 3: Client — collect-flight targets card-sized destination

**Files:**
- Modify: `src/public/js/thousand/TrickPlayView.js` (method `_collectFlightToWinner`, lines 279-303; new helper `_destRectForWinner`)
- Test: `tests/TrickPlayView.test.js` (append new `describe`)

- [ ] **Step 1: Write the failing test**

Append to `tests/TrickPlayView.test.js`:

```javascript
describe('TrickPlayView — collect-flight target is card-sized (no zoom)', () => {
  it('flight clones have width close to source card width, not seat-container width', () => {
    const doc = dom.window.document;
    const cardsById = {
      1: { id: 1, rank: 'A', suit: '♣' },
      2: { id: 2, rank: 'K', suit: '♣' },
      3: { id: 3, rank: 'Q', suit: '♣' },
    };
    const { view, trickCenterEl, antlion, seatEls } = makeTrickPlayView(DEFAULT_SEATS, { cardsById });

    // Stretch the winner's seat container so it's much wider than a card. If
    // the flight scaled to seat width, the clone's transform would multiply
    // by this large ratio. Targeting a card-sized rect avoids that.
    Object.defineProperty(seatEls[1], 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 200, width: 800, height: 200 }),
    });
    // The winner's stack child (added by OpponentView in real code) is
    // sized to one card. Inject one for the test:
    const stackEl = doc.createElement('div');
    stackEl.className = 'opponent-view__stack';
    Object.defineProperty(stackEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 80, bottom: 110, width: 80, height: 110 }),
    });
    seatEls[1].appendChild(stackEl);

    // Drive a trick that seat 1 wins.
    view.render(makeGameStatus({
      currentTrick: [
        { seat: 0, cardId: 1, rank: 'A', suit: '♣' },
        { seat: 2, cardId: 2, rank: 'K', suit: '♣' },
      ],
    }));
    // Fix the card sprite size so width is deterministic.
    for (const sprite of trickCenterEl.querySelectorAll('.card-sprite')) {
      Object.defineProperty(sprite, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, right: 80, bottom: 110, width: 80, height: 110 }),
      });
    }
    view.notifyCardPlayed(1, 3);
    view.render(makeGameStatus({
      currentTrick: [],
      collectedTrickCounts: { 0: 0, 1: 1, 2: 0 },
    }));
    // Sprite for the 3rd card was just added; fix its rect too.
    for (const sprite of trickCenterEl.querySelectorAll('.card-sprite')) {
      if (!sprite.getBoundingClientRect || sprite.getBoundingClientRect().width !== 80) {
        Object.defineProperty(sprite, 'getBoundingClientRect', {
          value: () => ({ left: 0, top: 0, right: 80, bottom: 110, width: 80, height: 110 }),
        });
      }
    }

    // Fire the pause callback → spawns the collect-flight.
    antlion._scheduled.shift().cb();

    const clones = doc.querySelectorAll('.card-flight-clone');
    assert.ok(clones.length >= 1, 'collect-flight must spawn clones');
    for (const clone of clones) {
      const w = parseFloat(clone.style.width || '0');
      assert.ok(w > 0 && w < 200,
        `clone start width must be card-sized (got ${w})`);
    }
    // Drain remaining schedules and clean up.
    antlion._fireScheduled();
    view.destroy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="card-sized"`
Expected: FAIL or PASS-by-accident. If it PASSes today, it's because the clone's CSS `width` is the *source* width, not the post-scale destination. The new behavior we want is that the *destination rect* is card-sized too (so the in-flight `scale` computed inside `_spawnFlight` stays ≈ 1). Refine the assertion to also check the computed scale by inspecting the transform applied by `tick()`. If you cannot inspect the transform here without running the rAF loop, replace the assertion with one that directly reads the destination rect — exposed via the next step.

To make the test deterministic, instead expose `_destRectForWinner` and assert on its returned width:

```javascript
const cardRect = trickCenterEl.querySelector('.card-sprite').getBoundingClientRect();
const dest = view._destRectForWinner(1);
assert.ok(dest, 'destination rect must exist');
assert.ok(Math.abs(dest.width - cardRect.width) < 1,
  `destination width (${dest.width}) must match source card width (${cardRect.width})`);
```

Use this version of the test instead of the clone-style one if exposing the helper is simpler.

- [ ] **Step 3: Implement `_destRectForWinner` + use it**

Edit `src/public/js/thousand/TrickPlayView.js`. Add a helper above `_collectFlightToWinner`:

```javascript
  // Returns a card-sized destination rect for the post-trick collect-flight.
  // Anchors on the winner's hand-stack area so the flight clones don't scale
  // up against a wide seat container. Width matches a centre-card source so
  // _spawnFlight's scale stays ≈ 1 (no "zoom to viewer's face" effect).
  _destRectForWinner(winnerSeat) {
    const seatEl = this._getSeatEl(winnerSeat);
    if (!seatEl) { return null; }
    const cardWidth = this._centerCards[0]?.cardEl?.getBoundingClientRect().width ?? 0;
    // Self: aim at the rightmost hand card if any, else the right edge of the hand row.
    if (winnerSeat === this._seats?.self) {
      const last = seatEl.querySelector('[data-card-id]:last-of-type');
      if (last) { return last.getBoundingClientRect(); }
    } else {
      // Opponent: aim at the face-down stack widget.
      const stack = seatEl.querySelector('.opponent-view__stack');
      if (stack) {
        const r = stack.getBoundingClientRect();
        // Clamp width to a single card so the flight doesn't scale up to the
        // full stack width.
        return { left: r.left, top: r.top, width: Math.min(r.width, cardWidth || r.width), height: r.height,
                 right: r.left + Math.min(r.width, cardWidth || r.width), bottom: r.bottom };
      }
    }
    // Fallback: centre the destination on the seat element with card width.
    const r = seatEl.getBoundingClientRect();
    const w = cardWidth || Math.min(r.width, 100);
    const h = w * 1.4; // card aspect ratio fallback
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, right: cx + w / 2, bottom: cy + h / 2 };
  }
```

Then replace the current `_collectFlightToWinner` body's destination computation:

```javascript
  _collectFlightToWinner(winnerSeat) {
    const destRect = this._destRectForWinner(winnerSeat);
    if (!destRect || this._centerCards.length === 0) {
      this._finalizeTrickResolve();
      return;
    }
    const cards = [...this._centerCards];
    let landed = 0;
    const onLand = () => {
      landed += 1;
      if (landed >= cards.length) {
        this._finalizeTrickResolve();
      }
    };
    for (const entry of cards) {
      const fromRect = entry.cardEl.getBoundingClientRect();
      this._spawnFlight({
        fromRect, toRect: destRect, rank: entry.rank, suit: entry.suit,
        duration: FLIGHT_MS, onDone: onLand,
      });
      entry.cardEl.style.visibility = 'hidden';
    }
  }
```

- [ ] **Step 4: Run the new test to verify pass**

Run: `npm test -- --test-name-pattern="card-sized"`
Expected: PASS.

- [ ] **Step 5: Run the full TrickPlayView test file to verify no regression**

Run: `npm test -- tests/TrickPlayView.test.js`
Expected: All tests pass — the existing collect-flight test (`counts diff triggers controls-lock…`) still expects 3 clones; the change only affects clone size/scale, not count.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 8: Manual sanity check (optional, recommended)**

Run: `npm start`
Open three browsers (or use the `thousand-live-e2e` skill) and play a round through to a trick resolve. Verify:
1. Centre cards translate to the winner's stack region at roughly constant size (no zoom).
2. Opponent face-down stacks shrink by one card each time they play.

If something looks off, do not patch around it — file a follow-up.

- [ ] **Step 9: Commit**

```bash
git add src/public/js/thousand/TrickPlayView.js tests/TrickPlayView.test.js
git commit -m "Collect-flight: target winner's stack at card size, not seat container"
```

---

## Self-Review

**Spec coverage:**
- Server adds `opponentHandSizes` to gameStatus → Task 1 ✓
- Client applies counts via `updateStatus` → Task 2 ✓
- Collect-flight targets card-sized rect → Task 3 ✓
- Tests for view-model addition → Task 1 ✓
- Tests for flight destination → Task 3 ✓
- Tests for client count application → Task 2 ✓

**Placeholder scan:** None of the steps use "TBD", "implement later", or hand-wave validations. Each code block is complete.

**Type consistency:**
- `buildOpponentHandSizesFor` exists in `RoundSnapshot.js` (verified at line 115).
- `_leftOpponent` / `_rightOpponent` are set in `GameScreen._buildDom` (verified at lines 79-80).
- `_getSeatEl` is constructor-injected on `TrickPlayView` (verified at line 17) and exposed by `GameScreen.getSeatEl` (line 87).
- `OpponentView` exposes `setCardCount` (verified at line 21).
- CSS class `.opponent-view__stack` is the parent of stack cards (verified at index.css line 876).
- `_centerCards[i].cardEl` is the in-DOM sprite for each centre slot (verified at TrickPlayView.js line 224).

No type mismatches introduced.
