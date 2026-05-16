---
name: thousand-live-e2e
description: Use when asked to run live multi-browser tests for the Thousand card game, or when testing the full game flow (lobby → bidding → card exchange → trick play → victory) with real browsers
---

# Thousand — Live 3-Browser E2E Test

## Overview

Runs a complete game of Thousand across **Chrome + Firefox + Chromium** using Playwright.
All automation is already implemented in `tests/e2e-live.js`.

## Prerequisites

```bash
# One-time setup (already done on this machine)
npm install -D playwright
npx playwright install chromium firefox
```

Browsers on this machine:
- Chrome (system) — `channel: 'chrome'`
- Firefox (Playwright) — `firefox.launch()`
- Chromium (Playwright) — `chromium.launch()` (Opera substitute)

## How to Run

```bash
# Kill any lingering server first, then:
node tests/e2e-live.js > test_results.log 2>&1 &
echo "PID: $!"

# Monitor progress:
tail -f test_results.log
```

Or run directly (blocks terminal, shows live output):
```bash
node tests/e2e-live.js
```

## What the Test Does

1. **Starts server** on port 3099 (separate from dev port 3000)
2. **Opens 3 browsers** with `headless: false` so you can watch
3. **Setup**: Alice (Chrome), Bob (Firefox), Charlie (Chromium) each enter nicknames
4. **Alice creates** a public game → Bob & Charlie join from the game list
5. **Game loop** — each player acts when their turn comes:
   - Bidding: all pass → dealer auto-wins at bid 100
   - Declarer decision: "Start the Game" (skip selling)
   - Card exchange: force-click first card, then first destination seat
   - Trick play: force-click first non-disabled card
   - Marriage prompt: declare the marriage (bonus points = faster victory)
   - Round summary: "Continue to Next Round" until someone hits 1000
   - Final results: "Back to Lobby"
6. **Done** when all 3 players are back in the lobby screen

Typical runtime: **5–10 minutes** for a full game (~10 rounds × ~30s).

## Key Selectors

| Phase | Selector |
|-------|----------|
| Nickname input | `#nickname-input` |
| Nickname submit | `#nickname-form button[type="submit"]` |
| New game button | `#new-game-btn` |
| Create game submit | `#new-game-form button[type="submit"]` |
| Game list item | `#game-list li[data-id]` |
| Join selected | `#join-selected-btn` |
| Bid pass | `.bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)` |
| Sell-bid pass | `.sell-bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)` |
| Start the game | `.declarer-controls__start:not(:disabled)` |
| Exchange card | `.card-exchange__card` (**force:true** required — buttons are small) |
| Exchange dest | `.card-exchange__dest-btn` (**force:true** required) |
| Play trick card | `.trick-play__card:not(.card--disabled)` (**force:true** required) |
| Declare marriage | `button[data-action="declare"]` |
| Play without declaring | `button[data-action="play"]` |
| Continue next round | `.round-summary__continue-btn:not(:disabled)` |
| Back to lobby (summary) | `.round-summary__back-btn` |
| Back to lobby (final) | `.final-results__back-btn` |

## Critical Pitfall: Zero-Size Buttons

Several game buttons are sized only by CSS class inheritance and can have near-zero
computed dimensions. Playwright's default `isVisible()` returns **false** for these,
causing the automation to silently skip them.

**Always use `force: true` for:**
- `.card-exchange__card` — text buttons with no explicit width/height in CSS
- `.card-exchange__dest-btn` — same issue
- `.trick-play__card` — card sprite buttons

**Pattern used in the test:**
```javascript
async function forceClick(page, selector) {
  const el = page.locator(selector).first();
  await el.click({ force: true, timeout: 1000 });
}

async function countEls(page, selector) {
  return await page.locator(selector).count();  // count() works even on zero-size
}

// Use countEls() > 0 instead of isVisible() for phase detection
if (await countEls(page, '.card-exchange__card') > 0) {
  await forceClick(page, '.card-exchange__card');
}
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `EADDRINUSE :3099` | `pkill -f "node src/server.js"` then re-run |
| Stuck after "starts the game" | Card exchange buttons not detected — check `forceClick` is used |
| Stuck in trick play | Marriage prompt appeared — check `button[data-action]` selectors |
| Test exits with no COMPLETE | Take screenshot: `await page.screenshot({ path: 'debug.png' })` |
| Browsers don't open | Set `headless: false` and verify display is available |

## Configuration (top of `tests/e2e-live.js`)

```javascript
const PORT     = 3099;       // avoid conflict with dev server on 3000
const HEADLESS = false;      // true = no visible windows (faster)
const SLOW_MO  = 80;         // ms between actions; 0 = max speed
const MAX_ITER = 3000;       // safety cap: 3000 × 150ms ≈ 7.5 min
```
