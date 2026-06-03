# Lobby Logout + 24h Identity Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the non-functional lobby settings icon with a logout button that confirms, clears the stored identity, and returns the user to the login screen; expire the stored identity 24h after last seen.

**Architecture:** Frontend-only change. `IdentityStore` gains a sliding `lastSeen` timestamp so `load()` self-expires after 24h of inactivity. The lobby header's `#settings-btn` becomes `#logout-btn` (icon + label swap); a new `#logout-confirm-modal` mirrors the existing leave-game modal; `ThousandApp` wires the icon → modal → `IdentityStore.clear()` + `location.reload()`.

**Tech Stack:** Vanilla ES module JS, Antlion input bindings, Node.js built-in test runner + jsdom.

---

### Task 1: 24h expiry in IdentityStore

**Files:**
- Modify: `src/public/js/storage/IdentityStore.js`
- Test: `tests/IdentityStore.test.js`

- [ ] **Step 1: Update the existing "writes correct JSON" test and add expiry tests**

In `tests/IdentityStore.test.js`, the helper `makeStore()` and `plain()` already exist. Replace the existing test body at the `save() writes correct JSON to localStorage` case so it tolerates the new `lastSeen` field, and add three new tests. Apply these edits:

Replace:

```js
  it('save() writes correct JSON to localStorage', () => {
    const { IS, ls } = makeStore();
    IS.save('pid1', 'tok1');
    assert.deepEqual(JSON.parse(ls.getItem('thousand_identity')), {
      playerId: 'pid1',
      sessionToken: 'tok1',
    });
  });
```

with:

```js
  it('save() writes playerId, sessionToken, and a lastSeen timestamp', () => {
    const { IS, ls } = makeStore();
    const before = Date.now();
    IS.save('pid1', 'tok1');
    const stored = JSON.parse(ls.getItem('thousand_identity'));
    assert.equal(stored.playerId, 'pid1');
    assert.equal(stored.sessionToken, 'tok1');
    assert.equal(typeof stored.lastSeen, 'number');
    assert.ok(stored.lastSeen >= before && stored.lastSeen <= Date.now());
  });
```

Then append these three tests inside the `describe('IdentityStore', ...)` block, before its closing `});`:

```js
  it('load() refreshes lastSeen on a valid read', () => {
    const { IS, ls } = makeStore();
    const stale = Date.now() - 60 * 60 * 1000; // 1h ago, still valid
    ls.setItem('thousand_identity', JSON.stringify({
      playerId: 'pidR', sessionToken: 'tokR', lastSeen: stale,
    }));
    const result = IS.load();
    assert.deepEqual(plain(result), { playerId: 'pidR', sessionToken: 'tokR' });
    const after = JSON.parse(ls.getItem('thousand_identity'));
    assert.ok(after.lastSeen > stale);
  });

  it('load() clears and returns {} when lastSeen is older than 24h', () => {
    const { IS, ls } = makeStore();
    const expired = Date.now() - 25 * 60 * 60 * 1000; // 25h ago
    ls.setItem('thousand_identity', JSON.stringify({
      playerId: 'pidE', sessionToken: 'tokE', lastSeen: expired,
    }));
    assert.deepEqual(plain(IS.load()), {});
    assert.equal(ls.getItem('thousand_identity'), null);
  });

  it('load() treats a legacy record with no lastSeen as expired', () => {
    const { IS, ls } = makeStore();
    ls.setItem('thousand_identity', JSON.stringify({
      playerId: 'pidL', sessionToken: 'tokL',
    }));
    assert.deepEqual(plain(IS.load()), {});
    assert.equal(ls.getItem('thousand_identity'), null);
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test -- --test-name-pattern="IdentityStore"`
Expected: FAIL — `lastSeen` undefined / load returns the record instead of `{}`.

- [ ] **Step 3: Implement the timestamp + expiry in IdentityStore.js**

Replace the entire contents of `src/public/js/storage/IdentityStore.js` with:

```js
const STORAGE_KEY = 'thousand_identity';
// Persisted identity is considered stale 24h after the player was last seen.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class IdentityStore {
  static save(playerId, sessionToken) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ playerId, sessionToken, lastSeen: Date.now() })
      );
      return true;
    } catch {
      // Quota exceeded, storage disabled (Safari private mode), or storage access denied.
      // Persistence is best-effort — losing it for one session is better than crashing
      // the message handler that called save().
      return false;
    }
  }

  static load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      // Reject non-objects, arrays, and anything whose prototype isn't Object.prototype
      // (defends against malicious storage payloads attempting prototype pollution).
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      if (Object.getPrototypeOf(parsed) !== Object.prototype) {
        return {};
      }
      // Records without a fresh lastSeen (missing, non-numeric, or older than the
      // max age) are expired: drop them and report no identity.
      if (typeof parsed.lastSeen !== 'number' || Date.now() - parsed.lastSeen > MAX_AGE_MS) {
        IdentityStore.clear();
        return {};
      }
      const out = {};
      if (typeof parsed.playerId === 'string') {
        out.playerId = parsed.playerId;
      }
      if (typeof parsed.sessionToken === 'string') {
        out.sessionToken = parsed.sessionToken;
      }
      // Slide the 24h window forward on each active read ("24h after last seen").
      if (out.playerId && out.sessionToken) {
        IdentityStore.save(out.playerId, out.sessionToken);
      }
      return out;
    } catch {
      return {};
    }
  }

  static clear() {
    localStorage.removeItem(STORAGE_KEY);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --test-name-pattern="IdentityStore"`
Expected: PASS (all IdentityStore tests green).

- [ ] **Step 5: Commit**

```bash
git add src/public/js/storage/IdentityStore.js tests/IdentityStore.test.js
git commit -m "feat(identity): expire stored identity 24h after last seen"
```

---

### Task 2: Logout icon + confirmation modal markup

**Files:**
- Modify: `src/public/index.html`

- [ ] **Step 1: Swap the settings icon for a logout icon**

In `src/public/index.html`, replace the `#settings-btn` block (the cog button, currently lines ~91–96):

```html
        <button class="icon-btn" id="settings-btn" aria-label="Settings" title="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
```

with:

```html
        <button class="icon-btn" id="logout-btn" aria-label="Log out" title="Log out">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
```

- [ ] **Step 2: Add the logout confirmation modal**

In `src/public/index.html`, find the leave-game confirmation modal block (`<div id="leave-confirm-modal" ...>` ending at its closing `</div>`, around lines 237–246). Immediately after that block's closing `</div>`, add:

```html

  <!-- =======================================================
       Logout confirmation modal
  ======================================================= -->
  <div id="logout-confirm-modal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="logout-modal-title">
    <div class="modal-card">
      <h2 id="logout-modal-title">Log out?</h2>
      <p class="modal-body-text">You'll be returned to the login screen.</p>
      <div class="modal-actions">
        <button class="btn btn-accent" id="logout-confirm-btn">Log out</button>
        <button class="btn btn-ghost" id="logout-cancel-btn">Cancel</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Verify markup loads without console errors**

Run: `npm start` and open `http://localhost:3000`, set a nickname to reach the lobby. Confirm the header now shows a logout (door/arrow) icon instead of a cog, and no console errors appear. Stop the server afterward. (No automated test for static markup; visual check only.)

- [ ] **Step 4: Commit**

```bash
git add src/public/index.html
git commit -m "feat(lobby): replace settings icon with logout button + confirm modal"
```

---

### Task 3: Wire logout behavior in ThousandApp

**Files:**
- Modify: `src/public/js/core/ThousandApp.js`

- [ ] **Step 1: Call `_bindLogout()` from `_bindUI()`**

In `src/public/js/core/ThousandApp.js`, in `_bindUI()` (around line 117), add the logout binding after `_bindLeaveGame()`:

```js
  _bindUI() {
    this._modal.bind();
    this._rulesModal = new RulesModal(this._antlion);
    this._rulesModal.bind();
    this._lobbyBinder.bind();
    this._bindLeaveGame();
    this._bindLogout();
  }
```

- [ ] **Step 2: Add the `_bindLogout` / open / close / confirm methods**

In `src/public/js/core/ThousandApp.js`, immediately after the `_confirmLeaveGame()` method (ends around line 197), add:

```js
  _bindLogout() {
    this._antlion.bindInput($('logout-btn'), 'click', 'logout-click');
    this._antlion.onInput('logout-click', () => this._openLogoutModal());

    this._antlion.bindInput($('logout-cancel-btn'), 'click', 'logout-cancel-click');
    this._antlion.onInput('logout-cancel-click', () => this._closeLogoutModal());

    this._antlion.bindInput($('logout-confirm-modal'), 'click', 'logout-overlay-click');
    this._antlion.onInput('logout-overlay-click', (e) => {
      if (e.target === $('logout-confirm-modal')) {
        this._closeLogoutModal();
      }
    });

    this._antlion.bindInput($('logout-confirm-btn'), 'click', 'logout-confirm-click');
    this._antlion.onInput('logout-confirm-click', () => this._confirmLogout());
  }

  _openLogoutModal() {
    $('logout-confirm-modal').classList.remove('hidden');
  }

  _closeLogoutModal() {
    $('logout-confirm-modal').classList.add('hidden');
  }

  _confirmLogout() {
    IdentityStore.clear();
    // Full reload guarantees a clean socket/app state; with the identity cleared,
    // boot lands on the nickname (login) screen without a reconnect attempt.
    location.reload();
  }
```

- [ ] **Step 3: Close the logout modal on Escape**

In `src/public/js/core/ThousandApp.js`, `_handleLeaveGameKeydown(e)` (around line 165) already gates on the rules modal. Add a logout-modal check at the top of its action block so Escape closes the logout modal first. Replace:

```js
    const modal = $('leave-confirm-modal');
    if (!modal.classList.contains('hidden')) {
      this._closeLeaveModal();
    } else if (this._roundEnded) {
```

with:

```js
    if (!$('logout-confirm-modal').classList.contains('hidden')) {
      this._closeLogoutModal();
      return;
    }
    const modal = $('leave-confirm-modal');
    if (!modal.classList.contains('hidden')) {
      this._closeLeaveModal();
    } else if (this._roundEnded) {
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors for `src/public/js/core/ThousandApp.js`.

- [ ] **Step 5: Manual verification**

Run `npm start`, open `http://localhost:3000`, set a nickname to reach the lobby. Click the logout icon → confirm modal appears. Press Escape → modal closes. Click logout icon again → click "Log out" → page reloads and lands on the nickname/login screen. Reopen devtools Application → Local Storage: `thousand_identity` key is gone. Stop the server afterward.

- [ ] **Step 6: Commit**

```bash
git add src/public/js/core/ThousandApp.js
git commit -m "feat(lobby): wire logout button to clear identity and reload"
```

---

### Task 4: Full test + lint sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (including updated IdentityStore tests).

- [ ] **Step 2: Run lint over src/**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "chore(lobby): logout feature test/lint cleanup"
```
