# Per-seat round tricks/points display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each player's per-round tricks and points won next to their own cards (opponents below their stacks, viewer above their hand), backed by a new server-computed running points tally, and remove the cumulative `pts` from the status bar and the `× N` collected badges below the table.

**Architecture:** The server view-model (`RoundSnapshot.buildViewModel`) gains a `roundPoints` field computed by the existing pure `Scoring.roundScores`. The frontend renders per-seat stat lines: `OpponentView` gets a stat line under each opponent's stack, and `GameScreen` adds a full-width self-stat row above the hand, both driven from `gameStatus`. Two display sources are deleted (status-bar cumulative scores, trick-play collected badges).

**Tech Stack:** Node.js (CommonJS) services + tests via `node:test`; vanilla ES-module frontend tested with `jsdom`. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-05-20-per-seat-round-stats-design.md`

---

## File Structure

- `src/services/RoundSnapshot.js` — add `roundPoints` to the view-model (trick-play / round-summary only).
- `src/public/js/thousand/StatusBar.js` — drop cumulative `pts` spans; keep barrel markers.
- `src/public/js/thousand/OpponentView.js` — add `setRoundStats(tricks, points)` + a stat line under the stack.
- `src/public/js/thousand/GameScreen.js` — add `selfStatsEl` and `_renderRoundStats(gameStatus)`, called from `_renderStatus`.
- `src/public/js/thousand/TrickPlayView.js` — remove `_renderCollectedBadges` and its call.
- `src/public/css/index.css` — styles for new stat lines; remove dead rules.
- Tests: `tests/Round.trickplay.test.js` (roundPoints), `tests/StatusBar.005.test.js` (cumulative removal), `tests/TrickPlayView.test.js` (badge removal), `tests/OpponentView.test.js` (new — stat line), `tests/GameScreen.gating.test.js` or new GameScreen test (self stat line).

---

## Task 1: Server — `roundPoints` in the view-model

**Files:**
- Modify: `src/services/RoundSnapshot.js` (the `buildViewModel` function, ~line 60-92)
- Test: `tests/Round.trickplay.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/Round.trickplay.test.js` (uses the existing `makeTrickPlayRound` / `findCardId` helpers in that file):

```javascript
describe('Round view-model — roundPoints (per-seat running points)', () => {
  it('is null before trick-play (bidding phase)', () => {
    const round = makeRound();
    round.advanceFromDealingToBidding();
    const vm = round.getViewModelFor(0);
    assert.equal(vm.roundPoints, null, 'roundPoints must be null outside trick-play/round-summary');
  });

  it('reports collected-card points per seat during trick-play', () => {
    const round = makeTrickPlayRound();
    // Seat 0 collected an Ace (11) + Ten (10) of clubs = 21 points
    round.collectedTricks = {
      0: [findCardId(round.deck, 'A', '♣'), findCardId(round.deck, '10', '♣')],
      1: [],
      2: [findCardId(round.deck, 'K', '♠')], // King = 4
    };
    const vm = round.getViewModelFor(0);
    assert.equal(vm.roundPoints[0], 21, 'seat 0 = 11 + 10');
    assert.equal(vm.roundPoints[1], 0, 'seat 1 = 0');
    assert.equal(vm.roundPoints[2], 4, 'seat 2 = King(4)');
  });

  it('adds declared-marriage bonus to the owning seat', () => {
    const round = makeTrickPlayRound();
    round.collectedTricks = { 0: [], 1: [], 2: [] };
    round.declaredMarriages = [{ playerSeat: 1, suit: '♣', bonus: 100, trickNumber: 2 }];
    const vm = round.getViewModelFor(1);
    assert.equal(vm.roundPoints[1], 100, 'seat 1 gets the ♣ marriage bonus of 100');
  });
});
```

> The public accessor is `round.getViewModelFor(seat)` (`src/services/Round.js:155`), which delegates to `RoundSnapshot.buildViewModel`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/Round.trickplay.test.js`
Expected: FAIL — `vm.roundPoints` is `undefined` (assertion mismatch on the null/value checks).

- [ ] **Step 3: Implement**

In `src/services/RoundSnapshot.js`, at the top of the module add to the existing `require` of Scoring (or add one) the `roundScores` import. Find the existing require line for `./Scoring`; it currently destructures nothing used here, so add `roundScores`:

```javascript
const { roundScores } = require('./Scoring');
```

(If `RoundSnapshot.js` does not yet require `./Scoring`, add the line above near the other `require`s at the top of the file.)

Then inside `buildViewModel`, add the field to the returned object (next to `collectedTrickCounts`):

```javascript
    collectedTrickCounts: round.collectedTrickCounts ?? { 0: 0, 1: 0, 2: 0 },
    roundPoints: (round.phase === 'trick-play' || round.phase === 'round-summary')
      ? roundScores(round)
      : null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/Round.trickplay.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/RoundSnapshot.js tests/Round.trickplay.test.js
git commit -m "Add per-seat roundPoints to round view-model"
```

---

## Task 2: StatusBar — remove cumulative `pts`, keep barrel markers

**Files:**
- Modify: `src/public/js/thousand/StatusBar.js` (`render` ~line 35, `_renderCumulativeScores` ~line 112-133)
- Test: `tests/StatusBar.005.test.js`

- [ ] **Step 1: Update the test (replace the cumulativeScores describe block)**

In `tests/StatusBar.005.test.js`, delete the entire `describe('StatusBar — cumulativeScores field (FR-018)', ...)` block (lines ~161-216) and replace it with:

```javascript
// cumulativeScores removed from status bar (per 2026-05-20 design); barrel markers stay
describe('StatusBar — cumulative scores removed, barrel markers kept', () => {
  it('does not render any .status-bar__cumulative-score spans', () => {
    const sb = makeStatusBar();
    sb.render(status({ cumulativeScores: { 0: 150, 1: -50, 2: 200 } }));
    assert.equal(all(sb, '.status-bar__cumulative-score').length, 0,
      'cumulative score spans must no longer be rendered');
  });

  it('does not show the score numbers in the bar text', () => {
    const sb = makeStatusBar();
    sb.render(status({ cumulativeScores: { 0: 150, 1: 0, 2: 0 } }));
    assert.ok(!sb._el.textContent.includes('150 pts'),
      'cumulative "150 pts" must not appear');
  });

  it('still renders a barrel marker when a seat is on barrel', () => {
    const sb = makeStatusBar();
    sb.render(status({
      cumulativeScores: { 0: 900, 1: 0, 2: 0 },
      barrelMarkers: { 0: { onBarrel: true, barrelRoundsUsed: 0 }, 1: null, 2: null },
    }));
    const marker = sb._el.querySelector('.status-bar__barrel-marker');
    assert.ok(marker, 'barrel marker must still render');
    assert.ok(marker.textContent.includes('barrel'), 'marker text mentions barrel');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/StatusBar.005.test.js`
Expected: FAIL — `.status-bar__cumulative-score` spans are still rendered (length 3, not 0).

- [ ] **Step 3: Implement**

In `src/public/js/thousand/StatusBar.js`, change the `render` call site (line ~35) from:

```javascript
    this._renderCumulativeScores(gameStatus.cumulativeScores, gameStatus.barrelMarkers);
```

to:

```javascript
    this._renderBarrelMarkers(gameStatus.barrelMarkers);
```

Replace the whole `_renderCumulativeScores` method (lines ~112-133) with:

```javascript
  _renderBarrelMarkers(barrelMarkers) {
    if (barrelMarkers == null) {
      return;
    }
    const seatsOnBarrel = Object.keys(barrelMarkers).filter((seat) => barrelMarkers[seat]);
    if (seatsOnBarrel.length === 0) {
      return;
    }
    const div = document.createElement('div');
    div.className = 'status-bar__scores';
    for (const seat of seatsOnBarrel) {
      const marker = barrelMarkers[seat];
      const round = marker.barrelRoundsUsed + 1;
      const barrelSpan = this._span('status-bar__barrel-marker', `On barrel — round ${round} of 3`);
      barrelSpan.dataset.seat = seat;
      div.appendChild(barrelSpan);
    }
    this._el.appendChild(div);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/StatusBar.005.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/StatusBar.js tests/StatusBar.005.test.js
git commit -m "Remove cumulative scores from status bar; keep barrel markers"
```

---

## Task 3: OpponentView — per-opponent stat line

**Files:**
- Modify: `src/public/js/thousand/OpponentView.js`
- Test: `tests/OpponentView.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/OpponentView.test.js`:

```javascript
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', { runScripts: 'dangerously', url: 'http://localhost' });
  loadModule(dom, 'thousand/OpponentView.js');
});

function makeView() {
  const el = dom.window.document.createElement('div');
  return { view: new dom.window.OpponentView(el), el };
}

describe('OpponentView — round stats line', () => {
  it('renders "Tricks N, Points MMM" after setRoundStats', () => {
    const { view, el } = makeView();
    view.setNickname('P1');
    view.setCardCount(3);
    view.setRoundStats(2, 35);
    const line = el.querySelector('.opponent-view__round-stats');
    assert.ok(line, 'stat line must exist');
    assert.ok(line.textContent.includes('2'), 'shows trick count 2');
    assert.ok(line.textContent.includes('35'), 'shows points 35');
  });

  it('omits the stat line when stats are cleared (null)', () => {
    const { view, el } = makeView();
    view.setRoundStats(2, 35);
    assert.ok(el.querySelector('.opponent-view__round-stats'), 'precondition: line present');
    view.setRoundStats(null, null);
    assert.equal(el.querySelector('.opponent-view__round-stats'), null,
      'stat line gone after clearing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/OpponentView.test.js`
Expected: FAIL — `view.setRoundStats is not a function`.

- [ ] **Step 3: Implement**

In `src/public/js/thousand/OpponentView.js`, add to the constructor (after `this._lastAction = '';`):

```javascript
    this._roundTricks = null;
    this._roundPoints = null;
```

Add a method (after `setLastAction`):

```javascript
  setRoundStats(tricks, points) {
    this._roundTricks = tricks;
    this._roundPoints = points;
    this._render();
  }
```

In `_render()`, after the `stackEl` is appended (after `this._container.appendChild(stackEl);`) and before the last-action block, add:

```javascript
    if (this._roundPoints != null) {
      const stats = document.createElement('div');
      stats.className = 'opponent-view__round-stats';
      stats.textContent = `Tricks ${this._roundTricks ?? 0}, Points ${this._roundPoints}`;
      this._container.appendChild(stats);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/OpponentView.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/OpponentView.js tests/OpponentView.test.js
git commit -m "OpponentView: render per-round tricks/points under the stack"
```

---

## Task 4: GameScreen — self stat row + wiring

**Files:**
- Modify: `src/public/js/thousand/GameScreen.js` (`_buildDom` ~line 49-84, `_renderStatus` ~line 415-423)
- Test: `tests/GameScreen.roundstats.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/GameScreen.roundstats.test.js`. This drives only the new render path via the public `updateStatus` entry; it stubs the parts of construction GameScreen needs. Mirror the construction pattern already used in `tests/GameScreen.gating.test.js` (open that file to copy its exact `before`/loadModule list and mock antlion/dispatcher), then add:

```javascript
describe('GameScreen — self round-stats row', () => {
  it('shows "Tricks N, Points MMM" above the hand during trick-play', () => {
    const gs = makeGameScreen(); // from the gating-test construction pattern
    gs._seats = { self: 0, left: 1, right: 2, players: [
      { seat: 0, playerId: 'p0', nickname: 'Me' },
      { seat: 1, playerId: 'p1', nickname: 'L' },
      { seat: 2, playerId: 'p2', nickname: 'R' },
    ] };
    gs.updateStatus(makeStatus({
      phase: 'Trick play',
      collectedTrickCounts: { 0: 3, 1: 1, 2: 0 },
      roundPoints: { 0: 45, 1: 12, 2: 0 },
    }));
    const selfLine = gs._container.querySelector('.self-round-stats');
    assert.ok(selfLine && !selfLine.classList.contains('hidden'), 'self stat row visible');
    assert.ok(selfLine.textContent.includes('3'), 'shows own trick count');
    assert.ok(selfLine.textContent.includes('45'), 'shows own points');
  });

  it('hides the self row when roundPoints is null (pre-trick-play)', () => {
    const gs = makeGameScreen();
    gs._seats = { self: 0, left: 1, right: 2, players: [] };
    gs.updateStatus(makeStatus({ phase: 'Bidding', roundPoints: null }));
    const selfLine = gs._container.querySelector('.self-round-stats');
    assert.ok(!selfLine || selfLine.classList.contains('hidden'), 'self stat row hidden');
  });
});
```

> `makeGameScreen` / `makeStatus` helpers: copy the construction + status-factory helpers from `tests/GameScreen.gating.test.js`. Add `roundPoints` to the status factory's default object (default `null`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/GameScreen.roundstats.test.js`
Expected: FAIL — `.self-round-stats` element does not exist.

- [ ] **Step 3: Implement**

In `src/public/js/thousand/GameScreen.js` `_buildDom`, after `const handEl = document.createElement('div');` add:

```javascript
    const selfStatsEl = document.createElement('div');
    selfStatsEl.className = 'self-round-stats hidden';
```

Change the `tableEl.append(...)` line to insert `selfStatsEl` immediately before `handEl`:

```javascript
    tableEl.append(leftEl, centerColEl, rightEl, lastActionEl, selfStatsEl, handEl);
```

Add `this._selfStatsEl = selfStatsEl;` alongside the other element assignments (near `this._handEl = handEl;`).

Add a new method (place it just before `_renderStatus`):

```javascript
  _renderRoundStats(gameStatus) {
    const points = gameStatus.roundPoints;
    if (points == null || !this._seats) {
      this._selfStatsEl.classList.add('hidden');
      this._leftOpponent.setRoundStats(null, null);
      this._rightOpponent.setRoundStats(null, null);
      return;
    }
    const counts = gameStatus.collectedTrickCounts ?? { 0: 0, 1: 0, 2: 0 };
    const { self, left, right } = this._seats;
    this._selfStatsEl.textContent = `Tricks ${counts[self] ?? 0}, Points ${points[self] ?? 0}`;
    this._selfStatsEl.classList.remove('hidden');
    this._leftOpponent.setRoundStats(counts[left] ?? 0, points[left] ?? 0);
    this._rightOpponent.setRoundStats(counts[right] ?? 0, points[right] ?? 0);
  }
```

Call it from `_renderStatus` (after `this._statusBar.render(...)`):

```javascript
  _renderStatus(gameStatus) {
    this._statusBar.render(gameStatus, this._sellWinnerNickname);
    this._renderRoundStats(gameStatus);
    if (this._statusOverride) { return; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/GameScreen.roundstats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/GameScreen.js tests/GameScreen.roundstats.test.js
git commit -m "GameScreen: render self round-stats row and feed opponent stats"
```

---

## Task 5: TrickPlayView — remove the `× N` collected badges

**Files:**
- Modify: `src/public/js/thousand/TrickPlayView.js` (`render` ~line 103, `_renderCollectedBadges` ~line 114-133)
- Test: `tests/TrickPlayView.test.js`

- [ ] **Step 1: Update the test (delete the two badge describe blocks)**

In `tests/TrickPlayView.test.js`, delete the entire `describe('TrickPlayView — collected tricks badge shows count (FR-008)', ...)` block (~lines 195-216) and the entire `describe('TrickPlayView — seat 0 badge shows × 3 after render (FR-008)', ...)` block (~lines 748-773). Leave all other blocks untouched.

- [ ] **Step 2: Run test to verify the suite still references nothing removed**

Run: `npm test -- tests/TrickPlayView.test.js`
Expected: PASS (the badge tests are gone; remaining tests still pass against current code, which still renders badges — that's fine, nothing asserts their absence).

- [ ] **Step 3: Implement**

In `src/public/js/thousand/TrickPlayView.js`, remove the call inside `render`:

```javascript
    this._renderCollectedBadges(collectedTrickCounts);
```

and remove `collectedTrickCounts` from the destructure on the line above if it becomes unused:

```javascript
    const { legalCardIds, viewerIsActive } = gameStatus;
```

Delete the entire `_renderCollectedBadges(collectedTrickCounts) { ... }` method (~lines 114-133).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/TrickPlayView.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/thousand/TrickPlayView.js tests/TrickPlayView.test.js
git commit -m "TrickPlayView: remove collected-trick count badges"
```

---

## Task 6: CSS — stat-line styles + dead-rule cleanup

**Files:**
- Modify: `src/public/css/index.css`

- [ ] **Step 1: Add stat-line styles**

Add near the `.opponent-view` rules (~line 856) and `.hand-view` rules (~line 922):

```css
.opponent-view__round-stats {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  text-align: center;
}

.game-table > .self-round-stats {
  grid-column: 1 / -1;
}

.self-round-stats {
  text-align: center;
  font-size: 0.95rem;
  color: var(--color-text-muted);
  padding: 0.25rem 0;
}

.self-round-stats.hidden {
  display: none;
}
```

> Verify `--color-text-muted` exists in the `:root` block; if the project uses a different muted-text token (grep `--color-text` in `index.css`), substitute the correct name.

- [ ] **Step 2: Remove dead rules**

Delete the now-unused selectors from `index.css` (grep each to confirm no other usage first):
- `.status-bar__cumulative-score`
- `.trick-play__collected`
- `.collected-tricks__item`
- `.collected-tricks__badge`

Keep `.status-bar__scores` and `.status-bar__barrel-marker` — both are still produced by `_renderBarrelMarkers`.

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: PASS (lint runs on `src/`; CSS isn't linted, but this confirms no JS regressions from earlier tasks).

- [ ] **Step 4: Commit**

```bash
git add src/public/css/index.css
git commit -m "Style per-seat round-stats lines; drop dead score/badge CSS"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the whole suite + lint**

Run: `npm test && npm run lint`
Expected: all tests PASS, lint clean.

- [ ] **Step 2: Manual 3-tab check**

Start the server (`npm start`), open 3 browser tabs, play into trick-play, and confirm:
- Each opponent shows `Tricks N, Points MMM` below their card stack; the viewer shows the same line above their hand.
- The numbers increment as tricks are won (points reflect collected card values + any declared marriage bonus).
- The status bar no longer shows `N pts`; the `Trick X of 8` counter is still present; barrel markers still appear when a player is on barrel.
- No `× N` badges appear below the table.

- [ ] **Step 3: Final commit (if any manual-fix tweaks were needed)**

```bash
git add -A
git commit -m "Per-seat round tricks/points display"
```

---

## Self-Review Notes

- **Spec coverage:** server `roundPoints` (Task 1) ✓; opponents-below / self-above placement (Tasks 3, 4) ✓; remove cumulative `pts` keep barrel markers (Task 2) ✓; remove `× N` badges (Task 5) ✓; CSS + cleanup (Task 6) ✓; FR-018 divergence is intentional and documented in the spec.
- **Type consistency:** `setRoundStats(tricks, points)` defined in Task 3 and called in Task 4; `roundPoints` field name consistent across Tasks 1/4; `_renderBarrelMarkers` defined and called in Task 2.
- **Open verification flags carried into execution:** GameScreen test construction helpers copied from `GameScreen.gating.test.js` (Task 4) and the muted-text CSS token name (Task 6) — each step says how to confirm. The view-model accessor (`getViewModelFor`) is confirmed at `Round.js:155`.
