# Game Rules Modal — Design

Date: 2026-06-02

## Goal

Add a rules icon to every screen (login / nickname, lobby, in-game) that opens a
shared modal showing a concise summary of the Thousand rules. The lobby already
has a `#rules-btn` icon in its header, but it is currently wired to nothing
(so is the neighbouring `#settings-btn`; settings is out of scope here).

## Scope

- In scope: a shared rules modal, a small component to open/close it, and a
  rules-icon trigger on each of the three screens.
- Out of scope: the dead `#settings-btn`, persisting any state, server changes.

## Approach

One shared modal plus one reusable component, opened by per-screen icon buttons
that all carry a shared `rules-btn` class. Rejected alternatives: duplicating the
modal markup per screen (repetitive), and a single global floating button (the
user chose per-screen icons).

## Components

### 1. Shared modal markup (`src/public/index.html`)

Add `#rules-modal` as a sibling of the existing `#new-game-modal`, reusing the
existing `.modal-overlay` / `.modal-card` classes so it inherits the dark theme,
backdrop, and `aria-modal` conventions already in use. Content is static, concise
HTML with these sections:

- **Goal** — first player to reach 1000 points wins.
- **Bidding** — bid 100–300 in steps of 5; highest bidder becomes declarer and
  takes the talon.
- **Selling** — if the declarer can't or won't play their bid, the hand may be
  sold (min 105, up to 3 attempts).
- **Card values** — A 11, 10 10, K 4, Q 3, J 2, 9 0.
- **Trick ranking** — 9 < J < Q < K < 10 < A (the Ten beats K and Q; Ace highest).
- **Marriages** — King + Queen of the same suit declared on your lead sets trump
  and scores a bonus: ♣ 100, ♠ 80, ♥ 60, ♦ 40.
- **Trick play** — follow suit; play trump if you can't follow; the highest card
  (trump beats plain suits) wins the trick.
- **Scoring** — declarer scores +bid if they make it, −bid if they miss; other
  players score their captured card points (rounded to the nearest 10).
- **Barrel & specials** — at 880–1000 you are "on the barrel"; four nines in one
  hand awards +100; three consecutive zero rounds costs −120.

The `.modal-card` for rules gets a `max-height` and vertical scroll so it fits
small viewports. A single **Close** button plus overlay-click and Escape dismiss it.

### 2. `RulesModal` component (`src/public/js/overlays/RulesModal.js`)

Mirrors `NewGameModal.js` in structure:

- `bind()` registers, via Antlion, a `rules-open` input bound to every
  `.rules-btn` element (click → open), and `rules-close` bound to the modal's
  close button. Overlay-background click and the Escape key also close it.
- `_open()` / `_close()` toggle the `hidden` class on `#rules-modal`.
- No direct DOM listeners and no raw timers (constitution §XI / Antlion API).

Registered once from `ThousandApp._bindUI()`, alongside `this._modal.bind()`.

### 3. Triggers

All three carry the shared `rules-btn` class and open the same modal:

- **Lobby** — the existing `#rules-btn`; add the `rules-btn` class and let the
  component wire it (no markup move).
- **Login** (`#nickname-screen`) — a new `.icon-btn.rules-btn` positioned at the
  screen's top-right.
- **In-game** (`.status-bar`) — a new `.icon-btn.rules-btn` at the **right end of
  the status bar** (the top-right corner is occupied by the collapsible
  scoreboard). Because `StatusBar.render()` clears its element on every render,
  the bar is refactored so its dynamic spans render into an inner
  `display: contents` wrapper, leaving the persistent rules icon (a direct child
  of `.status-bar`, pushed right with `margin-left: auto`) untouched across
  re-renders. Only `StatusBar`'s constructor changes; the per-field render
  methods keep appending to the (now inner) element unchanged.

## Data flow

Pure UI. Click on any `.rules-btn` → Antlion `rules-open` → modal shown. No state
crosses to the server or `localStorage`.

## Styling (`css/index.css`, `css/game.css`)

- Reuse the existing `.icon-btn` and `.modal-overlay` / `.modal-card` rules.
- `index.css`: position the nickname-screen rules icon top-right; add the
  rules-card `max-height` + scroll; light list/heading styling for the content.
- `game.css`: the `.status-bar` inner-content wrapper (`display: contents`) and
  the trailing rules icon (`margin-left: auto`).
- **CSP**: `style-src 'self'` with no `'unsafe-inline'`, so **no inline `style=""`
  attributes** — all styling lives in the CSS files.

## Testing

A focused jsdom test (`tests/`, Node built-in runner) for `RulesModal`:

- clicking a `.rules-btn` removes `hidden` from `#rules-modal`;
- clicking the close button re-adds `hidden`;
- pressing Escape while open closes it.

## Constraints

- No new dependencies; ES modules; Antlion for all event binding.
- Functions ≤ 50 lines; 2-space indent; `const` by default.
