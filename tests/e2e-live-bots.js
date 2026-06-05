/**
 * Live bot-seated end-to-end test: ONE human host (Chrome) + TWO server-side bots.
 * Plays a full game of Thousand so you can WATCH the bots bid (by hand strength,
 * well above the 100 minimum) and play autonomously using their card memory.
 *
 * The host always PASSES the bidding, so every accepted bid in the log is a BOT's —
 * which is exactly the thing the dumb e2e-live.js harness never exercised.
 *
 * Usage:  node tests/e2e-live-bots.js
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;
const HEADLESS = false;   // set true to run without a visible window
const SLOW_MO = 60;
const MAX_ITER = 2000;

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['src/server.js'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => {
      const s = d.toString();
      process.stdout.write(`[server] ${s}`);
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

async function isVisible(page, selector) {
  try { return await page.locator(selector).first().isVisible({ timeout: 80 }); }
  catch { return false; }
}

// The host's single-seat action policy. Bidding ALWAYS passes (so the bots win the
// auction and we observe their bids); everything else mirrors the e2e-live.js walkthrough.
async function hostAction(page) {
  if (await tryClick(page, '.final-results__back-btn')) { log('Kashka', '🏆 game over — back to lobby'); return 'final-back'; }
  if (await tryClick(page, '.round-summary__back-btn')) { log('Kashka', '🏆 victory — back to lobby'); return 'summary-back'; }
  if (await tryClick(page, '.round-summary__continue-btn:not(:disabled)')) { return 'continue'; }
  if (await tryClick(page, 'button[data-action="declare"]')) { log('Kashka', '💍 declares marriage'); return 'marriage'; }
  if (await countEls(page, 'button[data-action="play"]') > 0) { await forceClick(page, 'button[data-action="play"]'); return 'no-marriage'; }

  if (await countEls(page, '.status-bar__exchange-passes') > 0) {
    if (await countEls(page, '.card-exchange__dest-btn') > 0) { await forceClick(page, '.card-exchange__dest-btn'); return 'exchange'; }
    if (await countEls(page, '.hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
      await forceClick(page, '.hand-view__card[data-card-id]:not(.card--disabled)'); return 'exchange-selecting';
    }
    return 'exchange-wait';
  }

  if (await countEls(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
    await forceClick(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    log('Kashka', '🃏 plays trick card'); return 'play';
  }

  if (await tryClick(page, '.declarer-controls__start:not(:disabled)')) { log('Kashka', '▶ starts the game'); return 'start'; }
  if (await tryClick(page, '.sell-bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) { return 'sell-pass'; }
  // Main bidding: pass whenever a Pass button exists; only the forced last bidder bids.
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) { log('Kashka', '  passes bid (let the bots fight)'); return 'bid-pass'; }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__bid:not(:disabled)')) { log('Kashka', '  forced to take the contract at the minimum'); return 'bid-take'; }
  return null;
}

// Surface bot bids/declarers straight off the host's WebSocket stream.
function attachWsWatcher(page, tally) {
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      let m;
      try { m = JSON.parse(frame.payload); } catch { return; }
      if (m.type === 'bid_accepted' && typeof m.amount === 'number') {
        tally.bids.push(m.amount);
        tally.maxBid = Math.max(tally.maxBid, m.amount);
        log('🤖 BOT', `bids ${m.amount}`);
      } else if (m.type === 'talon_absorbed') {
        tally.rounds += 1;
        log('—', `auction resolved — round ${tally.rounds} declarer takes the talon`);
      }
    });
  });
}

async function main() {
  let server;
  let browser;
  const tally = { bids: [], maxBid: 0, rounds: 0 };
  const errors = [];
  try {
    console.log(`\nStarting server on port ${PORT}…`);
    server = await startServer();
    console.log('Server ready.\n');

    browser = await chromium.launch({
      channel: 'chrome', headless: HEADLESS, slowMo: SLOW_MO,
      args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
    });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    page.on('pageerror', (e) => { errors.push(e.message); log('Kashka', `❌ page error: ${e.message}`); });
    attachWsWatcher(page, tally);

    await page.goto(BASE_URL);
    log('Kashka', 'entering nickname…');
    await page.fill('#nickname-input', 'Kashka');
    await page.click('#nickname-form button[type="submit"]');
    await page.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });

    await page.click('#new-game-btn');
    await page.waitForSelector('#new-game-modal:not(.hidden)', { timeout: 3000 });
    await page.click('#new-game-form button[type="submit"]');
    await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 8000 });
    log('Kashka', 'created game, in waiting room');

    // Fill the two empty seats with bots — the table auto-starts when full (009 US1).
    for (let i = 1; i <= 2; i++) {
      await page.waitForSelector('#add-bot-btn:not(.hidden)', { timeout: 8000 });
      await page.click('#add-bot-btn');
      log('Kashka', `added bot ${i}`);
      await page.waitForTimeout(900);
    }

    console.log('\n— Table seated: 1 human + 2 bots. Waiting for the round to start… —\n');

    let iter = 0;
    let lobbyStreak = 0;
    while (iter < MAX_ITER) {
      iter++;
      // Only call it done when the lobby is shown AND the game screen is gone for
      // several consecutive polls — a transient flash during a re-deal isn't "complete".
      const inLobby = await isVisible(page, '#lobby-screen:not(.hidden)');
      const inGame = await isVisible(page, '#game-screen:not(.hidden)');
      if (inLobby && !inGame) {
        lobbyStreak += 1;
        if (lobbyStreak >= 8) { log('Kashka', '✅ back in lobby — game complete'); break; }
      } else {
        lobbyStreak = 0;
      }
      const action = await hostAction(page);
      // Bots act on their own 1–3 s timers; just poll while it's not the host's turn.
      if (!action) { await page.waitForTimeout(150); }
    }

    console.log('\n────────────────────────────────────────────────────────');
    console.log(' BOT-SEATED E2E SUMMARY');
    console.log('────────────────────────────────────────────────────────');
    console.log(` Rounds played          : ${tally.rounds}`);
    console.log(` Bot bids observed      : ${tally.bids.length}`);
    console.log(` Bot bid amounts        : ${tally.bids.join(', ') || '(none)'}`);
    console.log(` Highest bot bid        : ${tally.maxBid}`);
    console.log(` Bids above 100 minimum : ${tally.bids.filter((b) => b > 100).length}/${tally.bids.length}`);
    console.log(` Page errors            : ${errors.length}`);
    console.log(` Finished in lobby      : ${await isVisible(page, '#lobby-screen:not(.hidden)')}`);
    console.log('────────────────────────────────────────────────────────\n');

    await page.waitForTimeout(4000);
  } finally {
    if (browser) { await browser.close().catch(() => {}); }
    if (server) { server.kill('SIGKILL'); }
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
