# Clubs-combo Easter Egg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play `sound/clubs_easter.mp3` for every player when one seat leads three consecutive tricks with A♣, then 10♣, then declares a clubs marriage.

**Architecture:** Server-authoritative. `TrickPlay` records each trick's lead card and detects the sequence inside `declareMarriage`, flagging the result. `RoundActionBroadcaster` forwards an `easterEgg` flag on the existing `marriage_declared` message. The client's `SoundManager` gains a new cue, and `ThousandApp.onMarriageDeclared` emits it for everyone (mute-respecting via `SoundManager.play`).

**Tech Stack:** Node.js (CommonJS backend), vanilla ES-module frontend, Node built-in test runner, Antlion engine sound bus.

---

## File Structure

- `src/services/TrickPlay.js` (modify) — add `leadLog`; record leads in `playCard`; detect the combo in `declareMarriage`.
- `src/services/RoundActionBroadcaster.js` (modify) — forward `easterEgg` on `marriage_declared`.
- `src/public/js/thousand/SoundManager.js` (modify) — new `clubsEaster` cue + input.
- `src/public/js/core/ThousandApp.js` (modify) — emit `sound:clubs-easter` on flagged marriages.
- `tests/trickPlay.clubsEaster.test.js` (create) — unit tests for the trigger.

Suit/rank tokens (verified): clubs suit is the glyph `'♣'`; ranks are `'A'` and `'10'`.

---

### Task 1: Detect the clubs combo in TrickPlay

**Files:**
- Modify: `src/services/TrickPlay.js`
- Test: `tests/trickPlay.clubsEaster.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/trickPlay.clubsEaster.test.js` with the full content below. The deck +
`idOf` helper and `new TrickPlay(0, DECK)` construction mirror the existing
`tests/TrickPlay.playedLog.test.js`. Each test sets trick state by hand and drives
`playCard` / `declareMarriage` directly. `lead(tp, hands, seat, id)` resets the trick
to an empty lead by `seat`, then plays the card so it is recorded as that trick's lead.

```javascript
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TrickPlay = require('../src/services/TrickPlay');

// Same deck shape as Round.start() / TrickPlay.playedLog.test.js: deck[id] = card.
function buildDeck() {
  const ranks = ['9', 'J', 'Q', 'K', '10', 'A'];
  const suits = ['♣', '♠', '♥', '♦'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ id: deck.length, rank, suit });
    }
  }
  return deck;
}

const DECK = buildDeck();
const idOf = (rank, suit) => DECK.find((c) => c.rank === rank && c.suit === suit).id;

// Lead `id` for `seat` on trick `trickNumber`: force an empty centre led by seat,
// then play the card (recorded as that trick's lead).
function lead(tp, hands, seat, id, trickNumber) {
  tp.trickNumber = trickNumber;
  tp.currentTrickLeaderSeat = seat;
  tp.currentTurnSeat = seat;
  tp.currentTrick = [];
  tp.playCard(hands, seat, id);
}

// Declare a marriage for `seat` on trick `trickNumber` (centre empty, seat leading).
function declare(tp, hands, seat, id, trickNumber) {
  tp.trickNumber = trickNumber;
  tp.currentTrickLeaderSeat = seat;
  tp.currentTurnSeat = seat;
  tp.currentTrick = [];
  return tp.declareMarriage(hands, seat, id);
}

describe('TrickPlay clubs-combo easter egg', () => {
  it('A then 10 of clubs led, then clubs marriage -> easterEgg true', () => {
    const tp = new TrickPlay(0, DECK);
    const hands = {
      0: [idOf('A', '♣'), idOf('10', '♣'), idOf('K', '♣'), idOf('Q', '♣')],
      1: [], 2: [],
    };
    lead(tp, hands, 0, idOf('A', '♣'), 1);
    lead(tp, hands, 0, idOf('10', '♣'), 2);
    const res = declare(tp, hands, 0, idOf('K', '♣'), 3);
    assert.equal(res.rejected, false);
    assert.equal(res.easterEgg, true);
  });

  it('reversed order (10 then A) -> no easterEgg', () => {
    const tp = new TrickPlay(0, DECK);
    const hands = {
      0: [idOf('A', '♣'), idOf('10', '♣'), idOf('K', '♣'), idOf('Q', '♣')],
      1: [], 2: [],
    };
    lead(tp, hands, 0, idOf('10', '♣'), 1);
    lead(tp, hands, 0, idOf('A', '♣'), 2);
    const res = declare(tp, hands, 0, idOf('K', '♣'), 3);
    assert.ok(!res.easterEgg);
  });

  it('a different seat led one of the clubs -> no easterEgg', () => {
    const tp = new TrickPlay(0, DECK);
    const hands = {
      0: [idOf('10', '♣'), idOf('K', '♣'), idOf('Q', '♣')],
      1: [idOf('A', '♣')],
      2: [],
    };
    lead(tp, hands, 1, idOf('A', '♣'), 1);   // seat 1 led the ace
    lead(tp, hands, 0, idOf('10', '♣'), 2);
    const res = declare(tp, hands, 0, idOf('K', '♣'), 3);
    assert.ok(!res.easterEgg);
  });

  it('non-clubs marriage -> no easterEgg', () => {
    const tp = new TrickPlay(0, DECK);
    const hands = {
      0: [idOf('A', '♣'), idOf('10', '♣'), idOf('K', '♠'), idOf('Q', '♠')],
      1: [], 2: [],
    };
    lead(tp, hands, 0, idOf('A', '♣'), 1);
    lead(tp, hands, 0, idOf('10', '♣'), 2);
    const res = declare(tp, hands, 0, idOf('K', '♠'), 3); // spades marriage
    assert.ok(!res.easterEgg);
  });

  it('a non-club lead breaks the streak -> no easterEgg', () => {
    const tp = new TrickPlay(0, DECK);
    const hands = {
      0: [idOf('A', '♣'), idOf('9', '♠'), idOf('K', '♣'), idOf('Q', '♣')],
      1: [], 2: [],
    };
    lead(tp, hands, 0, idOf('A', '♣'), 1);
    lead(tp, hands, 0, idOf('9', '♠'), 2);   // T-1 lead is not 10 of clubs
    const res = declare(tp, hands, 0, idOf('K', '♣'), 3);
    assert.ok(!res.easterEgg);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/trickPlay.clubsEaster.test.js`
Expected: FAIL — `res.easterEgg` is `undefined` (the positive test fails on the strictEqual to `true`).

- [ ] **Step 3: Record leads in `playCard`**

In `src/services/TrickPlay.js`, initialize a lead log in the constructor (add near the
other per-round trick state such as `currentTrick`/`playedLog`):

```javascript
this.leadLog = [];
```

In `playCard`, capture the lead BEFORE the card is pushed onto `currentTrick`
(a lead is when the trick is currently empty). Insert immediately after the
`!hands[seat].includes(cardId)` check and before/around the existing
`this.playedLog.push(...)` line:

```javascript
    if (this.currentTrick.length === 0) {
      this.leadLog.push({ seat, cardId, trickNumber: this.trickNumber });
    }
```

- [ ] **Step 4: Flag the combo in `declareMarriage`**

In `declareMarriage`, after the existing line that pushes to `this.declaredMarriages`
and sets `this.currentTrumpSuit = suit;`, compute the flag and include it in the
returned object. Add a small private helper and use it:

```javascript
  _isClubsCombo(seat) {
    const t = this.trickNumber;
    const leadAt = (n) => this.leadLog.find(e => e.trickNumber === n && e.seat === seat);
    const prev = leadAt(t - 1);
    const prev2 = leadAt(t - 2);
    if (!prev || !prev2) { return false; }
    const card = (id) => this.deck[id];
    return card(prev.cardId).suit === '♣' && card(prev.cardId).rank === '10'
      && card(prev2.cardId).suit === '♣' && card(prev2.cardId).rank === 'A';
  }
```

Then change the success `return` of `declareMarriage` from:

```javascript
    return { rejected: false, suit, bonus, newTrumpSuit: suit };
```

to:

```javascript
    const easterEgg = suit === '♣' && this._isClubsCombo(seat);
    return { rejected: false, suit, bonus, newTrumpSuit: suit, easterEgg };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/trickPlay.clubsEaster.test.js`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Run the full suite + lint**

Run: `npm test`
Expected: all tests pass (no regressions).
Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/services/TrickPlay.js tests/trickPlay.clubsEaster.test.js
git commit -m "feat(trickplay): detect A-10-clubs-marriage easter-egg combo"
```

---

### Task 2: Broadcast the flag on `marriage_declared`

**Files:**
- Modify: `src/services/RoundActionBroadcaster.js:122-139` (the `_broadcastMarriage` method)

- [ ] **Step 1: Add the flag to the message**

In `_broadcastMarriage`, add an `easterEgg` field to the `marriage_declared`
payload. Change:

```javascript
    this._store.sendToPlayer(pid, {
      type: 'marriage_declared',
      playerSeat,
      playerNickname,
      suit: marriageResult.suit,
      bonus: marriageResult.bonus,
      trickNumber,
      newTrumpSuit: marriageResult.newTrumpSuit,
      gameStatus,
    });
```

to add one line:

```javascript
    this._store.sendToPlayer(pid, {
      type: 'marriage_declared',
      playerSeat,
      playerNickname,
      suit: marriageResult.suit,
      bonus: marriageResult.bonus,
      trickNumber,
      newTrumpSuit: marriageResult.newTrumpSuit,
      easterEgg: !!marriageResult.easterEgg,
      gameStatus,
    });
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/services/RoundActionBroadcaster.js
git commit -m "feat(broadcast): forward clubs-combo easter-egg flag on marriage_declared"
```

---

### Task 3: Add the client sound cue

**Files:**
- Modify: `src/public/js/thousand/SoundManager.js:7-12` (the `CUE_FILES` map) and `:27-30` (input registrations)

- [ ] **Step 1: Add the cue file mapping**

In `CUE_FILES`, add the clubs-easter entry:

```javascript
const CUE_FILES = {
  card: 'sound/playing-card2.mp3',
  flip: 'sound/flipcard.mp3',
  turn: 'sound/turn.mp3',
  wakeup: 'sound/wakeup.mp3',
  clubsEaster: 'sound/clubs_easter.mp3',
};
```

- [ ] **Step 2: Register the input**

In the constructor, alongside the other `antlion.onInput('sound:...')` lines, add:

```javascript
    antlion.onInput('sound:clubs-easter', () => this.play('clubsEaster'));
```

(The existing `for` loop over `CUE_FILES` keys already preloads a base `Audio`
for `clubsEaster`, and `play()` already no-ops when muted — no other change.)

- [ ] **Step 3: Commit**

```bash
git add src/public/js/thousand/SoundManager.js
git commit -m "feat(sound): add clubs-easter cue to SoundManager"
```

---

### Task 4: Emit the cue on flagged marriages

**Files:**
- Modify: `src/public/js/core/ThousandApp.js:383-386` (the `onMarriageDeclared` method)

- [ ] **Step 1: Emit the sound for everyone**

Change `onMarriageDeclared` from:

```javascript
  onMarriageDeclared(msg) {
    this._gameScreen.updateStatus(msg.gameStatus);
    this._gameScreen.notifyMarriageDeclared(msg);
  }
```

to:

```javascript
  onMarriageDeclared(msg) {
    this._gameScreen.updateStatus(msg.gameStatus);
    this._gameScreen.notifyMarriageDeclared(msg);
    if (msg.easterEgg) {
      this._antlion.emit('sound:clubs-easter');
    }
  }
```

(`notifyMarriageDeclared` suppresses the *notice popup* for the declarer's own
seat, but the sound is emitted here unconditionally for all players — declarer
included.)

- [ ] **Step 2: Run the full suite + lint**

Run: `npm test`
Expected: all tests pass.
Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/public/js/core/ThousandApp.js
git commit -m "feat(client): play clubs-easter cue on flagged marriage_declared"
```

---

## Manual verification (after all tasks)

The trigger is rare in normal play, so verify the wiring rather than waiting for it
in a live game:
- Confirm `src/public/sound/clubs_easter.mp3` exists and is served (it is already in
  the working tree).
- Optionally, in a browser devtools console during a game, run
  `window.__app?._antlion.emit('sound:clubs-easter')` (or the equivalent reachable
  Antlion reference) to confirm the cue plays and respects the mute toggle.

---

## Notes / edge cases (already handled by design)

- A crawl trick-1 lead is face-down and only happens with an ace-less declarer, so
  A♣ can never be the crawled lead — recording leads only in `playCard` is correct.
- Matching prior leads by `trickNumber` AND `seat` guarantees the "in a row"
  semantics, because a seat only leads a trick by winning the previous one.
