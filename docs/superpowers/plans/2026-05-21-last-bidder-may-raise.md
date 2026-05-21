# Last Bidder May Raise — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the first two players pass without bidding, give the third (last remaining) player a real bidding turn — they must bid at least 100 (120 on barrel) and may raise, instead of being auto-assigned the contract at the minimum.

**Architecture:** Server-authoritative. `Round.submitPass` rejects a pass from the forced last bidder; `Round.submitBid` resolves the auction to `post-bid-decision` when the bidder is the sole non-passed seat. A new `viewerMustBid` view-model flag tells the active client to hide its Pass button. The controller's `handleBid` gains the `talon_absorbed` broadcast that `handlePass` already has, so a resolving bid behaves identically to a resolving pass.

**Tech Stack:** Node.js (CommonJS) server, vanilla ES-module frontend, Node.js built-in test runner + jsdom.

---

## Background facts (read before starting)

- `src/services/Round.js` — `submitPass(seat)` (around lines 117–141) currently resolves the auction the moment `remaining.length === 1`, forcing `currentHighBid` to `MIN_BID` (or `BARREL_BID_FLOOR`) when it was `null`. `submitBid(seat, amount)` (around lines 96–115) records a bid and advances the turn via `_nextActiveBidder(seat)` — it never resolves the phase.
- `MIN_BID = 100`, `BARREL_BID_FLOOR = 120`, `BID_STEP = 5` are constants at the top of `Round.js`.
- `submitBid` already enforces both the normal floor (`currentHighBid + BID_STEP`, or `MIN_BID` when null) and the barrel floor (rejects `< BARREL_BID_FLOOR` when the seat is on barrel). No bid-validation changes are needed.
- `Round._absorbTalon()` moves the talon into the declarer's hand and returns `{ talonIds, identities }`. It must be called exactly once at resolution.
- `src/controllers/RoundActionHandler.js` — `handlePass` (lines 102–123) already broadcasts `talon_absorbed` when `result.resolved` is true. `handleBid` (lines 91–99) currently only sends `bid_accepted`.
- View-model is built in `src/services/RoundSnapshot.js` → `buildViewModel(round, seat)` (lines 78–114).
- Frontend bid controls: `src/public/js/thousand/BiddingControls.js` (shared base, owns `_passBtn`), `BidControls.js` (subclass, `setActiveState`), and `GameScreenControls.js` `_mountBidding` (lines 127–149).
- Test helper `makeSellBiddingRound` in `tests/Game.barrel.test.js` (lines 96–105) reaches selling via `submitPass(1); submitPass(2)`. After this change, `submitPass(2)` is rejected, so this helper **must** switch to `submitPass(1); submitBid(0, 100)`.

---

## Task 1: Server — reject forced-last-bidder pass; resolve auction on a bid

**Files:**
- Modify: `src/services/Round.js` (`submitPass` ~lines 117–141, `submitBid` ~lines 96–115)
- Test: `tests/Round.bidding.test.js`

- [ ] **Step 1: Write failing tests for the new server behavior**

Add this suite to `tests/Round.bidding.test.js` (after the existing `last-bidder-remaining resolution` describe block, around line 170). It replaces the assumptions of the old FR-011 test:

```js
describe('Round.bidding — forced last bidder (no auto-take at 100)', () => {
  it('rejects a pass from the last seat when no bid is on the table', () => {
    const round = makeRound();
    round.submitPass(1);             // P1 passes; turn → seat 2
    round.submitPass(2);             // P2 passes; turn → seat 0 (dealer), still bidding
    assert.equal(round.phase, 'bidding', 'still bidding — dealer must bid, not auto-take');
    assert.equal(round.currentTurnSeat, 0, 'turn is the forced last bidder (dealer)');
    const r = round.submitPass(0);   // dealer tries to pass
    assert.equal(r.rejected, true, 'last bidder cannot pass');
    assert.match(r.reason, /at least 100/);
    assert.equal(round.phase, 'bidding', 'still bidding after rejected pass');
  });

  it('forced last bidder takes the contract at 100 via submitBid', () => {
    const round = makeRound();
    round.submitPass(1);
    round.submitPass(2);
    const r = round.submitBid(0, 100);
    assert.equal(r.rejected, false);
    assert.equal(r.resolved, true, 'a bid by the sole survivor resolves the auction');
    assert.equal(round.declarerSeat, 0);
    assert.equal(round.currentHighBid, 100);
    assert.equal(round.phase, 'post-bid-decision');
    assert.ok(Array.isArray(r.talonIds), 'talon absorbed on resolution');
  });

  it('forced last bidder may raise above 100', () => {
    const round = makeRound();
    round.submitPass(1);
    round.submitPass(2);
    const r = round.submitBid(0, 150);
    assert.equal(r.rejected, false);
    assert.equal(r.resolved, true);
    assert.equal(round.declarerSeat, 0);
    assert.equal(round.currentHighBid, 150);
    assert.equal(round.phase, 'post-bid-decision');
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- tests/Round.bidding.test.js`
Expected: FAIL — the rejected-pass test fails (pass currently resolves to declarer), and the submitBid tests fail (no `resolved` flag, phase still `bidding`).

- [ ] **Step 3: Make `submitPass` reject the forced last bidder**

In `src/services/Round.js`, inside `submitPass(seat)`, add this check immediately after the existing `if (seat !== this.currentTurnSeat)` guard and before `this.passedBidders.add(seat)`:

```js
    // Forced last bidder: if both others have already passed and no bid was
    // placed, this seat must take the contract (>= MIN_BID). They cannot pass.
    if (this.currentHighBid === null && this.passedBidders.size === 2) {
      return { rejected: true, reason: `You must bid at least ${MIN_BID}; you cannot pass.` };
    }
```

- [ ] **Step 4: Make `submitBid` resolve the auction when the bidder is the sole survivor**

In `src/services/Round.js`, inside `submitBid(seat, amount)`, replace the tail (from `this.bidHistory.push(...)` through `return { rejected: false };`) with:

```js
    this.bidHistory.push({ seat, amount });
    this.currentHighBid = amount;

    // If both other seats have already passed, this bid resolves the auction:
    // the bidder is the declarer (this is the forced-last-bidder take/raise path).
    const remaining = [0, 1, 2].filter(s => !this.passedBidders.has(s));
    if (remaining.length === 1) {
      this.declarerSeat = seat;
      this.phase = 'post-bid-decision';
      this.currentTurnSeat = seat;
      const { talonIds, identities } = this._absorbTalon();
      return { rejected: false, resolved: true, talonIds, identities };
    }

    this.currentTurnSeat = this._nextActiveBidder(seat);
    return { rejected: false };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/Round.bidding.test.js`
Expected: the three new tests PASS. (Pre-existing FR-011 / FR-010 tests in this file may now fail — they are fixed in Task 4. That is expected at this step.)

- [ ] **Step 6: Commit**

```bash
git add src/services/Round.js tests/Round.bidding.test.js
git commit -m "feat: forced last bidder must bid (>=100), may raise; resolve auction on bid"
```

---

## Task 2: Server — add `viewerMustBid` to the view-model

**Files:**
- Modify: `src/services/RoundSnapshot.js` (`buildViewModel` ~lines 78–114)
- Test: `tests/round-messages.test.js`

- [ ] **Step 1: Write a failing test for `viewerMustBid`**

Add to `tests/round-messages.test.js` (it already exercises view-models via `getViewModelFor`; place this in a new `describe`). Build a round, drive two passes, and assert the flag for each seat:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');

describe('viewModel — viewerMustBid (forced last bidder)', () => {
  function makeRound() {
    const game = { players: new Set(['p0', 'p1', 'p2']) };
    const store = { players: new Map([
      ['p0', { nickname: 'Dealer' }], ['p1', { nickname: 'P1' }], ['p2', { nickname: 'P2' }],
    ]) };
    const round = new Round({ game, store });
    round.start();
    round.advanceFromDealingToBidding();
    return round;
  }

  it('is false before two passes', () => {
    const round = makeRound();
    assert.equal(round.getViewModelFor(1).viewerMustBid, false);
  });

  it('is true only for the forced last bidder after two passes', () => {
    const round = makeRound();
    round.submitPass(1);
    round.submitPass(2);
    assert.equal(round.getViewModelFor(0).viewerMustBid, true, 'dealer must bid');
    assert.equal(round.getViewModelFor(1).viewerMustBid, false, 'passed seat: false');
    assert.equal(round.getViewModelFor(2).viewerMustBid, false, 'passed seat: false');
  });

  it('is false once a real bid exists', () => {
    const round = makeRound();
    round.submitBid(1, 100);   // a bid is on the table
    round.submitPass(2);       // turn → seat 0
    assert.equal(round.getViewModelFor(0).viewerMustBid, false, 'a bid exists → not forced');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/round-messages.test.js`
Expected: FAIL — `viewerMustBid` is `undefined`.

- [ ] **Step 3: Add the field to `buildViewModel`**

In `src/services/RoundSnapshot.js`, inside the object returned by `buildViewModel`, add this property (next to `viewerIsActive`):

```js
    viewerMustBid: round.phase === 'bidding'
      && round.currentTurnSeat === seat
      && round.currentHighBid === null
      && round.passedBidders.size === 2,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/round-messages.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/RoundSnapshot.js tests/round-messages.test.js
git commit -m "feat: add viewerMustBid view-model flag for forced last bidder"
```

---

## Task 3: Controller — broadcast `talon_absorbed` when a bid resolves the auction

**Files:**
- Modify: `src/controllers/RoundActionHandler.js` (`handleBid` lines 91–99)
- Test: `tests/round-messages.test.js`

- [ ] **Step 1: Write a failing test asserting the broadcast**

`tests/round-messages.test.js` already has a mock store that captures messages per player (search for the existing pattern that builds a `RoundActionHandler` with a fake store collecting `sendToPlayer` calls; reuse it). Add a test: drive `handlePass` for seats 1 and 2, then `handleBid('p0', 100)`, and assert that every player received a `talon_absorbed` message and that the declarer (`p0`) received one carrying `identities`.

```js
it('handleBid by the forced last bidder broadcasts talon_absorbed', () => {
  const { handler, sent, pids } = makeHandlerWithRound(); // existing helper in this file
  handler.handlePass(pids[1]);
  handler.handlePass(pids[2]);
  handler.handleBid(pids[0], 100);
  for (const pid of pids) {
    assert.ok(sent[pid].some(m => m.type === 'talon_absorbed'),
      `${pid} should receive talon_absorbed`);
  }
  const declarerMsg = sent[pids[0]].find(m => m.type === 'talon_absorbed');
  assert.ok(declarerMsg.identities, 'declarer receives talon identities');
});
```

> If `tests/round-messages.test.js` has no reusable `makeHandlerWithRound`/`sent` helper, model the fake store on the one already present in that file (it constructs `new RoundActionHandler({ store })` with a store whose `sendToPlayer(pid, msg)` pushes into a per-pid array, and whose `games`/`players` Maps are wired so `_gameOf`/`_seatOf` resolve). Reuse the existing helper rather than writing a new store.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/round-messages.test.js`
Expected: FAIL — no `talon_absorbed` is sent from `handleBid`.

- [ ] **Step 3: Add the `resolved` broadcast to `handleBid`**

In `src/controllers/RoundActionHandler.js`, replace `handleBid` (lines 91–99) with:

```js
  // T027 + T044
  handleBid(playerId, amount) {
    this._runRoundAction(
      playerId,
      (round, seat) => round.submitBid(seat, amount),
      (pid, gameStatus, result, { round }) => {
        this._store.sendToPlayer(pid, { type: 'bid_accepted', playerId, amount, gameStatus });
        if (result.resolved) {
          const declarerPid = round.seatOrder[round.declarerSeat];
          const msg = { type: 'talon_absorbed', declarerId: declarerPid, talonIds: result.talonIds, gameStatus };
          if (pid === declarerPid) {
            msg.identities = result.identities;
          }
          this._store.sendToPlayer(pid, msg);
        }
      },
    );
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/round-messages.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/RoundActionHandler.js tests/round-messages.test.js
git commit -m "feat: broadcast talon_absorbed when a bid resolves the auction"
```

---

## Task 4: Update existing server tests that assumed auto-take at 100

**Files:**
- Modify: `tests/Round.bidding.test.js` (FR-011 test ~lines 139–150; FR-010 "sole survivor via submitBid" ~lines 163–169)
- Modify: `tests/Game.barrel.test.js` (`makeSellBiddingRound` ~lines 96–105; FR-022d suite ~lines 613–678)

- [ ] **Step 1: Fix the FR-011 / FR-010 tests in `tests/Round.bidding.test.js`**

Replace the `all-pass resolution (FR-011)` describe block (lines 139–150) with one that reflects the new rule:

```js
describe('Round.bidding — all-pass leaves dealer as forced last bidder (FR-011)', () => {
  it('after P1 and P2 pass, the dealer must bid (no auto-take); pass is rejected', () => {
    const round = makeRound();
    round.submitPass(1); // P1 passes; turn → seat 2
    round.submitPass(2); // P2 passes; turn → seat 0 (dealer), still bidding
    assert.equal(round.phase, 'bidding', 'dealer is not auto-declared');
    assert.equal(round.currentTurnSeat, 0);
    assert.equal(round.currentHighBid, null, 'no bid forced onto the dealer');
    assert.equal(round.submitPass(0).rejected, true, 'dealer cannot pass as last bidder');
  });
});
```

In the `last-bidder-remaining resolution (FR-010)` block, replace the second test (`'sole survivor via submitBid (3 players, 2 already passed)'`, lines 163–169) with:

```js
  it('sole survivor takes the contract via submitBid (2 already passed)', () => {
    const round = makeRound();
    round.submitPass(1); // seat 1 passes; turn → seat 2
    round.submitPass(2); // seat 2 passes; turn → seat 0, still bidding
    const r = round.submitBid(0, 100);
    assert.equal(r.resolved, true);
    assert.equal(round.declarerSeat, 0);
    assert.equal(round.phase, 'post-bid-decision');
  });
```

- [ ] **Step 2: Fix `makeSellBiddingRound` in `tests/Game.barrel.test.js`**

Replace lines 93–105 (`makeSellBiddingRound`) with:

```js
// Advance a fresh round to selling-bidding phase with seat 0 as declarer.
// seat 1 passes, then the dealer (seat 0) takes the contract at 100 (the forced
// last bidder must bid — they can no longer auto-take by being passed onto).
// Then seat 0 starts selling and commits 3 cards.
function makeSellBiddingRound(gameSession = null) {
  const round = makeRound(gameSession);
  round.submitPass(1);
  round.submitBid(0, 100);
  // Now in post-bid-decision, declarer = seat 0
  round.startSelling(0);
  round.commitSellSelection(0, [2, 6, 10]);
  // Now in selling-bidding, currentTurnSeat = seat 1
  return round;
}
```

- [ ] **Step 3: Fix the FR-022d auto-declarer-barrel suite in `tests/Game.barrel.test.js`**

Replace the `Round.submitPass — auto-declarer barrel override (FR-022d)` describe block (lines 613–678) with a bid-driven version:

```js
describe('Round.submitBid — barrel forced-last-bidder floor (FR-022d)', () => {
  it('P1+P2 pass; barrel dealer (seat 0) cannot take at 100 — must bid >= 120', () => {
    const session = fakeSession({ 0: { onBarrel: true, barrelRoundsUsed: 1 } });
    const round = makeRound(session);
    round.submitPass(1);
    round.submitPass(2);
    assert.equal(round.phase, 'bidding', 'dealer must bid, not auto-take');
    assert.equal(round.submitBid(0, 100).rejected, true, 'barrel dealer cannot take at 100');
    const r = round.submitBid(0, 120);
    assert.equal(r.rejected, false, 'barrel dealer takes at 120');
    assert.equal(r.resolved, true);
    assert.equal(round.declarerSeat, 0);
    assert.equal(round.currentHighBid, 120);
    assert.equal(round.phase, 'post-bid-decision');
  });

  it('P1+P2 pass; non-barrel dealer takes at 100 via submitBid', () => {
    const session = fakeSession({ 0: { onBarrel: false, barrelRoundsUsed: 0 } });
    const round = makeRound(session);
    round.submitPass(1);
    round.submitPass(2);
    const r = round.submitBid(0, 100);
    assert.equal(r.rejected, false);
    assert.equal(round.declarerSeat, 0);
    assert.equal(round.currentHighBid, 100);
  });

  it('no session attached: dealer takes at 100 via submitBid (graceful fallback)', () => {
    const round = makeRound(null);
    round.submitPass(1);
    round.submitPass(2);
    const r = round.submitBid(0, 100);
    assert.equal(r.rejected, false);
    assert.equal(round.declarerSeat, 0);
    assert.equal(round.currentHighBid, 100);
  });

  it('P1 already bid 120 before passing: seat 1 is declarer, barrel rule irrelevant', () => {
    const session = fakeSession({ 0: { onBarrel: true, barrelRoundsUsed: 0 } });
    const round = makeRound(session);
    round.submitBid(1, 120); // seat 1 bids 120; turn → seat 2
    round.submitPass(2);     // seat 2 passes; turn → seat 0
    round.submitPass(0);     // seat 0 passes; remaining = [1] → seat 1 declarer
    assert.equal(round.declarerSeat, 1);
    assert.equal(round.currentHighBid, 120);
    assert.equal(round.phase, 'post-bid-decision');
  });
});
```

> Note: in the last test, seat 0 passing IS allowed because `currentHighBid !== null` (P1 bid 120) — the forced-last-bidder rejection only applies when no bid is on the table. This exercises that the existing pass-resolution path still works.

- [ ] **Step 4: Run the full server test suite**

Run: `npm test`
Expected: PASS (all suites green). If `tests/Round.selling.test.js` or others used the same all-pass-to-declarer pattern inline, fix them the same way (`submitPass(other); submitBid(declarerSeat, 100)`); search with `grep -rn "submitPass(2)" tests/` to find them.

- [ ] **Step 5: Commit**

```bash
git add tests/Round.bidding.test.js tests/Game.barrel.test.js
git commit -m "test: update bidding/barrel tests for forced-last-bidder rule"
```

---

## Task 5: Frontend — `mustBid` hides the Pass button in bidding controls

**Files:**
- Modify: `src/public/js/thousand/BiddingControls.js`
- Modify: `src/public/js/thousand/BidControls.js`
- Test: `tests/BidControls.test.js`

- [ ] **Step 1: Write failing tests for the `mustBid` behavior**

Add to `tests/BidControls.test.js`. First extend the `makeControls` helper to accept `mustBid`, then add a describe block:

```js
// In makeControls signature, add mustBid (default false):
//   function makeControls({ currentHighBid, isActiveBidder = true, isEligible = true, mustBid = false } = {})
// and change the setActiveState call to:
//   bc.setActiveState({ isActiveBidder, isEligible, mustBid });

describe('BidControls — mustBid (forced last bidder)', () => {
  it('hides the Pass button when mustBid is true', () => {
    const { bc } = makeControls({ currentHighBid: null, mustBid: true });
    assert.ok(bc._passBtn.classList.contains('hidden'), 'Pass must be hidden when mustBid');
  });

  it('shows the Pass button when mustBid is false', () => {
    const { bc } = makeControls({ currentHighBid: null, mustBid: false });
    assert.ok(!bc._passBtn.classList.contains('hidden'), 'Pass visible by default');
  });

  it('Bid still works when mustBid is true', () => {
    const { bc, antlion, sent } = makeControls({ currentHighBid: null, mustBid: true });
    bc._input.value = '100';
    antlion._fire('bid-input-change');
    antlion._fire('bid-submit-click');
    assert.deepEqual(sent.bids, [100]);
  });
});
```

Update the existing `makeControls` (lines 36–50) to thread `mustBid` through as shown in the comment above.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/BidControls.test.js`
Expected: FAIL — `setActiveState` ignores `mustBid`; Pass button is never hidden.

- [ ] **Step 3: Add Pass-button hiding to `BiddingControls`**

In `src/public/js/thousand/BiddingControls.js`, add a `setPassHidden` method (after `setOnBarrel`, before `_effectiveFloor`) and call it from `_applyState` so it survives re-renders. Implementation:

Add a field in the constructor (next to `this._barrelFloor = 0;`):

```js
    this._passHidden = false;
```

Add the method:

```js
  // When true, the Pass button is removed from view (forced last bidder must bid).
  setPassHidden(hidden) {
    this._passHidden = hidden;
    this._passBtn.classList.toggle('hidden', hidden);
  }
```

In `_applyState`, after the `this._el.classList.remove('hidden');` line (when not hidden), re-assert the pass visibility so it is correct on every render:

```js
    this._passBtn.classList.toggle('hidden', this._passHidden);
```

- [ ] **Step 4: Thread `mustBid` through `BidControls.setActiveState`**

In `src/public/js/thousand/BidControls.js`, replace `setActiveState`:

```js
  setActiveState({ isActiveBidder, isEligible, mustBid = false }) {
    this.setPassHidden(mustBid);
    this.setActive(isActiveBidder, isEligible);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/BidControls.test.js`
Expected: PASS (including the pre-existing Pass-operability tests, which use `mustBid` default `false`).

- [ ] **Step 6: Commit**

```bash
git add src/public/js/thousand/BiddingControls.js src/public/js/thousand/BidControls.js tests/BidControls.test.js
git commit -m "feat: hide Pass button for forced last bidder (mustBid)"
```

---

## Task 6: Frontend — forward `viewerMustBid` from `GameScreenControls`

**Files:**
- Modify: `src/public/js/thousand/GameScreenControls.js` (`_mountBidding` lines 127–149)

- [ ] **Step 1: Pass `viewerMustBid` into `setActiveState`**

In `src/public/js/thousand/GameScreenControls.js`, in `_mountBidding`, change the `setActiveState` call (lines 145–148) to include `mustBid`:

```js
    this._bidControls.setActiveState({
      isActiveBidder: gameStatus.viewerIsActive,
      isEligible: !viewerHasPassed,
      mustBid: gameStatus.viewerMustBid === true,
    });
```

- [ ] **Step 2: Verify nothing else regressed**

Run: `npm test`
Expected: PASS (no test targets `_mountBidding` directly; this is a one-line wiring change. The behavior is covered by Task 5's unit tests on `BidControls`.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/public/js/thousand/GameScreenControls.js
git commit -m "feat: forward viewerMustBid to bid controls in _mountBidding"
```

---

## Task 7: Update spec text to match the new rule

**Files:**
- Modify: `specs/004-game-round-bidding-selling/spec.md` (FR-011 ~line 100; AS-8 ~line 27; edge case ~line 76)
- Modify: `specs/005-play-phase-scoring/spec.md` (AS-4 ~line 88; barrel edge case ~line 172)

- [ ] **Step 1: Update feature 004 spec**

In `specs/004-game-round-bidding-selling/spec.md`:

- Replace **FR-011** (line 100) with:
  > **FR-011**: If all other players pass before any bid is placed, the sole remaining player MUST be prompted to bid; they cannot pass and MUST bid at least 100 (the minimum). Submitting their bid (100 or higher) makes them the declarer at that amount.
- Replace acceptance scenario **8** (line 27) with:
  > 8. **Given** the first two players pass without bidding, **When** it becomes the third player's turn, **Then** that player must place a bid of at least 100 (they cannot pass) and becomes the declarer at the amount they bid.
- Replace the "All three players pass on the opening minimum bid" edge case (line 76) with:
  > **The first two players pass before any bid**: the last remaining player cannot pass; they must bid at least 100 and may raise. Their accepted bid makes them the declarer and the round proceeds to the post-bid decision state.

- [ ] **Step 2: Update feature 005 spec**

In `specs/005-play-phase-scoring/spec.md`:

- Replace acceptance scenario **4** (line 88) with:
  > 4. **Given** the first two players pass without bidding and the last remaining player (the dealer) is on barrel, **When** it becomes their turn, **Then** they must bid at least **120** (the barrel minimum overrides the standard 100 floor) and cannot pass.
- Replace the barrel auto-declarer bullet (line 172) with:
  > - If the first two players pass before any bid AND the last remaining player is on barrel, that player must bid at least **120** (not 100). They cannot pass. The status display MUST reflect the 120 floor.

- [ ] **Step 3: Commit**

```bash
git add specs/004-game-round-bidding-selling/spec.md specs/005-play-phase-scoring/spec.md
git commit -m "docs: update FR-011 and barrel specs for forced-last-bidder rule"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the entire suite + lint**

Run: `npm test`
Expected: all suites PASS.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Run: `npm start`, open three browser tabs, host + join a 3-player game. In bidding, have P1 and P2 pass. Confirm the dealer's controls show the bid input with **no Pass button**, that bidding 100 takes the contract, and that raising to e.g. 150 works and is reflected in the post-bid decision / status. Confirm the talon is absorbed into the dealer's hand on resolution.

- [ ] **Step 3: Final commit (if any uncommitted changes remain)**

```bash
git add -A
git commit -m "chore: finalize forced-last-bidder bidding change"
```

---

## Self-review notes (already applied)

- **Spec coverage:** Forced-bid + no-pass (Tasks 1, 5, 6); minimum-100/barrel-120 floor reuses existing `submitBid` validators (verified — no change needed, tested in Task 4); raise (Task 1); `viewerMustBid` signal (Tasks 2, 6); talon broadcast parity with pass-resolution (Task 3); spec text (Task 7).
- **Type/name consistency:** `viewerMustBid` (view-model) → `mustBid` (controls API) is an intentional, consistent rename at the `setActiveState` boundary, threaded identically in Tasks 2/5/6. `setPassHidden` is defined in Task 5 and used only there.
- **Hidden dependency flagged:** `makeSellBiddingRound` and any inline `submitPass`-to-declarer test setups must move to `submitBid(declarerSeat, 100)` (Task 4, Step 4 includes a grep to catch stragglers).
