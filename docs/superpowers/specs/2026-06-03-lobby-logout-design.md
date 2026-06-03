# Lobby Logout + 24h Identity Expiry — Design

Date: 2026-06-03

## Goal

Replace the (non-functional) settings icon on the lobby screen with a logout
button that clears the stored identity and returns the user to the login
(nickname) screen. Additionally, make the persisted identity in `localStorage`
expire 24 hours after the user was last seen.

## Background

- The lobby header has a `#settings-btn` (cog icon) in `src/public/index.html`
  that has **no JavaScript handler** — clicking it does nothing.
- Persistent identity lives in `localStorage` under key `thousand_identity`,
  managed by `src/public/js/storage/IdentityStore.js`, storing
  `{ playerId, sessionToken }`.
- On boot, `ThousandApp` (`src/public/js/core/ThousandApp.js:90`) shows the
  reconnect overlay when `IdentityStore.load().playerId` is present; otherwise
  the user lands on the nickname/login screen.
- An existing leave-game confirmation modal (`#leave-confirm-modal`,
  `index.html:237`) provides the markup/CSS pattern to mirror.

## Decisions (from brainstorming)

- Logout **confirms first** via a small modal.
- Logout returns to login by **reloading the page** (`location.reload()`),
  guaranteeing clean socket/app state.
- The 24h expiry clock resets **on every load and save**, i.e. 24h of true
  inactivity expires the identity ("24h after last seen").

## Changes

### 1. Icon swap — `src/public/index.html`
- Inside the lobby header, replace the cog SVG in `#settings-btn` with a
  standard "log out" glyph (door + outward arrow).
- Rename the button id to `#logout-btn`; set `aria-label`/`title` to "Log out".

### 2. Logout confirmation modal — `src/public/index.html`
- Add `#logout-confirm-modal`, mirroring `#leave-confirm-modal`:
  - Title: "Log out?"
  - Body: "You'll be returned to the login screen."
  - Buttons: **Log out** (`#logout-confirm-btn`, `btn btn-accent`) /
    **Cancel** (`#logout-cancel-btn`, `btn btn-ghost`).
- Reuses existing `.modal-overlay` / `.modal-card` styles — no new CSS.

### 3. Wiring — `src/public/js/core/ThousandApp.js`
- Add `_bindLogout()`, called from `_bindUI()`.
  - Logout icon click → open modal (`remove('hidden')`).
  - Cancel click and overlay backdrop click → close modal.
  - Escape closes the logout modal (folded into existing keydown handling,
    consistent with the leave modal's Escape behavior and rules-modal
    precedence).
  - Confirm click → `IdentityStore.clear()` then `location.reload()`.

### 4. 24h expiry — `src/public/js/storage/IdentityStore.js`
- Add `const MAX_AGE_MS = 24 * 60 * 60 * 1000;`.
- `save(playerId, sessionToken)` also writes `lastSeen: Date.now()`.
- `load()`:
  - Parse as today, validating prototype/types (existing hardening kept).
  - Read `lastSeen`. If missing, or `Date.now() - lastSeen > MAX_AGE_MS`,
    call `clear()` and return `{}` (legacy records without `lastSeen` are
    treated as expired).
  - On a valid read, refresh `lastSeen` by re-saving, so the window slides
    forward on each active connect.

### 5. Tests — `tests/IdentityStore.test.js`
- Update the existing `save() writes correct JSON` assertion to account for
  the new `lastSeen` field.
- Add:
  - `load()` refreshes `lastSeen` on a valid read.
  - `load()` clears and returns `{}` when `lastSeen` is older than 24h.
  - `load()` treats a legacy record with no `lastSeen` as expired.

## Out of scope (YAGNI)

- No server-side session/identity changes.
- No `localStorage` changes beyond the identity record.
- No settings menu functionality (the cog had none).
