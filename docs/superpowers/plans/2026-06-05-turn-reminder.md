# Turn Reminder ("wakeup") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play `wakeup.mp3` when it is the local player's turn and they have not acted, repeating every 30 seconds until they act.

**Architecture:** A new engine cue `sound:wakeup` is added to `SoundManager` (mute-respecting, reusing the existing preload/clone/guard machinery). A new focused `TurnReminder` module owns a 30 000 ms repeating Antlion interval that emits `sound:wakeup`; it is armed on the false→true edge of `gameStatus.viewerIsActive` and disarmed on the true→false edge. `GameScreen._renderStatus` drives it from the same single render funnel the existing turn cue uses.

**Tech Stack:** Vanilla ES6 module frontend, Antlion engine timers (`scheduleInterval`/`cancelInterval`), Node.js built-in test runner + jsdom.

Design doc: `docs/superpowers/specs/2026-06-05-turn-reminder-design.md`

---

### Task 1: Add the `wakeup` cue to SoundManager

**Files:**
- Modify: `src/public/js/thousand/SoundManager.js:7-11` (CUE_FILES) and `:26-28` (onInput subscriptions)
- Test: `tests/sound-manager.test.js`

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the `describe('SoundManager', ...)` block in `tests/sound-manager.test.js` (after the existing `'plays via the matching engine event ...'` test):

```javascript
  it('plays the wakeup cue via sound:wakeup', () => {
    const { antlion, audioFactory } = make();
    antlion.emit('sound:wakeup');
    assert.equal(audioFactory.totalPlays(), 1);
  });

  it('does not play wakeup when muted', () => {
    const { mgr, antlion, audioFactory } = make();
    mgr.toggleMute();
    antlion.emit('sound:wakeup');
    assert.equal(audioFactory.totalPlays(), 0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/sound-manager.test.js`
Expected: FAIL — `sound:wakeup` has no handler, so `totalPlays()` is `0` instead of `1` in the first new test.

- [ ] **Step 3: Implement the cue**

In `src/public/js/thousand/SoundManager.js`, add the `wakeup` entry to `CUE_FILES`:

```javascript
const CUE_FILES = {
  card: 'sound/playing-card2.mp3',
  flip: 'sound/flipcard.mp3',
  turn: 'sound/turn.mp3',
  wakeup: 'sound/wakeup.mp3',
};
```

And add the subscription alongside the other three in the constructor:

```javascript
    antlion.onInput('sound:card', () => this.play('card'));
    antlion.onInput('sound:flip', () => this.play('flip'));
    antlion.onInput('sound:turn', () => this.play('turn'));
    antlion.onInput('sound:wakeup', () => this.play('wakeup'));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/sound-manager.test.js`
Expected: PASS — all SoundManager tests green (the preload loop already creates a base for the new `wakeup` key).

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/SoundManager.js tests/sound-manager.test.js
git commit -m "feat(turn-reminder): add wakeup cue to SoundManager"
```

---

### Task 2: Create the TurnReminder module

**Files:**
- Create: `src/public/js/thousand/TurnReminder.js`
- Test: `tests/turn-reminder.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/turn-reminder.test.js`:

```javascript
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

// Fake antlion that records emits and lets the test fire armed intervals by hand
// (no real timers), so the 30s reminder logic is verified synchronously.
function makeFakeAntlion() {
  const emitted = [];
  const intervals = new Map();
  let nextId = 1;
  return {
    emitted,
    intervals,
    emit(type) { emitted.push(type); },
    scheduleInterval(delay, cb) {
      const id = nextId++;
      intervals.set(id, { delay, cb });
      return id;
    },
    cancelInterval(id) { intervals.delete(id); },
    fire(id) { intervals.get(id).cb(); },
  };
}

function make() {
  const antlion = makeFakeAntlion();
  const reminder = new dom.window.TurnReminder(antlion);
  return { antlion, reminder };
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'thousand/TurnReminder.js');
});

describe('TurnReminder', () => {
  it('arms a 30s interval on the inactive→active edge', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    assert.equal(antlion.intervals.size, 1);
    const [{ delay }] = antlion.intervals.values();
    assert.equal(delay, 30000);
  });

  it('emits sound:wakeup each time the interval fires', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    const [id] = antlion.intervals.keys();
    antlion.fire(id);
    antlion.fire(id);
    assert.deepEqual(antlion.emitted, ['sound:wakeup', 'sound:wakeup']);
  });

  it('does not double-arm when update(true) is called while already active', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    reminder.update(true);
    assert.equal(antlion.intervals.size, 1);
  });

  it('disarms on the active→inactive edge', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    reminder.update(false);
    assert.equal(antlion.intervals.size, 0);
  });

  it('is a no-op when update(false) is called while already disarmed', () => {
    const { antlion, reminder } = make();
    assert.doesNotThrow(() => reminder.update(false));
    assert.equal(antlion.intervals.size, 0);
  });

  it('re-arms after a disarm (turn comes back around)', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    reminder.update(false);
    reminder.update(true);
    assert.equal(antlion.intervals.size, 1);
  });

  it('stop() cancels a pending interval', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    reminder.stop();
    assert.equal(antlion.intervals.size, 0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/turn-reminder.test.js`
Expected: FAIL — `dom.window.TurnReminder` is undefined (module file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/public/js/thousand/TurnReminder.js`:

```javascript
// ============================================================
// TurnReminder — while it is the local player's turn, replays the
// wakeup cue every 30s until they act. Armed/disarmed on the edges
// of viewerIsActive; emits sound:wakeup (a no-op when muted).
// ============================================================

const REMINDER_INTERVAL_MS = 30000;

class TurnReminder {
  constructor(antlion) {
    this._antlion = antlion;
    this._timerId = null;
  }

  // Drive from each status render: arm on the inactive→active edge,
  // disarm on active→inactive. Idempotent in both directions.
  update(isViewerActive) {
    if (isViewerActive) {
      this._arm();
    } else {
      this.stop();
    }
  }

  _arm() {
    if (this._timerId !== null) {
      return;
    }
    this._timerId = this._antlion.scheduleInterval(
      REMINDER_INTERVAL_MS,
      () => this._antlion.emit('sound:wakeup'),
    );
  }

  stop() {
    if (this._timerId === null) {
      return;
    }
    this._antlion.cancelInterval(this._timerId);
    this._timerId = null;
  }
}

export default TurnReminder;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/turn-reminder.test.js`
Expected: PASS — all seven TurnReminder tests green.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/TurnReminder.js tests/turn-reminder.test.js
git commit -m "feat(turn-reminder): add TurnReminder timer module"
```

---

### Task 3: Wire TurnReminder into GameScreen

**Files:**
- Modify: `src/public/js/thousand/GameScreen.js` — import (after line 18), constructor (near line 39), and `_renderStatus` (after line 544)

- [ ] **Step 1: Add the import**

In `src/public/js/thousand/GameScreen.js`, add after the `MarriageNotice` import (line 18):

```javascript
import TurnReminder from './TurnReminder.js';
```

- [ ] **Step 2: Construct it**

In the `GameScreen` constructor, immediately after the `this._lastActiveSeat = null;` line (line 39), add:

```javascript
    // Replays the wakeup cue every 30s while it is the viewer's turn (FR turn-reminder).
    this._turnReminder = new TurnReminder(antlion);
```

- [ ] **Step 3: Drive it from the render funnel**

In `_renderStatus`, the first line is `this._emitTurnCueOnChange(gameStatus);` (line 544). Add the reminder update right after it (before the `_statusOverride` early-return so it always runs):

```javascript
  _renderStatus(gameStatus) {
    this._emitTurnCueOnChange(gameStatus);
    this._turnReminder.update(gameStatus.viewerIsActive);
```

- [ ] **Step 4: Run the full frontend test suite to verify nothing regressed**

Run: `npm test`
Expected: PASS — existing GameScreen tests still green; no new failures. (There is no GameScreen `destroy` hook to wire: the false-edge disarm plus `Antlion.stop()`'s global interval teardown cover cleanup.)

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/GameScreen.js
git commit -m "feat(turn-reminder): drive TurnReminder from GameScreen render"
```

---

### Task 4: Lint and final verification

**Files:** none (verification only)

- [ ] **Step 1: Run ESLint**

Run: `npm run lint`
Expected: PASS — no errors in `src/` (new files follow 2-space indent, semicolons, `const`, single-responsibility class).

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green, including the new `tests/turn-reminder.test.js` and the extended `tests/sound-manager.test.js`.

- [ ] **Step 3: Manual smoke check (optional but recommended)**

Run: `npm start`, open the game in a browser, start a round against bots, and on your turn wait 30 seconds without acting. Expected: `wakeup.mp3` plays at ~30s and again at ~60s; muting via the mute button silences it; acting (e.g. placing a bid / playing a card) stops it.

---

## Notes for the implementer

- `wakeup.mp3` already exists at `src/public/sound/wakeup.mp3` — no asset work needed.
- `gameStatus.viewerIsActive` is the canonical "it's the viewer's turn" flag (see `statusText.js`); it is `false` during `Round complete` / `Game over`, which disarms the reminder automatically.
- Do not reset the timer on every render — arming strictly on the active-edge keeps behavior independent of render cadence (see design doc "Known simplification").
