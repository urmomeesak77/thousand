/**
 * Live two-tab smoke test for the same-browser multi-tab feature.
 *
 * Two tabs in ONE browser context share localStorage → one identity. Verifies:
 *   Scenario 1 (sequential): Tab A creates a game; Tab B (same context) opens and
 *     lands in the SAME game without kicking Tab A; closing Tab B leaves Tab A alive.
 *   Scenario 2 (simultaneous fresh load): two fresh tabs open at once converge on
 *     ONE player — proven because an action in Tab A (creating a game) mirrors to
 *     Tab B (it auto-receives game_joined and enters the waiting room).
 *
 * Usage:  node tests/e2e-multitab.js
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3098;
const BASE_URL = `http://localhost:${PORT}`;
const HEADLESS = true;
const SLOW_MO = 0;

// Disable background-tab throttling so the TabSync election timers fire on time
// in a backgrounded page (Chromium throttles background timers by default).
const CHROMIUM_ARGS = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

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

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function visible(page, selector, timeout = 8000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function isShown(page, selector) {
  try { return await page.locator(selector).first().isVisible({ timeout: 200 }); }
  catch { return false; }
}

// The nickname screen is present in the initial HTML before the socket connects.
// Wait until the WS `connected` handler has run — it persists the identity to
// localStorage right after setting the API session token — so we never submit a
// request before the session token is set. (A real user typing a nickname never
// hits this race; only an instantaneous script does.)
async function waitForConnected(page, timeout = 10000) {
  await page.waitForFunction(() => !!localStorage.getItem('thousand_identity'), null, { timeout });
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  log(`${ok ? '✅ PASS' : '❌ FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
}

async function claimNicknameAndCreateGame(page, nick) {
  // Wait for the app to actually show the nickname screen — it does this only
  // after the WebSocket `connected` message, which now arrives a beat late
  // because the first connect is deferred until TabSync resolves the identity.
  // Interacting before then would click un-wired controls.
  if (!await visible(page, '#nickname-screen:not(.hidden)', 10000)) {
    throw new Error('nickname screen never appeared (connection not established)');
  }
  await waitForConnected(page);
  await page.fill('#nickname-input', nick);
  await page.click('#nickname-form button[type="submit"]');
  if (!await visible(page, '#lobby-screen:not(.hidden)', 10000)) {
    throw new Error('lobby never appeared after nickname submit');
  }
  await page.waitForSelector('#new-game-btn:visible', { timeout: 5000 });
  await page.click('#new-game-btn');
  await visible(page, '#new-game-modal:not(.hidden)', 3000);
  await page.click('#new-game-form button[type="submit"]');
  await visible(page, '#game-screen:not(.hidden)');
}

// ── Scenario 1: sequential — second tab mirrors, first not kicked ──────────────
async function scenarioSequential(browser) {
  log('--- Scenario 1: sequential second tab ---');
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  try {
    const tabA = await ctx.newPage();
    await tabA.goto(BASE_URL);
    await claimNicknameAndCreateGame(tabA, 'Mira');
    log('Tab A: created a game and is in the waiting room.');

    // Tab B opens in the SAME context (shared localStorage → same identity).
    const tabB = await ctx.newPage();
    await tabB.goto(BASE_URL);

    const bInGame = await visible(tabB, '#game-screen:not(.hidden)', 8000);
    const bOnNickname = await isShown(tabB, '#nickname-screen:not(.hidden)');
    check('Tab B lands directly in the same game (restored state, not a fresh nickname screen)',
      bInGame && !bOnNickname,
      `inGame=${bInGame} onNickname=${bOnNickname}`);

    // The original last-connect-wins behavior would have shown Tab A a
    // "session ended" toast and stopped its socket. Tab A must remain in the game.
    await tabA.waitForTimeout(800);
    const aStillInGame = await isShown(tabA, '#game-screen:not(.hidden)');
    check('Tab A is NOT kicked when Tab B connects', aStillInGame,
      `A inGame=${aStillInGame}`);

    // Close one tab; the player still has a live socket, so no grace/abort.
    await tabB.close();
    await tabA.waitForTimeout(1200);
    const aSurvives = await isShown(tabA, '#game-screen:not(.hidden)');
    check('Closing Tab B leaves Tab A connected (game not aborted)', aSurvives,
      `A inGame=${aSurvives}`);
  } finally {
    await ctx.close();
  }
}

// ── Scenario 2: simultaneous fresh tabs converge to one player ─────────────────
async function scenarioSimultaneousFresh(browser) {
  log('--- Scenario 2: two simultaneous fresh tabs ---');
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  try {
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    // Open both as close to simultaneously as possible — this is the fresh-load
    // race the TabSync election must resolve to a single identity.
    await Promise.all([tabA.goto(BASE_URL), tabB.goto(BASE_URL)]);

    const aReady = await visible(tabA, '#nickname-screen:not(.hidden)', 8000);
    const bReady = await visible(tabB, '#nickname-screen:not(.hidden)', 8000);
    check('Both fresh tabs reach the nickname screen', aReady && bReady,
      `A=${aReady} B=${bReady}`);

    // Claim a nickname in Tab A and create a game. If the election worked, both
    // tabs are the SAME server-side player, so creating in A sends game_joined to
    // every socket of that player → Tab B mirrors into the waiting room. If the
    // race had created two players, Tab B (a different player) would stay on the
    // nickname screen and the lobby would show A's game only.
    await claimNicknameAndCreateGame(tabA, 'Solo');
    log('Tab A: claimed nickname and created a game.');

    const bMirrored = await visible(tabB, '#game-screen:not(.hidden)', 8000);
    check('Tab B mirrors into the same game (proves single player + action mirroring)',
      bMirrored, `B inGame=${bMirrored}`);

    // Belt-and-suspenders: Tab B must NOT still be sitting on the nickname screen.
    const bStranded = await isShown(tabB, '#nickname-screen:not(.hidden)');
    check('Tab B is not stranded as a separate player', !bStranded,
      `B onNickname=${bStranded}`);
  } finally {
    await ctx.close();
  }
}

async function main() {
  let server;
  let browser;
  try {
    log(`Starting server on port ${PORT}…`);
    server = await startServer();
    log('Server ready.');

    browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS, slowMo: SLOW_MO, args: CHROMIUM_ARGS });

    await scenarioSequential(browser);
    await scenarioSimultaneousFresh(browser);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n──────── Two-tab smoke: ${results.length - failed.length}/${results.length} checks passed ────────`);
    if (failed.length) {
      console.log('FAILED:', failed.map((r) => r.name).join('; '));
      process.exitCode = 1;
    } else {
      console.log('✅ ALL TWO-TAB SMOKE CHECKS PASSED');
    }
  } catch (err) {
    console.error('\n❌ Test error:', err.stack || err.message);
    process.exitCode = 1;
  } finally {
    if (browser) { await browser.close().catch(() => {}); }
    if (server) { server.kill('SIGTERM'); }
  }
}

main();
