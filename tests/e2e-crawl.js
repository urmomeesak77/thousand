/**
 * Focused live 3-browser test for the crawl mechanic (spec 007, T029).
 * Forces an ace-less declarer via THOUSAND_STACK_DECK=no-ace-declarer (seat 0 =
 * Alice declares and holds no ace), then verifies: the declarer is offered a
 * Crawl / Lead-normally choice (opponents are not), a full crawl commits three
 * cards face-down (no faces shown), and the third commit reveals all three and
 * advances to trick 2.
 *
 * Usage:  node tests/e2e-crawl.js
 */

const { chromium, firefox } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;
const HEADLESS = true;
const SLOW_MO = 40;

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${msg}`);
  if (!cond) { failures++; }
}
function log(name, msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${name.padEnd(7)}: ${msg}`);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['src/server.js'], {
      env: { ...process.env, PORT: String(PORT), THOUSAND_STACK_DECK: 'no-ace-declarer' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => {
      const s = d.toString();
      process.stdout.write(`[server] ${s}`);
      if (s.includes('running at')) { resolve(proc); }
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[server err] ${d}`));
    proc.on('error', reject);
    setTimeout(() => resolve(proc), 2000);
  });
}

const isVisible = async (page, sel) => {
  try { return await page.locator(sel).first().isVisible({ timeout: 80 }); } catch { return false; }
};
const countEls = async (page, sel) => {
  try { return await page.locator(sel).count(); } catch { return 0; }
};
const tryClick = async (page, sel) => {
  try {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 80 })) { await el.click({ timeout: 2000 }); return true; }
  } catch {}
  return false;
};
const forceClick = async (page, sel) => {
  try { await page.locator(sel).first().click({ force: true, timeout: 1000 }); return true; } catch { return false; }
};

// Drive bidding / declarer-start / card-exchange (no trick cards).
async function driveToTrickPlay(page, name) {
  if (await tryClick(page, '.declarer-controls__start:not(:disabled)')) { log(name, '▶ starts the game'); return; }
  if (await countEls(page, '.status-bar__exchange-passes') > 0) {
    if (await countEls(page, '.card-exchange__dest-btn') > 0) { await forceClick(page, '.card-exchange__dest-btn'); log(name, '↕ passed exchange card'); return; }
    if (await countEls(page, '.hand-view__card[data-card-id]:not(.card--disabled)') > 0) { await forceClick(page, '.hand-view__card[data-card-id]:not(.card--disabled)'); return; }
    return;
  }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) { log(name, 'passes bid'); return; }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__bid:not(:disabled)')) { log(name, 'bids (forced)'); return; }
}

// CrawlControls.showDeclarerChoice() resets the wrapper class to
// `crawl-controls--declarer`, so target the button by its data-action directly.
const CRAWL_BTN = 'button[data-action="crawl"]';

async function main() {
  let server;
  const browsers = [];
  try {
    console.log(`\nStarting server on port ${PORT} with THOUSAND_STACK_DECK=no-ace-declarer…`);
    server = await startServer();
    console.log('Server ready.\n');

    const args = ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
    const ffPrefs = { 'dom.min_background_timeout_value': 4, 'dom.timeout.throttling_delay': 0 };
    const chromeB = await chromium.launch({ channel: 'chrome', headless: HEADLESS, slowMo: SLOW_MO, args });
    const ffB = await firefox.launch({ headless: HEADLESS, slowMo: SLOW_MO, firefoxUserPrefs: ffPrefs });
    const cromB = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO, args });
    browsers.push(chromeB, ffB, cromB);

    const alice = await chromeB.newPage();
    const bob = await ffB.newPage();
    const charlie = await cromB.newPage();
    for (const p of [alice, bob, charlie]) { await p.setViewportSize({ width: 1280, height: 800 }); }

    await Promise.all([alice, bob, charlie].map((p) => p.goto(BASE_URL)));
    console.log('Three browsers loaded.\n');

    for (const [p, nick] of [[alice, 'Alice'], [bob, 'Bob'], [charlie, 'Charlie']]) {
      await p.fill('#nickname-input', nick);
      await p.click('#nickname-form button[type="submit"]');
    }
    await alice.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
    await alice.click('#new-game-btn');
    await alice.waitForSelector('#new-game-modal:not(.hidden)', { timeout: 3000 });
    await alice.click('#new-game-form button[type="submit"]');
    await alice.waitForSelector('#game-screen:not(.hidden)', { timeout: 8000 });
    log('Alice', 'created game');
    for (const [p, nick] of [[bob, 'Bob'], [charlie, 'Charlie']]) {
      await p.waitForSelector('#game-list li[data-id]', { timeout: 10000 });
      await p.click('#game-list li[data-id]');
      await p.click('#join-selected-btn');
      log(nick, 'joined');
    }

    const players = [{ page: alice, name: 'Alice' }, { page: bob, name: 'Bob' }, { page: charlie, name: 'Charlie' }];
    console.log('\n— Driving to trick play (Alice declares, ace-less)… —\n');

    // ── Phase 1: bidding + start + exchange until the crawl offer appears ──────
    let offerSeen = false;
    for (let i = 0; i < 400 && !offerSeen; i++) {
      for (const { page, name } of players) { await driveToTrickPlay(page, name); }
      offerSeen = await isVisible(alice, CRAWL_BTN);
      await new Promise((r) => setTimeout(r, 150));
    }

    console.log('\n=== Crawl offer assertions (FR-002) ===');
    check(offerSeen, 'Alice (ace-less declarer) is offered the Crawl choice');
    check(!(await isVisible(bob, CRAWL_BTN)), 'Bob (opponent) is NOT offered the Crawl choice');
    check(!(await isVisible(charlie, CRAWL_BTN)), 'Charlie (opponent) is NOT offered the Crawl choice');

    // ── Phase 2: Alice crawls, then both opponents commit blind ───────────────
    console.log('\n=== Crawl execution (FR-003, FR-004, FR-005) ===');
    await forceClick(alice, CRAWL_BTN);
    log('Alice', 'chose Crawl');
    await forceClick(alice, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    log('Alice', 'committed a card face-down');

    let commits = 1;
    for (let i = 0; i < 200 && commits < 3; i++) {
      for (const { page, name } of [{ page: bob, name: 'Bob' }, { page: charlie, name: 'Charlie' }]) {
        // An opponent whose turn it is sees the "commit face-down" prompt and an
        // interactive hand. Commit any card (follow-suit suspended).
        if (await isVisible(page, '.crawl-controls--opponent')
          && await countEls(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
          await forceClick(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
          commits += 1;
          log(name, `committed a card face-down (commit ${commits})`);
        }
      }
      // No committed face must ever be visible during the crawl.
      const faceUpInCentre = await alice.evaluate(() =>
        document.querySelectorAll('.trick-center .card-sprite--up').length);
      if (commits < 3) {
        check(faceUpInCentre === 0, `no face-up centre card after ${commits} commit(s)`);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    check(commits === 3, 'all three players committed a card face-down');

    // ── Phase 3: reveal + advance to trick 2 (FR-006, FR-007) ─────────────────
    console.log('\n=== Reveal + trick 2 (FR-006, FR-007) ===');
    await new Promise((r) => setTimeout(r, 3500)); // reveal flip + collect-flight
    for (const { page, name } of players) {
      check(!(await isVisible(page, CRAWL_BTN)), `${name}: crawl offer gone after the crawl`);
      check(!(await isVisible(page, '.crawl-controls--opponent')), `${name}: opponent prompt gone after reveal`);
    }
    // The round advanced past the crawl into trick 2 (FR-007). Read it from each
    // player's status bar (trickNumber is global once the crawl resolves).
    const statusBar = await alice.evaluate(() => document.querySelector('.status-bar')?.textContent ?? '');
    // Per-seat round stats render as "Tricks N, Points M" (self row + both
    // opponents). After the crawl, exactly one seat shows "Tricks 1".
    const collected = await alice.evaluate(() => {
      const els = [...document.querySelectorAll('.self-round-stats, .opponent-view__round-stats')];
      return els.map((e) => { const m = e.textContent.match(/Tricks\s+(\d+)/); return m ? parseInt(m[1], 10) : 0; })
        .reduce((a, c) => a + c, 0);
    });
    check(/Trick 2 of 8/.test(statusBar), `advanced to trick 2 after the crawl resolved (status: "${statusBar.trim()}")`);
    check(collected >= 1, `winner collected the crawl trick (total tricks shown = ${collected})`);

    console.log(`\n${failures === 0 ? '✅ ALL CRAWL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}\n`);
    if (failures > 0) { process.exitCode = 1; }
    await new Promise((r) => setTimeout(r, 1500));
  } finally {
    for (const b of browsers) { await b.close().catch(() => {}); }
    if (server) { server.kill('SIGTERM'); }
  }
}

main().catch((err) => { console.error('\n❌ Test error:', err.message); process.exit(1); });
