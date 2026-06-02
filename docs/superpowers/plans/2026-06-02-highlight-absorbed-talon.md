# Highlight Absorbed Talon Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Highlight the 3 talon cards the declarer gains on winning the bid, with a gentle gold pulse, until they press Sell or Start the Game.

**Architecture:** Frontend-only. `HandView` gains a persistent per-id highlight set (mirroring `_disabledIds`). `SellPhaseView.absorbTalon` seeds it for the declarer; `DeclarerDecisionControls` clears it via an `onDecision` callback wired by `GameScreenControls`. CSS provides the gold pulse.

**Tech Stack:** Vanilla JS ES modules (frontend), Node.js built-in test runner + jsdom for unit tests.

Design reference: `docs/superpowers/specs/2026-06-02-highlight-absorbed-talon-design.md`

---

### Task 1: `HandView` — persistent talon highlight

**Files:**
- Modify: `src/public/js/thousand/HandView.js`
- Test: `tests/HandView.test.js`

- [ ] **Step 1: Write the failing test**

Append this `describe` block to the end of `tests/HandView.test.js` (after the
`addCard` block, before the final newline at EOF):

```javascript
describe('HandView — talon highlight (absorbed talon cards)', () => {
  const FROM_TALON = 'hand-view__card--from-talon';

  function highlightedIds(hv) {
    return [...hv._container.querySelectorAll(`.${FROM_TALON}`)].map((el) =>
      Number(el.dataset.cardId)
    );
  }

  it('setTalonHighlight marks exactly the given ids', () => {
    const hv = makeHandView();
    hv.setHand([
      { id: 1, rank: '9', suit: '♣' },
      { id: 2, rank: 'K', suit: '♠' },
      { id: 3, rank: 'A', suit: '♦' },
    ]);
    hv.setTalonHighlight([2, 3]);
    assert.deepEqual(highlightedIds(hv).sort((a, b) => a - b), [2, 3]);
  });

  it('highlight survives a subsequent setHand re-sort', () => {
    const hv = makeHandView();
    hv.setHand([{ id: 1, rank: '9', suit: '♣' }]);
    hv.setTalonHighlight([1]);
    hv.setHand([
      { id: 1, rank: '9', suit: '♣' },
      { id: 2, rank: 'K', suit: '♠' },
    ]);
    assert.deepEqual(highlightedIds(hv), [1]);
  });

  it('clearTalonHighlight removes the marker', () => {
    const hv = makeHandView();
    hv.setHand([{ id: 1, rank: '9', suit: '♣' }]);
    hv.setTalonHighlight([1]);
    hv.clearTalonHighlight();
    assert.deepEqual(highlightedIds(hv), []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/HandView.test.js`
Expected: FAIL — `hv.setTalonHighlight is not a function`.

- [ ] **Step 3: Add the field, methods, and render hook**

In `src/public/js/thousand/HandView.js`, add `_talonIds` to the constructor's
field block (next to `_disabledIds`, around line 20):

```javascript
    this._disabledIds = [];
    this._talonIds = new Set();
```

Add these two methods just after `setDisabledIds` (around line 110):

```javascript
  // Persistently marks cards as having come from the absorbed talon (declarer's
  // own view). Keyed by id so the highlight survives setHand() re-sorts; cleared
  // explicitly by clearTalonHighlight() on the take/give decision.
  setTalonHighlight(ids) {
    this._talonIds = new Set(ids);
    this._render();
  }

  clearTalonHighlight() {
    if (this._talonIds.size === 0) { return; }
    this._talonIds.clear();
    this._render();
  }
```

In `_render()`, add the class alongside the existing `card--disabled` check
(after the `_disabledIds` block, around line 176):

```javascript
      if (this._disabledIds.includes(card.id)) {
        el.classList.add('card--disabled');
      }
      if (this._talonIds.has(card.id)) {
        el.classList.add('hand-view__card--from-talon');
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/HandView.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/HandView.js tests/HandView.test.js
git commit -m "feat(ui): add persistent talon highlight to HandView"
```

---

### Task 2: CSS — gold pulse for talon cards

**Files:**
- Modify: `src/public/css/game.css`

- [ ] **Step 1: Add the highlight rule and keyframes**

In `src/public/css/game.css`, immediately after the `.hand-view__card--arriving`
rule (around line 621, the one with the blue glow), add:

```css
/* Cards just absorbed from the talon stay marked (declarer's view) with a gentle
   gold pulse until the take/give decision clears them. */
.hand-view__card--from-talon {
  box-shadow: 0 0 10px 3px rgba(245, 197, 66, 0.7);
  animation: talon-pulse 1.6s ease-in-out infinite;
}

@keyframes talon-pulse {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(245, 197, 66, 0.5); }
  50%      { box-shadow: 0 0 14px 5px rgba(245, 197, 66, 0.85); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/public/css/game.css
git commit -m "feat(ui): gold pulse style for absorbed talon cards"
```

---

### Task 3: `SellPhaseView` — seed the highlight on absorb

**Files:**
- Modify: `src/public/js/thousand/SellPhaseView.js:164-181`

- [ ] **Step 1: Seed the highlight in the declarer branch**

In `absorbTalon`'s animation-complete callback, inside the `viewerIsDeclarer`
branch, add the `setTalonHighlight` call right after `setHand`. The block
currently reads (around lines 165-172):

```javascript
      if (viewerIsDeclarer) {
        if (identities) {
          for (const id of talonIds) {
            const identity = identities[String(id)];
            if (identity) {gs._cardsById[id] = { id, ...identity };}
          }
        }
        gs._handView.setHand(Object.values(gs._cardsById));
      } else {
```

Change it to:

```javascript
      if (viewerIsDeclarer) {
        if (identities) {
          for (const id of talonIds) {
            const identity = identities[String(id)];
            if (identity) {gs._cardsById[id] = { id, ...identity };}
          }
        }
        gs._handView.setHand(Object.values(gs._cardsById));
        gs._handView.setTalonHighlight(talonIds);
      } else {
```

- [ ] **Step 2: Verify no regressions in the existing suite**

Run: `node --test tests/HandView.test.js`
Expected: PASS (sanity — SellPhaseView has no dedicated unit test; this is wired
into the live e2e flow).

- [ ] **Step 3: Commit**

```bash
git add src/public/js/thousand/SellPhaseView.js
git commit -m "feat(ui): highlight talon cards in declarer hand on absorb"
```

---

### Task 4: Clear the highlight on the take/give decision

**Files:**
- Modify: `src/public/js/thousand/DeclarerDecisionControls.js`
- Modify: `src/public/js/thousand/GameScreenControls.js:169-176`

- [ ] **Step 1: Accept and invoke an `onDecision` callback in DeclarerDecisionControls**

In `src/public/js/thousand/DeclarerDecisionControls.js`, change the constructor
signature and store the callback. The constructor currently begins (lines 8-12):

```javascript
  constructor(container, antlion, dispatcher) {
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._mode = 'hidden'; // 'full' | 'sell-disabled' | 'sell-hidden' | 'hidden'
    this._teardowns = [];
```

Change to:

```javascript
  constructor(container, antlion, dispatcher, onDecision = () => {}) {
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._onDecision = onDecision;
    this._mode = 'hidden'; // 'full' | 'sell-disabled' | 'sell-hidden' | 'hidden'
    this._teardowns = [];
```

In `_bindEvents()`, invoke `_onDecision()` inside each handler right before the
dispatch (so it only fires when the click actually commits, after the guard).
The handlers currently read (lines 53-63):

```javascript
    const sellHandler = () => {
      if (this._mode !== 'full') {return;}
      this._dispatcher.sendSellStart();
    };
```
and
```javascript
    const startHandler = () => {
      if (this._mode === 'hidden') {return;}
      this._dispatcher.sendStartGame();
    };
```

Change them to:

```javascript
    const sellHandler = () => {
      if (this._mode !== 'full') {return;}
      this._onDecision();
      this._dispatcher.sendSellStart();
    };
```
and
```javascript
    const startHandler = () => {
      if (this._mode === 'hidden') {return;}
      this._onDecision();
      this._dispatcher.sendStartGame();
    };
```

- [ ] **Step 2: Pass the clear callback from GameScreenControls**

In `src/public/js/thousand/GameScreenControls.js`, `_mountDeclarer` constructs
the controls (lines 170-175). It currently reads:

```javascript
      if (!this._declarerControls) {
        this._controlsEl.textContent = '';
        this._declarerControls = new DeclarerDecisionControls(
          this._controlsEl, this._antlion, this._dispatcher,
        );
      }
```

Change to:

```javascript
      if (!this._declarerControls) {
        this._controlsEl.textContent = '';
        this._declarerControls = new DeclarerDecisionControls(
          this._controlsEl, this._antlion, this._dispatcher,
          () => this._handView.clearTalonHighlight(),
        );
      }
```

- [ ] **Step 3: Run the full frontend-relevant tests + lint**

Run: `node --test tests/HandView.test.js` and `npm run lint`
Expected: tests PASS; lint reports no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/public/js/thousand/DeclarerDecisionControls.js src/public/js/thousand/GameScreenControls.js
git commit -m "feat(ui): clear talon highlight on declarer take/give decision"
```

---

### Task 5: Manual verification (live)

**Files:** none (verification only)

- [ ] **Step 1: Run the game and confirm behavior**

Run: `npm start`, open 3 browser tabs, host + join a 3-player game, bid so one
player becomes declarer.

Confirm:
1. On winning the bid, the declarer's hand shows 10 cards with exactly 3 pulsing
   gold-highlighted cards (the former talon).
2. The other two players see no highlight.
3. Pressing **Start the Game** (or **Sell**) clears the gold highlight immediately.

- [ ] **Step 2: Done**

No commit (verification only). If anything is off, re-open the relevant task.

---

## Notes for the implementer

- `_talonIds` is intentionally NOT cleared inside `setHand()` — it must survive the
  re-sort that happens on absorb and on any later same-phase re-render. Only
  `clearTalonHighlight()` removes it.
- The highlight is declarer-view-only and live-only. Reconnect survival is out of
  scope (see the design doc's "Out of Scope").
- Box-shadow is used for the talon glow so it layers cleanly with `--selected`
  (transform + ring) and `--disabled` if those ever apply to the same card.
