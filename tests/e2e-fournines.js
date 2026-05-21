/**
 * Focused live 3-browser test for the four-nines bonus (spec 006, T028).
 * Forces the rare hand via THOUSAND_STACK_DECK=four-nines (seat 1 = Bob holds
 * all four 9s post-exchange), then verifies: blocking modal on all 3 tabs,
 * +100 cumulative bump, gate holds the first lead, sticky ack across reconnect,
 * gate releases after the 3rd ack, and the round-summary "Four nines: +100"
 * line item.
 *
 * Usage:  node tests/e2e-fournines.js
 */

const { chromium, firefox } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;
const HEADLESS = false;
const SLOW_MO = 60;

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
      env: { ...process.env, PORT: String(PORT), THOUSAND_STACK_DECK: 'four-nines' },
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

// Drive bidding / declarer-start / card-exchange only (no trick cards, no acks).
async function driveToExchangeEnd(page, name) {
  if (await tryClick(page, '.declarer-controls__start:not(:disabled)')) { log(name, '▶ starts the game'); return; }
  if (await countEls(page, '.status-bar__exchange-passes') > 0) {
    // A card is selected → a destination button is shown; click it to pass.
    if (await countEls(page, '.card-exchange__dest-btn') > 0) { await forceClick(page, '.card-exchange__dest-btn'); log(name, '↕ passed exchange card'); return; }
    // No card selected yet → click a hand card to select (exchange uses the hand view).
    if (await countEls(page, '.hand-view__card[data-card-id]:not(.card--disabled)') > 0) { await forceClick(page, '.hand-view__card[data-card-id]:not(.card--disabled)'); return; }
    return;
  }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) { log(name, 'passes bid'); return; }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__bid:not(:disabled)')) { log(name, 'bids (forced)'); return; }
}

// Drive trick play + round summary (after the gate is released).
async function driveTrickAndSummary(page, name) {
  if (await tryClick(page, 'button[data-action="declare"]')) { log(name, '💍 declares marriage'); return 'act'; }
  if (await countEls(page, 'button[data-action="play"]') > 0) { await forceClick(page, 'button[data-action="play"]'); log(name, 'plays K/Q (no declare)'); return 'act'; }
  if (await countEls(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
    await forceClick(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    log(name, '🃏 plays trick card');
    return 'act';
  }
  if (await isVisible(page, '.round-summary__table')) { return 'summary'; }
  return 'wait';
}

async function dumpState(page, name) {
  const state = await page.evaluate(() => ({
    status: document.querySelector('.status-bar')?.textContent ?? null,
    turn: document.querySelector('.status-bar__turn')?.textContent ?? null,
    interactive: !!document.querySelector('.hand-view--interactive'),
    handCards: document.querySelectorAll('.hand-view__card[data-card-id]').length,
    enabledCards: document.querySelectorAll('.hand-view__card[data-card-id]:not(.card--disabled)').length,
    modalUp: !!document.querySelector('.four-nines-modal button'),
    summary: !!document.querySelector('.round-summary__table'),
  })).catch((e) => ({ error: e.message }));
  console.log(`[STUCK ${name}]`, JSON.stringify(state));
}

async function main() {
  let server;
  const browsers = [];
  try {
    console.log(`\nStarting server on port ${PORT} with THOUSAND_STACK_DECK=four-nines…`);
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
    console.log('\n— Driving to the four-nines moment… —\n');

    // ── Phase 1: drive bidding+start+exchange until the modal appears ──────────
    let modalSeen = false;
    for (let i = 0; i < 400 && !modalSeen; i++) {
      for (const { page, name } of players) { await driveToExchangeEnd(page, name); }
      modalSeen = await isVisible(alice, '.four-nines-modal');
      await new Promise((r) => setTimeout(r, 150));
    }

    console.log('\n=== Four-nines award assertions ===');
    check(modalSeen, 'blocking modal appeared after card exchange');
    for (const { page, name } of players) {
      const present = await isVisible(page, '.four-nines-modal');
      check(present, `${name}: sees the four-nines modal`);
      const text = await page.locator('.four-nines-modal__text').first().textContent().catch(() => '');
      check(/four nines/i.test(text) && text.includes('100'), `${name}: modal text "${(text || '').trim()}"`);
    }
    // +100 cumulative bump visible in the scoreboard total row.
    const totals = await alice.locator('.scoreboard__total .scoreboard__val').allTextContents().catch(() => []);
    check(totals.includes('100'), `cumulative shows +100 in scoreboard totals [${totals.join(', ')}]`);

    // Gate holds: the blocking modal overlay sits above the table so the only
    // operable control is Acknowledge (trick play stays gated; the server also
    // rejects any premature play_card — covered by round-messages.fournines).
    const overlayBlocks = await alice.evaluate(() => {
      const o = document.querySelector('.four-nines-modal');
      if (!o) { return false; }
      const cs = getComputedStyle(o);
      return cs.position === 'fixed' && Number(cs.zIndex) >= 100 && cs.display !== 'none';
    });
    check(overlayBlocks, 'blocking overlay covers the table while the gate is open');

    console.log('\n=== Acknowledgment gate ===');
    await forceClick(alice, '.four-nines-modal button[data-action="acknowledge"]');
    log('Alice', 'acknowledged');
    await new Promise((r) => setTimeout(r, 400));
    check(await isVisible(bob, '.four-nines-modal'), 'gate still open after 1 ack (Bob modal up)');
    check(await isVisible(charlie, '.four-nines-modal'), 'gate still open after 1 ack (Charlie modal up)');

    await forceClick(bob, '.four-nines-modal button[data-action="acknowledge"]');
    log('Bob', 'acknowledged');
    await new Promise((r) => setTimeout(r, 400));
    check(await isVisible(charlie, '.four-nines-modal'), 'gate still open after 2 acks (Charlie modal up)');

    // ── Reconnect mid-gate: Bob already acked → sticky press preserved ─────────
    console.log('\n=== Reconnect mid-gate (Bob already acked) ===');
    await bob.reload();
    await new Promise((r) => setTimeout(r, 1200));
    const bobModalBack = await isVisible(bob, '.four-nines-modal');
    check(bobModalBack, 'Bob: modal restored on reconnect');
    const bobAckBtnDisabled = await bob.locator('.four-nines-modal button[data-action="acknowledge"]').first().isDisabled().catch(() => false);
    check(bobAckBtnDisabled, 'Bob: prior acknowledgment is sticky (button shows waiting state)');

    await forceClick(charlie, '.four-nines-modal button[data-action="acknowledge"]');
    log('Charlie', 'acknowledged (3rd)');
    await new Promise((r) => setTimeout(r, 800));
    console.log('\n=== Gate release ===');
    for (const { page, name } of players) {
      check(!(await isVisible(page, '.four-nines-modal')), `${name}: modal closed after 3rd ack`);
    }

    // ── Phase 2: play the hand out, check the round-summary line item ──────────
    console.log('\n— Playing the hand to the round summary… —\n');
    let summarySeen = false;
    let idleIters = 0;
    let dumped = false;
    for (let i = 0; i < 500 && !summarySeen; i++) {
      let acted = false;
      for (const { page, name } of players) {
        const r = await driveTrickAndSummary(page, name);
        if (r === 'act') { acted = true; }
      }
      idleIters = acted ? 0 : idleIters + 1;
      if (idleIters >= 40 && !dumped) {
        dumped = true;
        console.log(`\n⚠️  trick play idle for ${idleIters} iters — dumping state:`);
        for (const { page, name } of players) { await dumpState(page, name); }
      }
      summarySeen = await isVisible(alice, '.round-summary__table');
      await new Promise((r) => setTimeout(r, 150));
    }
    console.log('\n=== Round summary line item ===');
    check(summarySeen, 'round summary appeared');
    const lineItem = await alice.locator('.round-summary__four-nines-row').first().textContent().catch(() => '');
    check(/four nines/i.test(lineItem) && lineItem.includes('100'), `distinct line item "${(lineItem || '').trim()}"`);

    console.log(`\n${failures === 0 ? '✅ ALL FOUR-NINES CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}\n`);
    if (failures > 0) { process.exitCode = 1; }
    await new Promise((r) => setTimeout(r, 4000));
  } finally {
    for (const b of browsers) { await b.close().catch(() => {}); }
    if (server) { server.kill('SIGTERM'); }
  }
}

main().catch((err) => { console.error('\n❌ Test error:', err.message); process.exit(1); });
