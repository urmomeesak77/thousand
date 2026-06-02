# Game Rules Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rules icon to the login, lobby, and in-game screens that opens a shared modal with a concise summary of the Thousand rules.

**Architecture:** One static `#rules-modal` overlay in `index.html` (reusing the existing `.modal-overlay`/`.modal-card` styles), opened by a small `RulesModal` component wired through Antlion. Every trigger carries a shared `rules-btn` class. The in-game icon lives at the right end of the status bar; `StatusBar` is refactored to render its dynamic spans into an inner `display:contents` wrapper so the persistent icon survives re-renders.

**Tech Stack:** Vanilla ES-module frontend, Antlion engine for event binding, Node built-in test runner + jsdom.

> **Commit policy for this repo:** Do **not** run `git commit` during execution — this project commits only when the user explicitly asks. Each task ends with a verification step instead. A final commit happens after the user approves the finished work.

---

## File Structure

- **Create** `src/public/js/overlays/RulesModal.js` — open/close component (mirrors `NewGameModal.js`).
- **Create** `tests/RulesModal.test.js` — jsdom unit test for open/close.
- **Modify** `src/public/index.html` — add `#rules-modal` markup; add `rules-btn` class to the lobby `#rules-btn`; add the login-screen rules icon.
- **Modify** `src/public/css/index.css` — login-icon positioning; rules-card scroll + content styling.
- **Modify** `src/public/js/thousand/StatusBar.js` — inner `display:contents` content wrapper (constructor only).
- **Modify** `src/public/js/thousand/GameScreen.js` — append the in-game rules icon to the status-bar element.
- **Modify** `src/public/css/game.css` — `.status-bar__content` + `.status-bar__rules` + reserve right padding for the scoreboard.
- **Modify** `src/public/js/core/ThousandApp.js` — import, instantiate, and `bind()` the `RulesModal`.

---

## Task 1: RulesModal component (TDD)

**Files:**
- Create: `tests/RulesModal.test.js`
- Create: `src/public/js/overlays/RulesModal.js`

- [ ] **Step 1: Write the failing test**

Create `tests/RulesModal.test.js`:

```js
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

// Minimal DOM: two triggers (sharing .rules-btn) + the modal with a close button.
function buildDom(document) {
  document.body.innerHTML = `
    <button class="rules-btn" id="trigger-a"></button>
    <button class="rules-btn" id="trigger-b"></button>
    <div id="rules-modal" class="modal-overlay hidden">
      <div class="modal-card">
        <button id="rules-close-btn"></button>
      </div>
    </div>`;
}

// Captures named input handlers so the test can fire them synchronously.
function makeFakeAntlion() {
  const handlers = {};
  return {
    handlers,
    bindInput() {},
    onInput(type, fn) { handlers[type] = fn; },
  };
}

function setup() {
  const antlion = makeFakeAntlion();
  const modal = new dom.window.RulesModal(antlion);
  modal.bind();
  return antlion;
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'utils/HtmlUtil.js');
  loadModule(dom, 'overlays/RulesModal.js');
  buildDom(dom.window.document);
});

describe('RulesModal — open/close', () => {
  it('opens (removes hidden) when a rules-btn fires rules-open', () => {
    const antlion = setup();
    antlion.handlers['rules-open']();
    assert.equal(
      dom.window.document.getElementById('rules-modal').classList.contains('hidden'),
      false,
    );
  });

  it('closes (adds hidden) when the close button fires rules-close', () => {
    const antlion = setup();
    antlion.handlers['rules-open']();
    antlion.handlers['rules-close']();
    assert.equal(
      dom.window.document.getElementById('rules-modal').classList.contains('hidden'),
      true,
    );
  });

  it('closes when Escape is pressed', () => {
    const antlion = setup();
    antlion.handlers['rules-open']();
    antlion.handlers['rules-keydown']({ key: 'Escape' });
    assert.equal(
      dom.window.document.getElementById('rules-modal').classList.contains('hidden'),
      true,
    );
  });

  it('ignores non-Escape keys', () => {
    const antlion = setup();
    antlion.handlers['rules-open']();
    antlion.handlers['rules-keydown']({ key: 'a' });
    assert.equal(
      dom.window.document.getElementById('rules-modal').classList.contains('hidden'),
      false,
    );
  });

  it('closes when the overlay backdrop itself is clicked', () => {
    const antlion = setup();
    const overlay = dom.window.document.getElementById('rules-modal');
    antlion.handlers['rules-open']();
    antlion.handlers['rules-overlay-click']({ target: overlay });
    assert.equal(overlay.classList.contains('hidden'), true);
  });

  it('stays open when a click originates inside the card', () => {
    const antlion = setup();
    const card = dom.window.document.querySelector('.modal-card');
    antlion.handlers['rules-open']();
    antlion.handlers['rules-overlay-click']({ target: card });
    assert.equal(
      dom.window.document.getElementById('rules-modal').classList.contains('hidden'),
      false,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/RulesModal.test.js`
Expected: FAIL — `dom.window.RulesModal` is undefined (module not yet created).

- [ ] **Step 3: Write the component**

Create `src/public/js/overlays/RulesModal.js`:

```js
import HtmlUtil from '../utils/HtmlUtil.js';

// ============================================================
// RulesModal — shared game-rules modal open/close
// ============================================================

class RulesModal {
  constructor(antlion) {
    this._antlion = antlion;
  }

  bind() {
    document.querySelectorAll('.rules-btn').forEach((el) => {
      this._antlion.bindInput(el, 'click', 'rules-open');
    });
    this._antlion.onInput('rules-open', () => this._open());

    this._antlion.bindInput(HtmlUtil.byId('rules-close-btn'), 'click', 'rules-close');
    this._antlion.onInput('rules-close', () => this._close());

    this._antlion.bindInput(HtmlUtil.byId('rules-modal'), 'click', 'rules-overlay-click');
    this._antlion.onInput('rules-overlay-click', (e) => {
      if (e.target === HtmlUtil.byId('rules-modal')) {
        this._close();
      }
    });

    this._antlion.bindInput(document, 'keydown', 'rules-keydown');
    this._antlion.onInput('rules-keydown', (e) => {
      if (e.key === 'Escape') {
        this._close();
      }
    });
  }

  _open() {
    HtmlUtil.byId('rules-modal').classList.remove('hidden');
  }

  _close() {
    HtmlUtil.byId('rules-modal').classList.add('hidden');
  }
}

export default RulesModal;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/RulesModal.test.js`
Expected: PASS — all 6 assertions green.

---

## Task 2: Shared modal markup + lobby trigger

**Files:**
- Modify: `src/public/index.html`

- [ ] **Step 1: Add the `rules-btn` class to the existing lobby button**

In `src/public/index.html`, the lobby header button (around line 77) currently reads:

```html
        <button class="icon-btn" id="rules-btn" aria-label="Game rules" title="Game rules">
```

Change it to:

```html
        <button class="icon-btn rules-btn" id="rules-btn" aria-label="Game rules" title="Game rules">
```

- [ ] **Step 2: Add the shared rules modal markup**

In `src/public/index.html`, immediately after the `#new-game-modal` block (after its closing `</div>`, around line 172) and before the leave-confirm modal, insert:

```html
  <!-- ======================================================
       Game rules modal
  ======================================================= -->
  <div id="rules-modal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="rules-modal-title">
    <div class="modal-card rules-card">
      <h2 id="rules-modal-title">How to Play Thousand</h2>
      <div class="rules-body">
        <h3>Goal</h3>
        <p>Be the first player to reach <strong>1000 points</strong>.</p>

        <h3>Bidding</h3>
        <p>Players bid the number of points they expect to score, from <strong>100 to 300</strong> in steps of 5. The highest bidder becomes the <em>declarer</em> and takes the face-down talon cards.</p>

        <h3>Selling</h3>
        <p>If the declarer can't or won't keep the contract, the hand may be sold to another player (minimum 105, up to 3 attempts).</p>

        <h3>Card values</h3>
        <ul>
          <li>Ace — 11</li>
          <li>Ten — 10</li>
          <li>King — 4</li>
          <li>Queen — 3</li>
          <li>Jack — 2</li>
          <li>Nine — 0</li>
        </ul>

        <h3>Trick ranking (high to low)</h3>
        <p>Ace, Ten, King, Queen, Jack, Nine. The Ten beats the King and Queen; the Ace is highest.</p>

        <h3>Marriages</h3>
        <p>A King + Queen of the same suit, declared on your lead, sets the trump suit and scores a bonus: ♣ 100, ♠ 80, ♥ 60, ♦ 40.</p>

        <h3>Trick play</h3>
        <p>Follow the led suit if you can. If you can't follow, play a trump if you have one. The highest card wins the trick — trumps beat all plain suits.</p>

        <h3>Scoring</h3>
        <p>The declarer scores <strong>+bid</strong> if they make their contract and <strong>−bid</strong> if they miss it. Everyone else scores the points in the tricks they captured, rounded to the nearest 10.</p>

        <h3>Barrel &amp; specials</h3>
        <p>Between 880 and 1000 points you are "on the barrel". Holding all four nines in one hand awards +100. Three zero-scoring rounds in a row costs −120.</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="rules-close-btn" type="button">Close</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Verify the markup loads without console errors**

Run: `npm start`, open `http://localhost:3000`, and confirm the page renders (the modal is hidden by `hidden`). Stop the server afterward. No automated assertion here — this is a smoke check.

---

## Task 3: Login-screen trigger + CSS

**Files:**
- Modify: `src/public/index.html`
- Modify: `src/public/css/index.css`

- [ ] **Step 1: Add the rules icon to the nickname screen**

In `src/public/index.html`, inside the `#nickname-screen` section (after the opening `<section ...>` tag, around line 50, before `<div class="card">`), add:

```html
    <button class="icon-btn rules-btn nickname-rules-btn" aria-label="Game rules" title="Game rules">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </button>
```

- [ ] **Step 2: Position the login icon and style the rules card**

In `src/public/css/index.css`, after the `.icon-btn:hover` block (around line 278), add:

```css
/* Nickname screen carries a single absolutely-positioned rules icon top-right.
   #nickname-screen is a .screen (flex-centred); make it the positioning context. */
#nickname-screen {
  position: relative;
}

.nickname-rules-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
}

/* Rules modal: keep the long content readable on short viewports. */
.rules-card {
  max-width: 32rem;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.rules-body {
  overflow-y: auto;
  margin: 0.5rem 0 1rem;
}

.rules-body h3 {
  margin: 1rem 0 0.25rem;
  color: var(--color-primary-hover);
  font-size: 0.95rem;
}

.rules-body p {
  margin: 0.25rem 0;
  color: var(--color-text-muted);
  line-height: 1.45;
}

.rules-body ul {
  margin: 0.25rem 0;
  padding-left: 1.25rem;
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Verify in the browser**

Run `npm start`, open the lobby URL before entering a nickname. Confirm the info icon shows top-right on the nickname screen. (Clicking does nothing yet — wiring is Task 6.) Stop the server.

---

## Task 4: StatusBar inner-wrapper refactor

**Files:**
- Modify: `src/public/js/thousand/StatusBar.js`
- Modify: `src/public/css/game.css`

- [ ] **Step 1: Refactor the StatusBar constructor**

In `src/public/js/thousand/StatusBar.js`, replace the constructor:

```js
  constructor(element) {
    this._el = element;
    this._el.className = 'status-bar';
  }
```

with:

```js
  constructor(element) {
    // `element` is the sticky flex bar. Its dynamic spans render into an inner
    // `display:contents` wrapper (`this._el`) that render() clears, so a
    // persistent trailing child of the bar (the rules icon, appended by
    // GameScreen) survives re-renders untouched.
    this._bar = element;
    this._bar.className = 'status-bar';
    this._el = document.createElement('div');
    this._el.className = 'status-bar__content';
    this._bar.appendChild(this._el);
  }
```

No other method changes — every `_render*` helper keeps appending to `this._el` (now the inner wrapper), and `render()` keeps clearing `this._el`.

- [ ] **Step 2: Add the content-wrapper + icon CSS**

In `src/public/css/game.css`, after the `.status-bar` block (around line 36), add:

```css
/* Inner wrapper that holds the dynamic spans; display:contents keeps them as
   direct flex items of .status-bar so gap/wrap are unchanged. */
.status-bar__content {
  display: contents;
}

/* Persistent rules icon, pushed to the right end of the bar. */
.status-bar__rules {
  margin-left: auto;
  flex-shrink: 0;
}

/* Reserve room on the right so the trailing rules icon clears the fixed
   scoreboard (16rem) floating over the top-right corner. */
.status-bar {
  padding-right: 17rem;
}
```

And update the existing 480px override (around line 1231) from:

```css
  .status-bar {
    font-size: 0.8rem;
    padding: 0.4rem 0.75rem;
  }
```

to (scoreboard is 11rem on small phones):

```css
  .status-bar {
    font-size: 0.8rem;
    padding: 0.4rem 12rem 0.4rem 0.75rem;
  }
```

- [ ] **Step 3: Run the existing StatusBar tests to confirm the refactor is non-breaking**

Run: `node --test tests/StatusBar.005.test.js`
Expected: PASS — the tests query `sb._el` (now the inner wrapper) and `sb._el.textContent`, both still valid.

---

## Task 5: In-game rules icon in GameScreen

**Files:**
- Modify: `src/public/js/thousand/GameScreen.js`

- [ ] **Step 1: Append the rules icon to the status-bar element**

In `src/public/js/thousand/GameScreen.js`, in `_buildDom`, find:

```js
    this._statusBar = new StatusBar(statusBarEl);
```

and insert directly after it:

```js
    this._statusBar = new StatusBar(statusBarEl);
    this._appendStatusBarRulesIcon(statusBarEl);
```

- [ ] **Step 2: Add the helper method**

In `src/public/js/thousand/GameScreen.js`, add this method to the class (e.g. just after `_buildDom`):

```js
  // The shared RulesModal (bound at app startup) wires every .rules-btn — this
  // one rides at the right end of the status bar and persists across re-renders
  // because StatusBar clears only its inner content wrapper.
  _appendStatusBarRulesIcon(statusBarEl) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn rules-btn status-bar__rules';
    btn.setAttribute('aria-label', 'Game rules');
    btn.title = 'Game rules';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" '
      + 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="12" cy="12" r="10"/>'
      + '<line x1="12" y1="8" x2="12" y2="12"/>'
      + '<line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    statusBarEl.appendChild(btn);
  }
```

- [ ] **Step 3: Verify the existing GameScreen tests still pass**

Run: `node --test tests/GameScreen.gating.test.js tests/GameScreen.roundstats.test.js`
Expected: PASS — appending a sibling button to the status-bar element does not affect their assertions.

---

## Task 6: Wire RulesModal into the app + full verification

**Files:**
- Modify: `src/public/js/core/ThousandApp.js`

- [ ] **Step 1: Import RulesModal**

In `src/public/js/core/ThousandApp.js`, add to the import block (next to the other overlay imports such as `NewGameModal`):

```js
import RulesModal from '../overlays/RulesModal.js';
```

- [ ] **Step 2: Instantiate and bind it**

In `ThousandApp._bindUI()` (around line 116), which currently reads:

```js
  _bindUI() {
    this._modal.bind();
    this._lobbyBinder.bind();
    this._bindLeaveGame();
  }
```

change it to:

```js
  _bindUI() {
    this._modal.bind();
    this._rulesModal = new RulesModal(this._antlion);
    this._rulesModal.bind();
    this._lobbyBinder.bind();
    this._bindLeaveGame();
  }
```

`_bindUI()` runs in `init()` after `new GameScreen(...)` (line 66) has built the status-bar icon, so `querySelectorAll('.rules-btn')` finds all three triggers (login, lobby, in-game) even while their screens are hidden.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, including the new `RulesModal.test.js`.

- [ ] **Step 4: Run the linter**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual end-to-end verification**

Run `npm start` and confirm in the browser:
1. **Login screen** — info icon top-right; clicking opens the rules modal; Close, Escape, and backdrop-click all dismiss it.
2. **Lobby** — the header info icon now opens the same modal.
3. **In-game** — start/join a game into the round view; the info icon sits at the right end of the status bar (clear of the scoreboard) and opens the modal; the icon stays put across phase changes (bid, exchange, trick play).

Stop the server when done.

---

## Self-Review Notes

- **Spec coverage:** icon on all three screens (Tasks 2/3/5), shared modal + component (Tasks 1/2), concise content with code-accurate values (Task 2), StatusBar re-render safety (Task 4), CSP-safe (no inline `style=""`; SVG via `innerHTML`/CSS only), test (Task 1). All spec sections map to a task.
- **Type consistency:** `RulesModal(antlion)` constructor and `bind()` match between Task 1 and Task 6; input names (`rules-open`, `rules-close`, `rules-overlay-click`, `rules-keydown`) and DOM ids (`rules-modal`, `rules-close-btn`) are identical across the component, markup, and test.
- **No placeholders:** every code step shows complete code.
