# Round-summary auto-continue timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-fire the local viewer's "Continue to Next Round" press 30 seconds after the round-summary screen appears, showing a live countdown in the button label.

**Architecture:** All logic lives in `src/public/js/thousand/RoundSummaryScreen.js`. When the enabled Continue button renders, start a managed `Antlion.scheduleInterval(1000, …)` that decrements a remaining-seconds counter, updates the button label each tick, and on reaching 0 cancels itself and invokes the existing `_onContinueClick()`. The timer is torn down on manual click, on `destroy()`, and at the top of each `render()`. No server or CSS changes.

**Tech Stack:** Vanilla JS ES modules, Antlion engine timer API (`scheduleInterval`/`cancelInterval`), Node.js built-in test runner + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-02-round-summary-auto-continue-design.md`

---

## File Structure

- Modify: `src/public/js/thousand/RoundSummaryScreen.js` — add countdown constant, timer start/cancel logic, button-label updates, teardown hooks.
- Modify: `tests/RoundSummaryScreen.test.js` — extend the mock Antlion with controllable `scheduleInterval`/`cancelInterval`; add a describe block for the auto-continue timer.

---

### Task 1: Controllable interval timer in the test mock

The existing `makeMockAntlion()` has no-op `schedule`/`cancelScheduled` and no interval methods. Add controllable interval methods so tests can drive ticks deterministically.

**Files:**
- Test: `tests/RoundSummaryScreen.test.js:29-45`

- [ ] **Step 1: Extend the mock Antlion with interval control**

In `tests/RoundSummaryScreen.test.js`, replace the `makeMockAntlion()` function (lines 29-45) with a version exposing the registered interval callback and id bookkeeping:

```js
function makeMockAntlion() {
  const handlers = {};
  const intervals = new Map();
  let nextId = 1;
  return {
    bindInput(el, event, type) {
      const fn = (e) => { if (handlers[type]) handlers[type](e); };
      el.addEventListener(event, fn);
      return () => el.removeEventListener(event, fn);
    },
    onInput(type, handler) { handlers[type] = handler; },
    offInput(type, handler) { if (handlers[type] === handler) { delete handlers[type]; } },
    onTick() {},
    schedule() { return 0; },
    cancelScheduled() {},
    scheduleInterval(delay, cb) { const id = nextId++; intervals.set(id, cb); return id; },
    cancelInterval(id) { intervals.delete(id); },
    emit() {},
    stop() {},
    // test helpers (not part of the real Antlion API)
    _tick(times = 1) {
      for (let i = 0; i < times; i++) {
        for (const cb of [...intervals.values()]) { cb(); }
      }
    },
    _activeIntervalCount() { return intervals.size; },
  };
}
```

- [ ] **Step 2: Expose the antlion from the continue-screen factory**

The auto-continue tests need the antlion handle. Update `makeContinueScreen` (around line 231) to return `antlion`:

```js
  function makeContinueScreen({ viewerSeat = 0 } = {}) {
    const doc = dom.window.document;
    const el = doc.createElement('div');
    doc.body.appendChild(el);
    const antlion = makeMockAntlion();
    let continueCount = 0;
    const screen = new dom.window.RoundSummaryScreen(el, {
      antlion,
      viewerSeat,
      onBackToLobby: () => {},
      onContinue: () => { continueCount++; },
    });
    return { screen, el, antlion, getCount: () => continueCount };
  }
```

- [ ] **Step 3: Run the existing suite to confirm nothing broke**

Run: `npm test -- tests/RoundSummaryScreen.test.js`
Expected: PASS (mock changes are additive; existing tests unaffected).

- [ ] **Step 4: Commit**

```bash
git add tests/RoundSummaryScreen.test.js
git commit -m "test(round-summary): add controllable interval mock for auto-continue"
```

---

### Task 2: Countdown shown in the Continue button label

**Files:**
- Modify: `src/public/js/thousand/RoundSummaryScreen.js`
- Test: `tests/RoundSummaryScreen.test.js`

- [ ] **Step 1: Write the failing test**

Add a new describe block at the end of `tests/RoundSummaryScreen.test.js` (before the final blank line). `makeSummary` is defined earlier in the file:

```js
describe('RoundSummaryScreen — auto-continue timer', () => {
  function makeContinueScreen({ viewerSeat = 0 } = {}) {
    const doc = dom.window.document;
    const el = doc.createElement('div');
    doc.body.appendChild(el);
    const antlion = makeMockAntlion();
    let continueCount = 0;
    const screen = new dom.window.RoundSummaryScreen(el, {
      antlion,
      viewerSeat,
      onBackToLobby: () => {},
      onContinue: () => { continueCount++; },
    });
    return { screen, el, antlion, getCount: () => continueCount };
  }

  it('Continue button label shows the starting countdown of 30', () => {
    const { screen, el } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    const btn = el.querySelector('.round-summary__continue-btn');
    assert.ok(btn.textContent.includes('30'),
      `button label must show starting count 30, got "${btn.textContent}"`);
  });

  it('Continue button label decrements on each tick', () => {
    const { screen, el, antlion } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    antlion._tick(1);
    const btn = el.querySelector('.round-summary__continue-btn');
    assert.ok(btn.textContent.includes('29'),
      `button label must show 29 after one tick, got "${btn.textContent}"`);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/RoundSummaryScreen.test.js`
Expected: FAIL — label is `"Continue to Next Round"` with no number.

- [ ] **Step 3: Add the countdown constant and label helper**

At the top of `src/public/js/thousand/RoundSummaryScreen.js`, after the `PENALTY_LABELS` block (line 6), add:

```js
const AUTO_CONTINUE_SECONDS = 30;
const CONTINUE_LABEL = 'Continue to Next Round';
const continueLabelWithCount = (seconds) => `${CONTINUE_LABEL} (${seconds})`;
```

In the constructor (after `this._continuePressedSeats = new Set();`, line 16), initialise timer state:

```js
    this._autoContinueIntervalId = null;
    this._autoContinueRemaining = AUTO_CONTINUE_SECONDS;
```

Replace `_renderContinueButton()` (lines 187-197) so an enabled button starts the countdown and shows the count:

```js
  _renderContinueButton() {
    const btn = document.createElement('button');
    btn.className = 'round-summary__continue-btn';
    // Check if this viewer has already pressed continue
    if (this._continuePressedSeats.has(this._viewerSeat)) {
      btn.disabled = true;
      btn.textContent = CONTINUE_LABEL;
    } else {
      btn.textContent = continueLabelWithCount(this._autoContinueRemaining);
      this._continueBtn = btn;
      this._startAutoContinue();
    }
    this._buttonTeardowns.push(this._antlion.bindInput(btn, 'click', 'round-summary-continue-click'));
    this._cardEl.appendChild(btn);
  }
```

Add the timer methods just below `_renderContinueButton()`:

```js
  _startAutoContinue() {
    this._cancelAutoContinue();
    this._autoContinueRemaining = AUTO_CONTINUE_SECONDS;
    this._autoContinueIntervalId = this._antlion.scheduleInterval(1000, () => this._autoContinueTick());
  }

  _autoContinueTick() {
    this._autoContinueRemaining -= 1;
    if (this._autoContinueRemaining <= 0) {
      this._cancelAutoContinue();
      this._onContinueClick();
      return;
    }
    if (this._continueBtn) {
      this._continueBtn.textContent = continueLabelWithCount(this._autoContinueRemaining);
    }
  }

  _cancelAutoContinue() {
    if (this._autoContinueIntervalId !== null) {
      this._antlion.cancelInterval(this._autoContinueIntervalId);
      this._autoContinueIntervalId = null;
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/RoundSummaryScreen.test.js`
Expected: PASS for the two new countdown tests.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/RoundSummaryScreen.js tests/RoundSummaryScreen.test.js
git commit -m "feat(round-summary): show auto-continue countdown in Continue button"
```

---

### Task 3: Auto-fire continue at zero; cancel on click, destroy, and re-render

**Files:**
- Modify: `src/public/js/thousand/RoundSummaryScreen.js`
- Test: `tests/RoundSummaryScreen.test.js`

- [ ] **Step 1: Write the failing tests**

Add these tests inside the `'RoundSummaryScreen — auto-continue timer'` describe block from Task 2:

```js
  it('fires onContinue once after 30 ticks with no click', () => {
    const { screen, antlion, getCount } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    antlion._tick(30);
    assert.equal(getCount(), 1, 'onContinue must fire exactly once at zero');
  });

  it('disables the button after auto-firing', () => {
    const { screen, el, antlion } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    antlion._tick(30);
    const btn = el.querySelector('.round-summary__continue-btn');
    assert.ok(btn.disabled, 'button must be disabled after auto-continue fires');
  });

  it('does not fire again after auto-firing (interval cancelled)', () => {
    const { screen, antlion, getCount } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    antlion._tick(40);
    assert.equal(getCount(), 1, 'onContinue must not fire again after the interval is cancelled');
  });

  it('cancels the timer on manual click (no later auto-fire)', () => {
    const { screen, el, antlion, getCount } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    el.querySelector('.round-summary__continue-btn').click();
    antlion._tick(30);
    assert.equal(getCount(), 1, 'only the manual click counts; timer must not fire afterwards');
    assert.equal(antlion._activeIntervalCount(), 0, 'no interval should remain active after a click');
  });

  it('does not start a timer when the viewer has already pressed', () => {
    const { screen, antlion } = makeContinueScreen({ viewerSeat: 0 });
    const summary = makeSummary({ victoryReached: false });
    screen.update([0]); // seed continue-press for viewer seat 0 before render
    screen.render(summary);
    assert.equal(antlion._activeIntervalCount(), 0, 'no timer when viewer already pressed');
  });

  it('does not start a timer on the victory / back-to-lobby variant', () => {
    const { screen, antlion } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: true }));
    assert.equal(antlion._activeIntervalCount(), 0, 'no timer when no Continue button is shown');
  });

  it('clears the timer on destroy()', () => {
    const { screen, antlion } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    screen.destroy();
    assert.equal(antlion._activeIntervalCount(), 0, 'destroy() must cancel the auto-continue interval');
  });
```

Note: `_onContinueClick()` already calls `this.render(this._summary)`, which re-runs `_renderContinueButton()`; because the viewer's seat is now in `_continuePressedSeats`, the button renders disabled and no new timer starts. The cancel-at-top-of-render guard (Step 3) prevents the pre-click interval from surviving the re-render.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/RoundSummaryScreen.test.js`
Expected: FAIL — manual-click and destroy tests leave intervals active; "no timer when already pressed" may already pass.

- [ ] **Step 3: Cancel the timer at the top of render() and in destroy()**

In `render()` (lines 35-39), the loop already disposes button binds. Add a timer cancel right after `this._buttonTeardowns = [];`:

```js
  render(summary) {
    // Release the previous render's button binds before innerHTML drops the
    // nodes, otherwise their listeners + _domListeners entries leak.
    for (const dispose of this._buttonTeardowns) { dispose(); }
    this._buttonTeardowns = [];
    // Cancel any in-flight auto-continue timer before this render decides whether
    // to start a fresh one — prevents stacked intervals across re-renders.
    this._cancelAutoContinue();
    this._continueBtn = null;
    this._el.innerHTML = '';
```

In `destroy()` (lines 219-224), add the cancel before the existing teardown loops:

```js
  destroy() {
    this._cancelAutoContinue();
    for (const dispose of this._buttonTeardowns) { dispose(); }
    this._buttonTeardowns = [];
    for (const dispose of this._teardowns) { dispose(); }
    this._teardowns = [];
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/RoundSummaryScreen.test.js`
Expected: PASS for all auto-continue tests.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test`
Expected: PASS (all suites).
Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/public/js/thousand/RoundSummaryScreen.js tests/RoundSummaryScreen.test.js
git commit -m "feat(round-summary): auto-fire continue at 0 and tear down timer cleanly"
```

---

## Self-Review

- **Spec coverage:**
  - 30s countdown started when enabled Continue button renders → Task 2 Step 3.
  - Countdown folded into button label, decrements per second → Task 2 (both tests + impl).
  - Auto-fires local viewer's press at 0, disables button → Task 3 (fires-once + disabled tests).
  - Cancel on manual click → Task 3 (manual-click test; `render()` cancel guard).
  - No timer on victory / Back-to-Lobby → Task 3 (victory test).
  - No timer when viewer already pressed → Task 3 (already-pressed test).
  - `update()` (other players' presses) leaves countdown untouched → it only re-renders the table, never touches `_renderContinueButton()` or the timer; no code change needed.
  - Teardown on destroy + before each render → Task 3 Step 3.
  - Managed `scheduleInterval`/`cancelInterval`, no raw `setInterval` (constitution §XI) → Task 2 impl.
- **Placeholder scan:** none — all steps contain concrete code/commands.
- **Type consistency:** `_startAutoContinue` / `_autoContinueTick` / `_cancelAutoContinue`, `_autoContinueIntervalId`, `_autoContinueRemaining`, `_continueBtn`, `AUTO_CONTINUE_SECONDS`, `continueLabelWithCount` used consistently across tasks. Mock helpers `_tick` / `_activeIntervalCount` match between Task 1 and Task 3.
