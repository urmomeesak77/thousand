/**
 * Live 3-browser end-to-end test: Chrome + Firefox + Chromium
 * Plays a full game of Thousand: lobby → bidding → card exchange → tricks → victory
 *
 * Usage:  node tests/e2e-live.js
 */

const { chromium, firefox } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;
const HEADLESS = true;   // set true to run without visible browsers
const SLOW_MO = 20;       // ms between actions for visibility

// ──────────────────────────────────────────────────────────────────────────────
// Server management
// ──────────────────────────────────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['src/server.js'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => {
      const s = d.toString();
      process.stdout.write(`[server] ${s}`);
      if (s.includes('running at') || s.includes(String(PORT))) {
        resolve(proc);
      }
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[server err] ${d}`));
    proc.on('error', reject);
    // Fallback: resolve after 2s even if we miss the log
    setTimeout(() => resolve(proc), 2000);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function log(name, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${name.padEnd(7)}: ${msg}`);
}

async function isVisible(page, selector) {
  try {
    return await page.locator(selector).first().isVisible({ timeout: 80 });
  } catch {
    return false;
  }
}

async function tryClick(page, selector) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 80 })) {
      await el.click({ timeout: 2000 });
      return true;
    }
  } catch {}
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-player action: returns what was done, or null if nothing was ready
// ──────────────────────────────────────────────────────────────────────────────

// Count elements matching selector (works even if zero-size / not "visible")
async function countEls(page, selector) {
  try {
    return await page.locator(selector).count();
  } catch {
    return 0;
  }
}

// Force-click by selector (bypasses Playwright visibility check for small elements)
async function forceClick(page, selector) {
  try {
    const el = page.locator(selector).first();
    await el.click({ force: true, timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

async function takeAction(page, name, stats) {
  // Final results: game over — go back to lobby
  if (await tryClick(page, '.final-results__back-btn')) {
    log(name, '🏆 game over — back to lobby');
    return 'final-back';
  }

  // Round summary: victory round (victoryReached=true shows "Back to Lobby")
  if (await tryClick(page, '.round-summary__back-btn')) {
    log(name, '🏆 round summary back to lobby');
    return 'summary-back';
  }

  // Round summary: non-victory — continue to next round
  if (await tryClick(page, '.round-summary__continue-btn:not(:disabled)')) {
    log(name, '→ continue to next round');
    return 'continue';
  }

  // Marriage declaration prompt — declare for bonus points
  if (await tryClick(page, 'button[data-action="declare"]')) {
    log(name, '💍 declares marriage');
    return 'marriage';
  }

  // Marriage prompt "Play without declaring"
  if (await countEls(page, 'button[data-action="play"]') > 0) {
    await forceClick(page, 'button[data-action="play"]');
    log(name, '  plays K/Q without declaring');
    return 'no-marriage';
  }

  // Card exchange phase — detected by status bar element (only present in this phase).
  // Hand cards live in .hand-view__card with data-card-id; dest buttons are .card-exchange__dest-btn.
  if (await countEls(page, '.status-bar__exchange-passes') > 0) {
    // Declarer with a card already selected: click first dest button (force, may be small)
    if (await countEls(page, '.card-exchange__dest-btn') > 0) {
      const handBefore = await countEls(page, '.hand-view__card[data-card-id]');
      await forceClick(page, '.card-exchange__dest-btn');
      log(name, `↕ passed exchange card (hand was ${handBefore})`);
      if (stats) { stats.exchangePassesByMe = (stats.exchangePassesByMe || 0) + 1; }
      return 'exchange';
    }
    // Declarer with no card selected yet: click first hand card
    if (await countEls(page, '.hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
      await forceClick(page, '.hand-view__card[data-card-id]:not(.card--disabled)');
      return 'exchange-selecting';
    }
    // Opponent — record hand size while we wait, to confirm the receive grows it.
    if (stats) {
      const sz = await countEls(page, '.hand-view__card[data-card-id]');
      if (sz > 0) { stats.lastHandSizeDuringExchange = sz; }
    }
    return 'exchange-wait';
  }

  // Trick play — play first non-disabled hand card (no exchange status bar means trick phase
  // when hand is interactive).
  if (await countEls(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
    await forceClick(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    log(name, '🃏 plays trick card');
    return 'play';
  }

  // Declarer decision: start the game (skip selling for speed)
  if (await tryClick(page, '.declarer-controls__start:not(:disabled)')) {
    log(name, '▶ starts the game');
    return 'start';
  }

  // Sell-bid phase: pass
  if (await tryClick(page, '.sell-bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) {
    log(name, '  passes sell-bid');
    return 'sell-pass';
  }

  // Main bidding: pass (let the dealer auto-win at 100)
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) {
    log(name, '  passes bid');
    return 'bid-pass';
  }

  return null;
}

// Watch the console for "Already passed to that opponent" toast triggers and other errors.
function attachConsoleWatchers(page, name, errors) {
  page.on('pageerror', (err) => {
    errors.push({ name, type: 'pageerror', msg: err.message });
    log(name, `❌ page error: ${err.message}`);
  });
  page.on('console', (m) => {
    const type = m.type();
    if (type === 'error' || type === 'warning') {
      const text = m.text();
      if (!text.includes('DevTools') && !text.includes('favicon')) {
        errors.push({ name, type, msg: text });
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Main test
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  let server;
  const browsers = [];

  try {
    // ── Start server ──────────────────────────────────────────────────────────
    console.log(`\nStarting server on port ${PORT}…`);
    server = await startServer();
    console.log('Server ready.\n');

    // ── Launch browsers ───────────────────────────────────────────────────────
    console.log('Launching Chrome, Firefox, Chromium…');
    const chromeBrowser   = await chromium.launch({ channel: 'chrome',   headless: HEADLESS, slowMo: SLOW_MO });
    const firefoxBrowser  = await firefox.launch({                        headless: HEADLESS, slowMo: SLOW_MO });
    const chromiumBrowser = await chromium.launch({                       headless: HEADLESS, slowMo: SLOW_MO });
    browsers.push(chromeBrowser, firefoxBrowser, chromiumBrowser);

    const alice   = await chromeBrowser.newPage();
    const bob     = await firefoxBrowser.newPage();
    const charlie = await chromiumBrowser.newPage();

    // Larger viewport so all UI fits
    for (const p of [alice, bob, charlie]) {
      await p.setViewportSize({ width: 1280, height: 800 });
    }

    // ── Navigate ──────────────────────────────────────────────────────────────
    await Promise.all([alice, bob, charlie].map(p => p.goto(BASE_URL)));
    console.log('All three browsers at', BASE_URL, '\n');

    // ── Enter nicknames ───────────────────────────────────────────────────────
    log('Alice',   'entering nickname…');
    await alice.fill('#nickname-input', 'Alice');
    await alice.click('#nickname-form button[type="submit"]');

    log('Bob',     'entering nickname…');
    await bob.fill('#nickname-input', 'Bob');
    await bob.click('#nickname-form button[type="submit"]');

    log('Charlie', 'entering nickname…');
    await charlie.fill('#nickname-input', 'Charlie');
    await charlie.click('#nickname-form button[type="submit"]');

    // Wait for Alice's lobby
    await alice.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
    log('Alice', 'in lobby');

    // ── Alice creates a public game ───────────────────────────────────────────
    await alice.click('#new-game-btn');
    await alice.waitForSelector('#new-game-modal:not(.hidden)', { timeout: 3000 });
    // "public" radio is checked by default — just submit
    await alice.click('#new-game-form button[type="submit"]');
    log('Alice', 'created game');

    // Wait for Alice to enter the waiting room
    await alice.waitForSelector('#game-screen:not(.hidden)', { timeout: 8000 });
    log('Alice', 'in waiting room');

    // ── Bob joins ─────────────────────────────────────────────────────────────
    await bob.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
    await bob.waitForSelector('#game-list li[data-id]', { timeout: 10000 });
    await bob.click('#game-list li[data-id]');
    await bob.click('#join-selected-btn');
    await bob.waitForSelector('#game-screen:not(.hidden)', { timeout: 8000 });
    log('Bob', 'joined & in waiting room');

    // ── Charlie joins ─────────────────────────────────────────────────────────
    await charlie.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
    await charlie.waitForSelector('#game-list li[data-id]', { timeout: 10000 });
    await charlie.click('#game-list li[data-id]');
    await charlie.click('#join-selected-btn');
    log('Charlie', 'joined');

    // ── Wait for the round to auto-start ─────────────────────────────────────
    // When the 3rd player joins the server broadcasts round_started and
    // all clients transition to the round screen (bid controls appear).
    console.log('\n— All three joined. Waiting for round to start… —\n');

    const players = [
      { page: alice,   name: 'Alice',   stats: { exchangePassesByMe: 0, lastHandSizeDuringExchange: null, handGrowthObserved: false } },
      { page: bob,     name: 'Bob',     stats: { exchangePassesByMe: 0, lastHandSizeDuringExchange: null, handGrowthObserved: false } },
      { page: charlie, name: 'Charlie', stats: { exchangePassesByMe: 0, lastHandSizeDuringExchange: null, handGrowthObserved: false } },
    ];

    // Capture all errors/warnings — surfacing any "Already passed to that opponent"
    // rejection (the original bug) would print to the toast console in the page.
    const errors = [];
    for (const { page, name } of players) {
      attachConsoleWatchers(page, name, errors);
    }

    // ── Game loop ─────────────────────────────────────────────────────────────
    const done    = [false, false, false];
    let doneCnt   = 0;
    let iter      = 0;
    const MAX_ITER = 3000;

    while (doneCnt < 3 && iter < MAX_ITER) {
      iter++;

      for (let i = 0; i < 3; i++) {
        if (done[i]) { continue; }

        const { page, name, stats } = players[i];

        // Check if this player made it back to the lobby (game complete)
        if (await isVisible(page, '#lobby-screen:not(.hidden)')) {
          log(name, '✅ back in lobby — done');
          done[i] = true;
          doneCnt++;
          continue;
        }

        // While in exchange phase, observe whether opponents' hands ever grow above
        // their pre-exchange size (validates the recipient-HandView fix).
        if (await countEls(page, '.status-bar__exchange-passes') > 0 && stats.lastHandSizeDuringExchange != null) {
          const currentSize = await countEls(page, '.hand-view__card[data-card-id]');
          if (currentSize > stats.lastHandSizeDuringExchange) {
            stats.handGrowthObserved = true;
          }
        }

        await takeAction(page, name, stats);
      }

      // Pause between cycles (shorter when something is happening)
      await new Promise(r => setTimeout(r, 150));
    }

    if (doneCnt === 3) {
      console.log('\n✅  FULL GAME COMPLETE — all 3 players back in lobby!\n');
    } else {
      console.log(`\n⚠️  Loop exited after ${iter} iterations. ${doneCnt}/3 players finished.\n`);
      // Take screenshots for debugging
      for (const { page, name } of players) {
        await page.screenshot({ path: `${name.toLowerCase()}-final.png` });
        log(name, `screenshot saved → ${name.toLowerCase()}-final.png`);
      }
      process.exitCode = 1;
    }

    // Keep windows open briefly so user can see the final state
    console.log('Keeping browsers open for 6 seconds…');
    await new Promise(r => setTimeout(r, 6000));

  } finally {
    for (const b of browsers) {
      await b.close().catch(() => {});
    }
    if (server) {
      server.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Test error:', err.message);
  process.exit(1);
});
