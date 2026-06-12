# Small-Screen Opponent Collapse + Trump Box Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On viewports ≤640px, collapse every opponent card stack to one card with a count badge (the 4-player across seat's card lying landscape), and stop the trump box from wrapping "No trump" onto two lines.

**Architecture:** CSS-only change in `src/public/css/game.css`. A collapse block already exists at `@media (max-width: 480px)` — it moves to the existing 640px block. The across seat gets swapped width/height (no `transform: rotate`, so the layout box shrinks too). The trump box gets `width: max-content` + `white-space: nowrap`.

**Tech Stack:** Plain CSS; Playwright (already a devDependency) for screenshot verification. No JS changes, no unit tests (media-query layout is not testable in jsdom — verification is visual).

**Spec:** `docs/superpowers/specs/2026-06-12-small-screen-opponents-design.md`

**Git:** Work directly on `master` (project convention — never create branches unless explicitly asked).

---

### Task 1: Trump box — one-line content that sizes to fit

**Files:**
- Modify: `src/public/css/game.css:478-499` (`.trump-box`, `.trump-box__label`, `.trump-box__suit`)

- [ ] **Step 1: Edit the three base rules**

In `src/public/css/game.css`, the current rules are:

```css
.trump-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 0.3rem 0.9rem;
}

.trump-box__label {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.trump-box__suit {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1;
}
```

Change them to (additions: `width: max-content`, `max-width: 100%`, and the two `white-space: nowrap` lines — the comment explains why):

```css
/* max-content + nowrap: the box sits in the narrow centre grid column, which
   otherwise squeezes it and wraps "No trump" onto two lines on small screens. */
.trump-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: max-content;
  max-width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 0.3rem 0.9rem;
}

.trump-box__label {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.trump-box__suit {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/public/css/game.css
git commit -m "fix(ui): size the trump box to its one-line content"
```

---

### Task 2: Raise the opponent-stack collapse breakpoint 480px → 640px

**Files:**
- Modify: `src/public/css/game.css:1326-1363` (the 480px and 640px media blocks)

- [ ] **Step 1: Remove the opponent rules from the 480px block**

The current block at `game.css:1326` is:

```css
/* 480px — small phones */
@media (max-width: 480px) {
  .status-bar {
    font-size: 0.8rem;
    padding: 0.4rem 12rem 0.4rem 0.75rem;
  }

  /* Opponent: collapse stack to single card on narrow viewports.
     OpponentView writes inline styles for width/left, so !important is the only
     way to override them from CSS — refactoring to custom properties is tracked
     separately. */
  .opponent-view__stack {
    width: var(--card-width) !important;
  }

  .opponent-view__stack-card:not(:last-child) {
    display: none;
  }

  .opponent-view__stack-card:last-child {
    left: 0 !important;
  }

  .opponent-view__count {
    display: inline;
  }
}
```

Shrink it to just the status-bar rule:

```css
/* 480px — small phones */
@media (max-width: 480px) {
  .status-bar {
    font-size: 0.8rem;
    padding: 0.4rem 12rem 0.4rem 0.75rem;
  }
}
```

- [ ] **Step 2: Add the opponent rules to the 640px block**

The current block at (pre-edit) `game.css:1353` is:

```css
/* 640px — hand fan-stack */
@media (max-width: 640px) {
  .hand-view {
    flex-wrap: nowrap;
    justify-content: center;
  }

  .hand-view__card + .hand-view__card {
    margin-left: calc(-1 * var(--card-width) * 0.55);
  }
}
```

Change it to (the opponent rules move here verbatim, comment included; the
header comment gains "opponent collapse"):

```css
/* 640px — hand fan-stack + opponent single-card collapse */
@media (max-width: 640px) {
  .hand-view {
    flex-wrap: nowrap;
    justify-content: center;
  }

  .hand-view__card + .hand-view__card {
    margin-left: calc(-1 * var(--card-width) * 0.55);
  }

  /* Opponent: collapse stack to single card on narrow viewports.
     OpponentView writes inline styles for width/left, so !important is the only
     way to override them from CSS — refactoring to custom properties is tracked
     separately. */
  .opponent-view__stack {
    width: var(--card-width) !important;
  }

  .opponent-view__stack-card:not(:last-child) {
    display: none;
  }

  .opponent-view__stack-card:last-child {
    left: 0 !important;
  }

  .opponent-view__count {
    display: inline;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/public/css/game.css
git commit -m "fix(ui): collapse opponent stacks to one card at 640px, up from 480px"
```

---

### Task 3: 4-player across seat — landscape collapsed card

**Files:**
- Modify: `src/public/css/game.css` (the 640px block edited in Task 2)

- [ ] **Step 1: Append the across-zone landscape rules inside the 640px block**

Add at the end of the `@media (max-width: 640px)` block (after the
`.opponent-view__count` rule, before the closing `}`). Specificity note: the
stack carries an inline `width` (hence `!important`, same as above), while the
stack-card's size comes from the `.opponent-view__stack-card` class, which this
longer selector outranks without `!important`. Height has no inline style or
collapse override, so plain declarations suffice:

```css
  /* 4-player across seat: lay the collapsed card on its side — the top grid
     row shrinks from card-height to card-width, saving vertical space. The
     count badge is centred by the card's flex box, so it stays upright. */
  .game-table--four > .across-zone .opponent-view__stack {
    width: var(--card-height) !important;
    height: var(--card-width);
  }

  .game-table--four > .across-zone .opponent-view__stack-card {
    width: var(--card-height);
    height: var(--card-width);
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/public/css/game.css
git commit -m "fix(ui): lay the 4-player across seat's collapsed card landscape on small screens"
```

---

### Task 4: Visual verification (screenshots at 3 widths)

**Files:**
- Create: `temp/responsive-check.js` (throwaway — not committed)

- [ ] **Step 1: Write the screenshot script**

```js
/**
 * Throwaway visual check for the small-screen opponent collapse.
 * Creates a 4-player game (1 human + 3 bots), waits for the deal, then
 * screenshots the game screen at 490px / 360px / 1280px widths.
 *
 * Usage: node temp/responsive-check.js
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3099;

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['src/server.js'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => {
      if (d.toString().includes(String(PORT))) { resolve(proc); }
    });
    proc.on('error', reject);
    setTimeout(() => resolve(proc), 2000);
  });
}

async function main() {
  let server;
  let browser;
  try {
    server = await startServer();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 490, height: 800 });

    await page.goto(`http://localhost:${PORT}`);
    await page.fill('#nickname-input', 'Kashka');
    await page.click('#nickname-form button[type="submit"]');
    await page.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });

    await page.click('#new-game-btn');
    await page.waitForSelector('#new-game-modal:not(.hidden)', { timeout: 3000 });
    await page.check('input[name="player-count"][value="4"]');
    await page.click('#new-game-form button[type="submit"]');
    await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 8000 });

    for (let i = 1; i <= 3; i++) {
      await page.waitForSelector('#add-bot-btn:not(.hidden)', { timeout: 8000 });
      await page.click('#add-bot-btn');
      await page.waitForTimeout(900);
    }

    // Deal done when opponent stack cards exist; settle past the animation.
    await page.waitForSelector('.opponent-view__stack-card', { timeout: 20000 });
    await page.waitForTimeout(3500);

    for (const [w, h] of [[490, 800], [360, 740], [1280, 800]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `temp/check-${w}.png` });
      console.log(`saved temp/check-${w}.png`);
    }
  } finally {
    if (browser) { await browser.close().catch(() => {}); }
    if (server) { server.kill('SIGKILL'); }
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
```

- [ ] **Step 2: Run it**

```bash
node temp/responsive-check.js
```

Expected: three `saved temp/check-*.png` lines, exit 0. (Bots may be
mid-bidding in the shots — that's fine; the stacks, trump box, and across seat
are all visible during bidding.)

- [ ] **Step 3: Inspect the screenshots** (Read tool on each PNG)

Check `temp/check-490.png` and `temp/check-360.png` for:
- left/right opponents: exactly one upright card each, with the count number on it
- across (top) opponent: one landscape card (wider than tall) with the count number
- trump box: "TRUMP No trump" on a single line
- nothing overlapping the centre/status boxes

Check `temp/check-1280.png` (regression):
- all three opponents show full fanned stacks, no count number
- across card upright (portrait)
- trump box unchanged

If anything is off, fix the CSS, re-run the script, re-inspect, and make a new
fix commit.

- [ ] **Step 4: Run the test suite + lint (regression safety)**

```bash
npm test
npm run lint
```

Expected: all tests pass (1070+), lint clean — nothing here touches JS, so any
failure is pre-existing or environmental; investigate before proceeding.

- [ ] **Step 5: Delete the throwaway script and screenshots**

```bash
rm temp/responsive-check.js temp/check-490.png temp/check-360.png temp/check-1280.png
```

(`temp/` is untracked scratch space; `view.png` — the user's original
screenshot — stays.)
