/**
 * Live verification of the round-summary auto-continue timer.
 *
 * Plays one full round across 3 browsers to reach the first (non-victory)
 * round summary, then DOES NOT click "Continue". It verifies:
 *   1. The Continue button label shows a countdown number, e.g. "(30)".
 *   2. The number decrements over a few seconds (real Antlion timer ticking).
 *   3. With nobody clicking, the summary auto-advances to the next round
 *      within ~AUTO_CONTINUE_SECONDS — i.e. all three local timers auto-fired.
 *
 * Usage:  node tests/e2e-auto-continue.js
 */

const { chromium, firefox } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;
const HEADLESS = true;   // no display needed; foreground-throttling args below keep timers running
const SLOW_MO = 20;
const AUTO_CONTINUE_SECONDS = 30;

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['src/server.js'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => {
      const s = d.toString();
      if (s.includes('running at') || s.includes(String(PORT))) { resolve(proc); }
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[server err] ${d}`));
    proc.on('error', reject);
    setTimeout(() => resolve(proc), 2000);
  });
}

function log(name, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${name.padEnd(7)}: ${msg}`);
}

async function isVisible(page, selector) {
  try { return await page.locator(selector).first().isVisible({ timeout: 80 }); }
  catch { return false; }
}

async function tryClick(page, selector) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 80 })) { await el.click({ timeout: 2000 }); return true; }
  } catch {}
  return false;
}

async function countEls(page, selector) {
  try { return await page.locator(selector).count(); } catch { return 0; }
}

async function forceClick(page, selector) {
  try { await page.locator(selector).first().click({ force: true, timeout: 1000 }); return true; }
  catch { return false; }
}

// Drives every phase EXCEPT round summary (we never click Continue / Back here —
// reaching the summary is the goal, and the auto-continue timer must advance it).
async function takeActionNoContinue(page, name) {
  if (await tryClick(page, 'button[data-action="declare"]')) { log(name, 'declares marriage'); return 'marriage'; }
  if (await countEls(page, 'button[data-action="play"]') > 0) { await forceClick(page, 'button[data-action="play"]'); return 'no-marriage'; }

  if (await countEls(page, '.status-bar__exchange-passes') > 0) {
    if (await countEls(page, '.card-exchange__dest-btn') > 0) { await forceClick(page, '.card-exchange__dest-btn'); return 'exchange'; }
    if (await countEls(page, '.hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
      await forceClick(page, '.hand-view__card[data-card-id]:not(.card--disabled)'); return 'exchange-selecting';
    }
    return 'exchange-wait';
  }

  if (await countEls(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
    await forceClick(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)'); return 'play';
  }
  if (await tryClick(page, '.declarer-controls__start:not(:disabled)')) { log(name, 'starts the game'); return 'start'; }
  if (await tryClick(page, '.sell-bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) { return 'sell-pass'; }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) { return 'bid-pass'; }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__bid:not(:disabled)')) { log(name, 'forced bid'); return 'bid-take'; }
  return null;
}

const fail = (msg) => { console.log(`\n❌ FAIL: ${msg}\n`); process.exitCode = 1; };
const pass = (msg) => console.log(`✅ ${msg}`);

async function continueLabel(page) {
  try { return (await page.locator('.round-summary__continue-btn').first().textContent({ timeout: 200 })) ?? ''; }
  catch { return ''; }
}
const labelNumber = (text) => { const m = text.match(/\((\d+)\)/); return m ? Number(m[1]) : null; };

async function main() {
  let server;
  const browsers = [];
  try {
    console.log(`\nStarting server on port ${PORT}…`);
    server = await startServer();
    console.log('Server ready.\n');

    const chromiumArgs = [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ];
    const firefoxPrefs = {
      'dom.min_background_timeout_value': 4,
      'dom.timeout.throttling_delay': 0,
      'dom.timeout.background_throttling_max_budget': -1,
      'dom.timeout.foreground_throttling_max_budget': -1,
    };
    const chromeBrowser   = await chromium.launch({ channel: 'chrome', headless: HEADLESS, slowMo: SLOW_MO, args: chromiumArgs });
    const firefoxBrowser  = await firefox.launch({                     headless: HEADLESS, slowMo: SLOW_MO, firefoxUserPrefs: firefoxPrefs });
    const chromiumBrowser = await chromium.launch({                    headless: HEADLESS, slowMo: SLOW_MO, args: chromiumArgs });
    browsers.push(chromeBrowser, firefoxBrowser, chromiumBrowser);

    const alice   = await chromeBrowser.newPage();
    const bob     = await firefoxBrowser.newPage();
    const charlie = await chromiumBrowser.newPage();
    for (const p of [alice, bob, charlie]) { await p.setViewportSize({ width: 1280, height: 800 }); }

    await Promise.all([alice, bob, charlie].map((p) => p.goto(BASE_URL)));

    await alice.fill('#nickname-input', 'Alice');
    await alice.click('#nickname-form button[type="submit"]');
    await bob.fill('#nickname-input', 'Bob');
    await bob.click('#nickname-form button[type="submit"]');
    await charlie.fill('#nickname-input', 'Charlie');
    await charlie.click('#nickname-form button[type="submit"]');

    await alice.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
    await alice.click('#new-game-btn');
    await alice.waitForSelector('#new-game-modal:not(.hidden)', { timeout: 3000 });
    await alice.click('#new-game-form button[type="submit"]');
    await alice.waitForSelector('#game-screen:not(.hidden)', { timeout: 8000 });
    log('Alice', 'created game');

    for (const [page, name] of [[bob, 'Bob'], [charlie, 'Charlie']]) {
      await page.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
      await page.waitForSelector('#game-list li[data-id]', { timeout: 10000 });
      await page.click('#game-list li[data-id]');
      await page.click('#join-selected-btn');
      log(name, 'joined');
    }

    const players = [{ page: alice, name: 'Alice' }, { page: bob, name: 'Bob' }, { page: charlie, name: 'Charlie' }];

    console.log('\n— Playing one round to reach the first round summary… —\n');

    // Phase A: drive all phases until Alice shows a Continue button.
    let iter = 0;
    const MAX_ITER = 6000;
    while (iter < MAX_ITER) {
      iter++;
      if (await countEls(alice, '.round-summary__continue-btn') > 0) { break; }
      for (const { page, name } of players) { await takeActionNoContinue(page, name); }
      await new Promise((r) => setTimeout(r, 120));
    }

    if (await countEls(alice, '.round-summary__continue-btn') === 0) {
      fail('never reached a round summary with a Continue button');
      return;
    }
    const summaryAppearedAt = Date.now();
    log('Alice', 'round summary reached — NOT clicking Continue');

    // Check 1: label shows a countdown number.
    const l1 = await continueLabel(alice);
    const n1 = labelNumber(l1);
    if (n1 === null) { fail(`Continue label has no countdown number: "${l1}"`); }
    else { pass(`Continue label shows countdown: "${l1.trim()}"`); }

    // Check 2: number decrements over ~4s.
    await new Promise((r) => setTimeout(r, 4000));
    const l2 = await continueLabel(alice);
    const n2 = labelNumber(l2);
    if (n1 !== null && n2 !== null && n2 < n1) { pass(`countdown decremented ${n1} → ${n2} over ~4s`); }
    else { fail(`countdown did not decrement: "${l1.trim()}" → "${l2.trim()}"`); }

    // Check 3: with NOBODY clicking, the summary auto-advances within the budget.
    // All three local timers fire ~simultaneously at AUTO_CONTINUE_SECONDS; once all
    // have fired the server starts the next round (bid controls reappear) or the
    // summary screen is replaced. Poll until the Continue button is gone on Alice.
    const budgetMs = (AUTO_CONTINUE_SECONDS + 12) * 1000;
    let advanced = false;
    while (Date.now() - summaryAppearedAt < budgetMs) {
      const onSummary = await countEls(alice, '.round-summary__continue-btn') > 0;
      const onBidding = await isVisible(alice, '.bid-controls:not(.hidden)');
      const onFinal = await countEls(alice, '.final-results__back-btn') > 0;
      if (!onSummary || onBidding || onFinal) { advanced = true; break; }
      await new Promise((r) => setTimeout(r, 500));
    }
    const elapsed = ((Date.now() - summaryAppearedAt) / 1000).toFixed(1);
    if (advanced) { pass(`summary auto-advanced after ~${elapsed}s with zero Continue clicks`); }
    else { fail(`summary did NOT auto-advance within ${budgetMs / 1000}s (no clicks)`); }

  } catch (err) {
    fail(`exception: ${err.message}`);
    console.error(err);
  } finally {
    for (const b of browsers) { await b.close().catch(() => {}); }
    if (server) { server.kill('SIGTERM'); }
  }

  console.log(process.exitCode ? '\n=== AUTO-CONTINUE VERIFICATION FAILED ===\n' : '\n=== AUTO-CONTINUE VERIFICATION PASSED ===\n');
}

main().catch((err) => { console.error('\n❌ Test error:', err.message); process.exit(1); });
