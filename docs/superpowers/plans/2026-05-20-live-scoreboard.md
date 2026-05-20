# Live Scoreboard Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible top-right scoreboard to the in-round game screen showing per-round cumulative + round points per player with a pinned total.

**Architecture:** The server already keeps per-round history on `Game.history`. We surface a compact form of it into the in-round `gameStatus` view-model (`RoundSnapshot.buildViewModel`), so it arrives live and on reconnect with no new message type. A new `ScoreboardPanel` frontend component renders it, mounted by `GameScreen` and re-rendered from `_renderStatus`. Collapse state persists in `localStorage`, defaulting to closed on small screens.

**Tech Stack:** Node.js (CommonJS server), Vanilla JS ES modules (browser), Antlion engine for input, Node built-in test runner + jsdom for tests.

**Design doc:** `docs/superpowers/specs/2026-05-20-live-scoreboard-design.md`

---

## File Structure

- `src/services/RoundSnapshot.js` (modify) — add `compactScoreHistory(session)` (exported, pure) and a `scoreHistory` field in `buildViewModel`.
- `tests/RoundSnapshot.scorehistory.test.js` (create) — unit-tests `compactScoreHistory`.
- `src/public/js/thousand/ScoreboardPanel.js` (create) — the panel component (chrome, collapse/persistence, table render).
- `tests/ScoreboardPanel.test.js` (create) — jsdom tests for the panel.
- `src/public/js/thousand/GameScreen.js` (modify) — construct + render the panel.
- `tests/GameScreen.gating.test.js` and `tests/GameScreen.roundstats.test.js` (modify) — add `ScoreboardPanel.js` to the jsdom module load list.
- `src/public/css/index.css` (modify) — panel layout, scroll, sticky header/footer, collapsed state, small-screen width.

---

## Task 1: Server — surface compact score history in the view-model

**Files:**
- Modify: `src/services/RoundSnapshot.js`
- Test: `tests/RoundSnapshot.scorehistory.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/RoundSnapshot.scorehistory.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const RoundSnapshot = require('../src/services/RoundSnapshot');

describe('RoundSnapshot.compactScoreHistory', () => {
  it('maps each history entry to roundNumber + per-seat delta/cumulativeAfter only', () => {
    const session = {
      history: [
        {
          roundNumber: 1,
          declarerNickname: 'Alice',
          bid: 120,
          perPlayer: {
            0: { delta: 120, cumulativeAfter: 120, trickPoints: 60, marriageBonus: 60, penalties: [] },
            1: { delta: 30, cumulativeAfter: 30, trickPoints: 30, marriageBonus: 0, penalties: [] },
            2: { delta: 30, cumulativeAfter: 30, trickPoints: 30, marriageBonus: 0, penalties: [] },
          },
        },
        {
          roundNumber: 2,
          declarerNickname: 'Bob',
          bid: 100,
          perPlayer: {
            0: { delta: 40, cumulativeAfter: 160, trickPoints: 40, marriageBonus: 0, penalties: [] },
            1: { delta: 50, cumulativeAfter: 80, trickPoints: 50, marriageBonus: 0, penalties: [] },
            2: { delta: 30, cumulativeAfter: 60, trickPoints: 30, marriageBonus: 0, penalties: [] },
          },
        },
      ],
    };

    assert.deepEqual(RoundSnapshot.compactScoreHistory(session), [
      { roundNumber: 1, perPlayer: { 0: { delta: 120, cumulativeAfter: 120 }, 1: { delta: 30, cumulativeAfter: 30 }, 2: { delta: 30, cumulativeAfter: 30 } } },
      { roundNumber: 2, perPlayer: { 0: { delta: 40, cumulativeAfter: 160 }, 1: { delta: 50, cumulativeAfter: 80 }, 2: { delta: 30, cumulativeAfter: 60 } } },
    ]);
  });

  it('returns [] for a null session', () => {
    assert.deepEqual(RoundSnapshot.compactScoreHistory(null), []);
  });

  it('returns [] for a session with empty history', () => {
    assert.deepEqual(RoundSnapshot.compactScoreHistory({ history: [] }), []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/RoundSnapshot.scorehistory.test.js`
Expected: FAIL — `RoundSnapshot.compactScoreHistory is not a function`.

- [ ] **Step 3: Add the function and export it**

In `src/services/RoundSnapshot.js`, add this function near the other top-level helpers (e.g. after `disconnectedNicknames`, before `buildViewModel`):

```js
// Compact per-round history for the live scoreboard: only roundNumber and the
// per-seat delta + cumulativeAfter the scoreboard renders. Full history (with
// declarer/bid/penalties) is sent only at game-end via buildFinalResults.
function compactScoreHistory(session) {
  if (!session || !session.history) {
    return [];
  }
  return session.history.map((entry) => ({
    roundNumber: entry.roundNumber,
    perPlayer: Object.fromEntries(
      [0, 1, 2].map((s) => [s, {
        delta: entry.perPlayer[s].delta,
        cumulativeAfter: entry.perPlayer[s].cumulativeAfter,
      }]),
    ),
  }));
}
```

Add `compactScoreHistory` to the `module.exports` block at the bottom:

```js
module.exports = {
  buildViewModel,
  buildSnapshot,
  buildSeatLayout,
  buildDealSequenceFor,
  compactScoreHistory,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/RoundSnapshot.scorehistory.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the field into the view-model**

In `src/services/RoundSnapshot.js`, inside `buildViewModel`, the local `const session = round._game?.session;` already exists at the top. Add the field right after the `cumulativeScores:` line:

```js
    cumulativeScores: session ? session.cumulativeScores : { 0: 0, 1: 0, 2: 0 },
    scoreHistory: compactScoreHistory(session),
```

- [ ] **Step 6: Run the full server suite to confirm no regressions**

Run: `npm test`
Expected: PASS (all existing tests + the 3 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/services/RoundSnapshot.js tests/RoundSnapshot.scorehistory.test.js
git commit -m "feat: surface compact score history in in-round view-model"
```

---

## Task 2: Frontend — ScoreboardPanel chrome, collapse, and persistence

**Files:**
- Create: `src/public/js/thousand/ScoreboardPanel.js`
- Test: `tests/ScoreboardPanel.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/ScoreboardPanel.test.js`:

```js
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

function makeMockAntlion() {
  const handlers = {};
  return {
    bindInput(el, event, type) {
      el.addEventListener(event, (e) => { if (handlers[type]) handlers[type](e); });
    },
    onInput(type, handler) { handlers[type] = handler; },
    onTick() {}, schedule() { return 0; }, cancelScheduled() {}, emit() {}, stop() {},
  };
}

function setup(innerWidth = 1024) {
  dom = new JSDOM('<html><body></body></html>', { runScripts: 'dangerously', url: 'http://localhost' });
  Object.defineProperty(dom.window, 'innerWidth', { value: innerWidth, configurable: true });
  dom.window.localStorage.clear();
  loadModule(dom, 'thousand/ScoreboardPanel.js');
}

function makePanel() {
  const el = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(el);
  const panel = new dom.window.ScoreboardPanel(el, makeMockAntlion());
  return { panel, el };
}

describe('ScoreboardPanel chrome + collapse', () => {
  beforeEach(() => setup());

  it('renders a header with a title and a toggle button', () => {
    const { el } = makePanel();
    assert.ok(el.querySelector('.scoreboard__header'));
    assert.equal(el.querySelector('.scoreboard__title').textContent, 'Scoreboard');
    assert.ok(el.querySelector('.scoreboard__toggle'));
  });

  it('defaults to open on a wide screen (not collapsed)', () => {
    const { el } = makePanel();
    assert.equal(el.classList.contains('scoreboard--collapsed'), false);
  });

  it('toggles collapsed state when the toggle button is clicked', () => {
    const { el } = makePanel();
    const btn = el.querySelector('.scoreboard__toggle');
    btn.dispatchEvent(new dom.window.Event('click'));
    assert.equal(el.classList.contains('scoreboard--collapsed'), true);
    btn.dispatchEvent(new dom.window.Event('click'));
    assert.equal(el.classList.contains('scoreboard--collapsed'), false);
  });

  it('persists the collapsed choice to localStorage', () => {
    const { el } = makePanel();
    el.querySelector('.scoreboard__toggle').dispatchEvent(new dom.window.Event('click'));
    assert.equal(dom.window.localStorage.getItem('thousand_scoreboard_open'), 'false');
  });

  it('honors a stored open=false state on construction', () => {
    dom.window.localStorage.setItem('thousand_scoreboard_open', 'false');
    const { el } = makePanel();
    assert.equal(el.classList.contains('scoreboard--collapsed'), true);
  });

  it('defaults to collapsed on a small screen when no stored state exists', () => {
    setup(400);
    const { el } = makePanel();
    assert.equal(el.classList.contains('scoreboard--collapsed'), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ScoreboardPanel.test.js`
Expected: FAIL — module file does not exist / `ScoreboardPanel is not a constructor`.

- [ ] **Step 3: Create the component with chrome + collapse + persistence**

Create `src/public/js/thousand/ScoreboardPanel.js`:

```js
// ============================================================
// ScoreboardPanel — fixed top-right per-round scoreboard
// ============================================================

const STORAGE_KEY = 'thousand_scoreboard_open';
const SMALL_SCREEN_PX = 480;

class ScoreboardPanel {
  constructor(container, antlion) {
    this._container = container;
    this._antlion = antlion;
    this._open = this._loadOpenState();
    antlion.onInput('scoreboard-toggle', () => this._toggle());
    this._buildChrome();
  }

  _loadOpenState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') { return true; }
      if (stored === 'false') { return false; }
    } catch {
      // Storage disabled (private mode) — fall through to the screen-size default.
    }
    return window.innerWidth > SMALL_SCREEN_PX;
  }

  _saveOpenState() {
    try {
      localStorage.setItem(STORAGE_KEY, String(this._open));
    } catch {
      // Best-effort: a lost preference is better than a thrown handler.
    }
  }

  _buildChrome() {
    this._container.className = 'scoreboard';
    this._container.classList.toggle('scoreboard--collapsed', !this._open);

    const header = document.createElement('div');
    header.className = 'scoreboard__header';

    const title = document.createElement('span');
    title.className = 'scoreboard__title';
    title.textContent = 'Scoreboard';

    this._toggleBtn = document.createElement('button');
    this._toggleBtn.type = 'button';
    this._toggleBtn.className = 'scoreboard__toggle';
    this._toggleBtn.textContent = this._open ? '–' : '+';
    this._antlion.bindInput(this._toggleBtn, 'click', 'scoreboard-toggle');

    header.append(title, this._toggleBtn);

    this._bodyEl = document.createElement('div');
    this._bodyEl.className = 'scoreboard__body';

    this._container.append(header, this._bodyEl);
  }

  _toggle() {
    this._open = !this._open;
    this._saveOpenState();
    this._container.classList.toggle('scoreboard--collapsed', !this._open);
    this._toggleBtn.textContent = this._open ? '–' : '+';
  }
}

export default ScoreboardPanel;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ScoreboardPanel.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/ScoreboardPanel.js tests/ScoreboardPanel.test.js
git commit -m "feat: add ScoreboardPanel chrome with collapse + persistence"
```

---

## Task 3: Frontend — ScoreboardPanel table render

**Files:**
- Modify: `src/public/js/thousand/ScoreboardPanel.js`
- Test: `tests/ScoreboardPanel.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ScoreboardPanel.test.js` (inside the file, after the existing `describe` block):

```js
describe('ScoreboardPanel render', () => {
  beforeEach(() => setup());

  const seats = {
    self: 0,
    players: [
      { seat: 1, nickname: 'Bob' },
      { seat: 0, nickname: 'Alice' },
      { seat: 2, nickname: 'Carol' },
    ],
  };

  const history = [
    { roundNumber: 1, perPlayer: { 0: { delta: 120, cumulativeAfter: 120 }, 1: { delta: 0, cumulativeAfter: 0 }, 2: { delta: 60, cumulativeAfter: 60 } } },
    { roundNumber: 2, perPlayer: { 0: { delta: 60, cumulativeAfter: 180 }, 1: { delta: -60, cumulativeAfter: -60 }, 2: { delta: 60, cumulativeAfter: 120 } } },
  ];

  function headerTexts(el) {
    return [...el.querySelectorAll('.scoreboard__col-head')].map((th) => th.textContent);
  }

  it('renders one column header per player in seat order (0,1,2)', () => {
    const { panel, el } = makePanel();
    panel.render(history, { 0: 180, 1: -60, 2: 120 }, seats);
    assert.deepEqual(headerTexts(el), ['Alice', 'Bob', 'Carol']);
  });

  it('renders a cum and a rnd row per round with values in seat order', () => {
    const { panel, el } = makePanel();
    panel.render(history, { 0: 180, 1: -60, 2: 120 }, seats);

    const cumRows = el.querySelectorAll('.scoreboard__cum');
    const rndRows = el.querySelectorAll('.scoreboard__rnd');
    assert.equal(cumRows.length, 2);
    assert.equal(rndRows.length, 2);

    const cum2 = [...cumRows[1].querySelectorAll('.scoreboard__val')].map((td) => td.textContent);
    assert.deepEqual(cum2, ['180', '-60', '120']);

    const rnd2 = [...rndRows[1].querySelectorAll('.scoreboard__val')].map((td) => td.textContent);
    assert.deepEqual(rnd2, ['+60', '-60', '+60']);
  });

  it('renders a pinned TOTAL row from cumulativeScores in seat order', () => {
    const { panel, el } = makePanel();
    panel.render(history, { 0: 180, 1: -60, 2: 120 }, seats);
    const total = el.querySelector('.scoreboard__total');
    assert.ok(total.textContent.includes('TOTAL'));
    const vals = [...total.querySelectorAll('.scoreboard__val')].map((td) => td.textContent);
    assert.deepEqual(vals, ['180', '-60', '120']);
  });

  it('empty history renders headers + zero TOTAL and no round rows', () => {
    const { panel, el } = makePanel();
    panel.render([], { 0: 0, 1: 0, 2: 0 }, seats);
    assert.deepEqual(headerTexts(el), ['Alice', 'Bob', 'Carol']);
    assert.equal(el.querySelectorAll('.scoreboard__cum').length, 0);
    const vals = [...el.querySelector('.scoreboard__total').querySelectorAll('.scoreboard__val')].map((td) => td.textContent);
    assert.deepEqual(vals, ['0', '0', '0']);
  });

  it('re-render replaces previous rows (no duplication)', () => {
    const { panel, el } = makePanel();
    panel.render(history, { 0: 180, 1: -60, 2: 120 }, seats);
    panel.render(history, { 0: 180, 1: -60, 2: 120 }, seats);
    assert.equal(el.querySelectorAll('.scoreboard__cum').length, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ScoreboardPanel.test.js`
Expected: FAIL — `panel.render is not a function`.

- [ ] **Step 3: Implement `render` and helpers**

In `src/public/js/thousand/ScoreboardPanel.js`, add these methods to the class (before the closing brace, after `_toggle`):

```js
  // seats.players may be in any order; the scoreboard always renders columns by
  // ascending seat (0,1,2) so the layout is stable across renders and viewers.
  _orderedPlayers(seats) {
    return [...seats.players].sort((a, b) => a.seat - b.seat);
  }

  _formatDelta(value) {
    return value >= 0 ? `+${value}` : String(value);
  }

  _valCell(text) {
    const td = document.createElement('td');
    td.className = 'scoreboard__val';
    td.textContent = text;
    return td;
  }

  _labelCell(text, className) {
    const td = document.createElement('td');
    td.className = `scoreboard__label ${className}`;
    td.textContent = text;
    return td;
  }

  render(scoreHistory, cumulativeScores, seats) {
    if (!seats || !seats.players) {
      return;
    }
    const players = this._orderedPlayers(seats);
    this._bodyEl.textContent = '';

    const scroll = document.createElement('div');
    scroll.className = 'scoreboard__scroll';

    const table = document.createElement('table');
    table.className = 'scoreboard__table';

    table.appendChild(this._buildHead(players));
    table.appendChild(this._buildRoundsBody(scoreHistory ?? [], players));
    table.appendChild(this._buildTotalFoot(cumulativeScores ?? { 0: 0, 1: 0, 2: 0 }, players));

    scroll.appendChild(table);
    this._bodyEl.appendChild(scroll);

    // Keep the latest round in view; earlier rounds scroll off the top.
    scroll.scrollTop = scroll.scrollHeight;
    this._scrollEl = scroll;
  }

  _buildHead(players) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    tr.appendChild(document.createElement('th')); // empty corner over the round-label column
    for (const p of players) {
      const th = document.createElement('th');
      th.className = 'scoreboard__col-head';
      th.textContent = p.nickname ?? '';
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    return thead;
  }

  _buildRoundsBody(scoreHistory, players) {
    const tbody = document.createElement('tbody');
    for (const entry of scoreHistory) {
      const cumRow = document.createElement('tr');
      cumRow.className = 'scoreboard__cum';
      cumRow.appendChild(this._labelCell(`R${entry.roundNumber}`, 'scoreboard__round-num'));
      for (const p of players) {
        cumRow.appendChild(this._valCell(String(entry.perPlayer[p.seat].cumulativeAfter)));
      }
      tbody.appendChild(cumRow);

      const rndRow = document.createElement('tr');
      rndRow.className = 'scoreboard__rnd';
      rndRow.appendChild(this._labelCell('rnd', 'scoreboard__round-sub'));
      for (const p of players) {
        rndRow.appendChild(this._valCell(this._formatDelta(entry.perPlayer[p.seat].delta)));
      }
      tbody.appendChild(rndRow);
    }
    return tbody;
  }

  _buildTotalFoot(cumulativeScores, players) {
    const tfoot = document.createElement('tfoot');
    const tr = document.createElement('tr');
    tr.className = 'scoreboard__total';
    tr.appendChild(this._labelCell('TOTAL', 'scoreboard__total-label'));
    for (const p of players) {
      tr.appendChild(this._valCell(String(cumulativeScores[p.seat] ?? 0)));
    }
    tfoot.appendChild(tr);
    return tfoot;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ScoreboardPanel.test.js`
Expected: PASS (6 chrome tests + 5 render tests = 11).

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/ScoreboardPanel.js tests/ScoreboardPanel.test.js
git commit -m "feat: render score table (cum/rnd rows, pinned total) in ScoreboardPanel"
```

---

## Task 4: Integrate the panel into GameScreen

**Files:**
- Modify: `src/public/js/thousand/GameScreen.js`
- Modify: `tests/GameScreen.gating.test.js`, `tests/GameScreen.roundstats.test.js`

- [ ] **Step 1: Add ScoreboardPanel to the GameScreen jsdom test loaders (prevents breakage)**

In BOTH `tests/GameScreen.gating.test.js` and `tests/GameScreen.roundstats.test.js`, find the `modules` array in the `before(...)` block and add this line immediately before `'thousand/GameScreen.js'` (and before `'thousand/GameScreenControls.js'` if that is the last entry before GameScreen — the only requirement is that it appears before `GameScreen.js`):

```js
    'thousand/ScoreboardPanel.js',
```

- [ ] **Step 2: Run the GameScreen tests to confirm they still pass before the GameScreen edit**

Run: `node --test tests/GameScreen.gating.test.js tests/GameScreen.roundstats.test.js`
Expected: PASS (loading an unused module is harmless).

- [ ] **Step 3: Import and construct the panel in GameScreen**

In `src/public/js/thousand/GameScreen.js`, add the import alongside the other component imports near the top:

```js
import ScoreboardPanel from './ScoreboardPanel.js';
```

In `_buildDom`, change the `container.append(...)` line to also append a scoreboard container, and construct the panel. Replace:

```js
    tableEl.append(leftEl, centerColEl, rightEl, lastActionEl, selfStatsEl, handEl);
    container.append(statusBarEl, tableEl, this._controlsEl);
```

with:

```js
    tableEl.append(leftEl, centerColEl, rightEl, lastActionEl, selfStatsEl, handEl);
    const scoreboardEl = document.createElement('div');
    container.append(statusBarEl, tableEl, this._controlsEl, scoreboardEl);
    this._scoreboard = new ScoreboardPanel(scoreboardEl, antlion);
```

- [ ] **Step 4: Render the panel from `_renderStatus`**

In `src/public/js/thousand/GameScreen.js`, in `_renderStatus(gameStatus)`, add the scoreboard render right after the `this._statusBar.render(...)` call:

```js
  _renderStatus(gameStatus) {
    this._statusBar.render(gameStatus, this._sellWinnerNickname);
    if (this._seats) {
      this._scoreboard.render(
        gameStatus.scoreHistory ?? [],
        gameStatus.cumulativeScores ?? { 0: 0, 1: 0, 2: 0 },
        this._seats,
      );
    }
    this._renderRoundStats(gameStatus);
```

(Leave the rest of `_renderStatus` unchanged.)

- [ ] **Step 5: Run the GameScreen tests + full suite**

Run: `node --test tests/GameScreen.gating.test.js tests/GameScreen.roundstats.test.js`
Expected: PASS.

Run: `npm test`
Expected: PASS (whole suite green).

- [ ] **Step 6: Commit**

```bash
git add src/public/js/thousand/GameScreen.js tests/GameScreen.gating.test.js tests/GameScreen.roundstats.test.js
git commit -m "feat: mount and render ScoreboardPanel in GameScreen"
```

---

## Task 5: Style the scoreboard

**Files:**
- Modify: `src/public/css/index.css`

- [ ] **Step 1: Append the scoreboard styles**

Add to the end of `src/public/css/index.css`:

```css
/* ============================================================
   Live scoreboard panel (top-right overlay)
   ============================================================ */
.scoreboard {
  position: fixed;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 50;
  width: 16rem;
  max-width: calc(100vw - 1rem);
  background: rgba(20, 18, 38, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.5rem;
  color: #e8e6f5;
  font-size: 0.8rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.scoreboard__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.5rem;
  background: rgba(255, 255, 255, 0.06);
  cursor: default;
}

.scoreboard__title {
  font-weight: 600;
}

.scoreboard__toggle {
  min-width: 1.75rem;
  min-height: 1.75rem;
  border: none;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.scoreboard--collapsed .scoreboard__body {
  display: none;
}

.scoreboard__scroll {
  max-height: 13rem; /* ~5 rounds (2 rows each) + header/footer before scrolling */
  overflow-y: auto;
}

.scoreboard__table {
  width: 100%;
  border-collapse: collapse;
  text-align: right;
}

.scoreboard__table th,
.scoreboard__table td {
  padding: 0.15rem 0.4rem;
}

.scoreboard__col-head {
  position: sticky;
  top: 0;
  background: rgba(20, 18, 38, 0.98);
  font-weight: 600;
}

.scoreboard__label {
  text-align: left;
  color: #b6b2d6;
}

.scoreboard__round-num {
  font-weight: 600;
  color: #e8e6f5;
}

.scoreboard__cum .scoreboard__val {
  font-weight: 600;
}

.scoreboard__rnd .scoreboard__val {
  color: #b6b2d6;
}

.scoreboard__total {
  position: sticky;
  bottom: 0;
  background: rgba(255, 255, 255, 0.08);
  font-weight: 700;
}

@media (max-width: 480px) {
  .scoreboard {
    width: 11rem;
    font-size: 0.72rem;
  }
}
```

- [ ] **Step 2: Manual visual check**

Run: `npm start`, open three browser tabs, start a game, and play through at least one full round to game-summary so the scoreboard gains a row.
Confirm:
- Panel sits in the top-right corner, header + toggle visible.
- Clicking the toggle collapses/expands; reload keeps the chosen state.
- After a round completes, a `R1 cum` / `rnd` pair appears and `TOTAL` updates.
- Narrow the window below 480px on a fresh `localStorage` (or use a private window) — panel starts collapsed.

- [ ] **Step 3: Commit**

```bash
git add src/public/css/index.css
git commit -m "feat: style the live scoreboard panel"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass; lint reports no errors.

- [ ] **Step 2: Confirm coverage of the new modules**

Run: `npm run test:coverage`
Expected: `ScoreboardPanel.js` and the new `compactScoreHistory` path are exercised (the new tests cover them). Coverage stays ≥ 90% per the constitution.

- [ ] **Step 3: Final commit (only if anything is uncommitted)**

```bash
git status
```
Expected: clean working tree (all work already committed in Tasks 1–5).

---

## Notes for the implementer

- **No raw DOM listeners / timers** in `ScoreboardPanel.js` — the toggle goes through `Antlion.bindInput` / `Antlion.onInput` (§XI). The only `localStorage` and `window.innerWidth` reads are in the persistence/default helpers, mirroring `IdentityStore`.
- **Seat-ordered columns**: always render columns by ascending seat, never by `seats.players` array order (which varies by viewer). Tests in Task 3 enforce this with a deliberately out-of-order `seats.players`.
- **`scoreHistory` is additive** to the view-model; every existing `gameStatus` consumer ignores it. No contract doc change is required for the live field (it is the live counterpart of the existing final-results `history`).
