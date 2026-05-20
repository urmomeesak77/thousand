/**
 * Focused live verification of the card-passing (card-exchange) phase.
 * Asserts:
 *   1. Declarer enters card-exchange with 10 cards.
 *   2. First pass succeeds: declarer 10 → 9; recipient grows from 7 → 8.
 *   3. After first pass, only 1 destination button remains for the next card.
 *   4. Second pass succeeds: declarer 9 → 8; the other recipient grows 7 → 8.
 *   5. Phase transitions to Trick play (status bar `__exchange-passes` disappears).
 *   6. No `action_rejected` toasts seen by any player during exchange.
 *   7. Opponents never see exchange destination buttons (Bug 1 regression check).
 *
 * Exits with code 0 on all assertions pass, 1 otherwise.
 */

const { chromium, firefox } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;

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

const log = (n, m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${n.padEnd(7)}: ${m}`);

async function count(page, sel) {
  try { return await page.locator(sel).count(); } catch { return 0; }
}

async function force(page, sel) {
  await page.locator(sel).first().click({ force: true, timeout: 2000 });
}

async function waitUntil(predicate, timeoutMs = 10000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) { return true; }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

const failures = [];
const assert = (cond, msg) => { if (!cond) { failures.push(msg); console.log(`❌ ${msg}`); } else { console.log(`✓ ${msg}`); } };

async function main() {
  let server;
  const browsers = [];
  try {
    console.log(`Starting server on port ${PORT}…`);
    server = await startServer();

    const chromeBrowser  = await chromium.launch({ channel: 'chrome', headless: true });
    const firefoxBrowser = await firefox.launch({ headless: true });
    const chromiumBrowser = await chromium.launch({ headless: true });
    browsers.push(chromeBrowser, firefoxBrowser, chromiumBrowser);

    const alice   = await chromeBrowser.newPage();
    const bob     = await firefoxBrowser.newPage();
    const charlie = await chromiumBrowser.newPage();
    for (const p of [alice, bob, charlie]) { await p.setViewportSize({ width: 1280, height: 800 }); }

    // Track rejection toasts per page.
    const rejectionsByName = { Alice: [], Bob: [], Charlie: [] };
    const pages = { Alice: alice, Bob: bob, Charlie: charlie };
    for (const [name, page] of Object.entries(pages)) {
      page.on('console', (m) => {
        const t = m.text();
        if (t.includes('Only the declarer') || t.includes('Already passed')) {
          rejectionsByName[name].push(t);
        }
      });
    }

    await Promise.all([alice, bob, charlie].map(p => p.goto(BASE_URL)));

    log('Alice', 'entering nickname');
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

    await bob.waitForSelector('#game-list li[data-id]', { timeout: 10000 });
    await bob.click('#game-list li[data-id]');
    await bob.click('#join-selected-btn');
    await charlie.waitForSelector('#game-list li[data-id]', { timeout: 10000 });
    await charlie.click('#game-list li[data-id]');
    await charlie.click('#join-selected-btn');

    log('main', 'waiting for round to start');

    // Wait for bidding phase to be active for Bob first (left of dealer Alice).
    await waitUntil(async () => await count(bob, '.bid-controls__pass:not(:disabled)') > 0, 15000);

    // Both opponents pass; dealer (Alice) auto-wins at 100.
    log('Bob', 'pass bid');
    await force(bob, '.bid-controls__pass:not(:disabled)');
    await waitUntil(async () => await count(charlie, '.bid-controls__pass:not(:disabled)') > 0, 8000);
    log('Charlie', 'pass bid');
    await force(charlie, '.bid-controls__pass:not(:disabled)');

    // Alice should now see the declarer "Start the Game" button.
    await waitUntil(async () => await count(alice, '.declarer-controls__start:not(:disabled)') > 0, 8000);
    // Brief settle so the post-talon-absorb re-mount has applied (avoids
    // clicking before the listener has wired through the antlion event bus).
    await new Promise(r => setTimeout(r, 500));
    log('Alice', 'start game');
    await alice.locator('.declarer-controls__start:not(:disabled)').first().click({ timeout: 3000 });

    // ─── Card-exchange phase ─────────────────────────────────────────────────
    await waitUntil(async () => await count(alice, '.status-bar__exchange-passes') > 0, 8000);
    // Wait for the talon-absorb animation + render to complete so Alice has 10 cards.
    const aliceHas10 = await waitUntil(
      async () => await count(alice, '.hand-view__card[data-card-id]') === 10,
      5000
    );
    assert(aliceHas10, 'Alice has 10 cards at start of card-exchange (after talon absorb)');

    const bobInitial = await count(bob, '.hand-view__card[data-card-id]');
    const charlieInitial = await count(charlie, '.hand-view__card[data-card-id]');
    assert(bobInitial === 7, `Bob has 7 cards before exchange (got ${bobInitial})`);
    assert(charlieInitial === 7, `Charlie has 7 cards before exchange (got ${charlieInitial})`);

    // Bug 1 regression check: opponents should NOT see dest buttons when clicking their own hand
    await force(bob, '.hand-view__card[data-card-id]');
    await new Promise(r => setTimeout(r, 200));
    const bobDestBtns = await count(bob, '.card-exchange__dest-btn');
    assert(bobDestBtns === 0, `Bob (opponent) clicking hand card must NOT produce dest buttons (got ${bobDestBtns})`);

    await force(charlie, '.hand-view__card[data-card-id]');
    await new Promise(r => setTimeout(r, 200));
    const charlieDestBtns = await count(charlie, '.card-exchange__dest-btn');
    assert(charlieDestBtns === 0, `Charlie (opponent) clicking hand card must NOT produce dest buttons (got ${charlieDestBtns})`);

    // Alice: first pass
    await force(alice, '.hand-view__card[data-card-id]');
    await waitUntil(async () => await count(alice, '.card-exchange__dest-btn') >= 2, 3000);
    const firstDestCount = await count(alice, '.card-exchange__dest-btn');
    assert(firstDestCount === 2, `Two dest buttons on first card click (got ${firstDestCount})`);

    await force(alice, '.card-exchange__dest-btn');
    // After server confirms, Alice should be at 9 cards and one recipient at 8.
    await waitUntil(async () => await count(alice, '.hand-view__card[data-card-id]') === 9, 5000);
    const aliceAfterFirst = await count(alice, '.hand-view__card[data-card-id]');
    assert(aliceAfterFirst === 9, `Alice has 9 cards after first pass (got ${aliceAfterFirst})`);

    const bobAfterFirst = await count(bob, '.hand-view__card[data-card-id]');
    const charlieAfterFirst = await count(charlie, '.hand-view__card[data-card-id]');
    // Bob is left of Alice → first dest button targets Bob.
    assert(bobAfterFirst === 8, `Bob (left) has 8 cards after receiving first pass (got ${bobAfterFirst})`);
    assert(charlieAfterFirst === 7, `Charlie (right) still has 7 cards before second pass (got ${charlieAfterFirst})`);

    // Alice: second pass — click another card; only one dest button should appear.
    await force(alice, '.hand-view__card[data-card-id]');
    await waitUntil(async () => await count(alice, '.card-exchange__dest-btn') >= 1, 3000);
    const secondDestCount = await count(alice, '.card-exchange__dest-btn');
    assert(secondDestCount === 1, `Only one dest button on second card click (got ${secondDestCount})`);

    await force(alice, '.card-exchange__dest-btn');

    // After second pass: should transition to trick-play.
    const exchangeGone = await waitUntil(
      async () => await count(alice, '.status-bar__exchange-passes') === 0,
      5000
    );
    assert(exchangeGone, 'Card-exchange phase ends after second pass (status-bar __exchange-passes gone)');

    const aliceFinal = await count(alice, '.hand-view__card[data-card-id]');
    const bobFinal = await count(bob, '.hand-view__card[data-card-id]');
    const charlieFinal = await count(charlie, '.hand-view__card[data-card-id]');
    assert(aliceFinal === 8, `Alice has 8 cards after both passes (got ${aliceFinal})`);
    assert(bobFinal === 8, `Bob has 8 cards after exchange (got ${bobFinal})`);
    assert(charlieFinal === 8, `Charlie has 8 cards after exchange (got ${charlieFinal})`);

    // Trick play should be active for Alice (declarer leads first trick).
    const aliceInteractive = await count(alice, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    assert(aliceInteractive > 0, `Alice (lead of first trick) sees interactive playable cards (got ${aliceInteractive})`);

    // Opponents in trick play: their hand should NOT have playable cards (waiting for Alice).
    const bobPlayable = await count(bob, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    const charliePlayable = await count(charlie, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    assert(bobPlayable === 0, `Bob waiting for Alice — no playable cards (got ${bobPlayable})`);
    assert(charliePlayable === 0, `Charlie waiting for Alice — no playable cards (got ${charliePlayable})`);

    // Rejection toast check
    const totalRejections = rejectionsByName.Alice.length + rejectionsByName.Bob.length + rejectionsByName.Charlie.length;
    assert(totalRejections === 0, `No "Only the declarer" / "Already passed" rejections during exchange (got ${totalRejections})`);

  } finally {
    for (const b of browsers) { await b.close().catch(() => {}); }
    if (server) { server.kill('SIGTERM'); }
  }

  if (failures.length === 0) {
    console.log('\n✅  Card-passing phase verified — all assertions passed.\n');
    process.exit(0);
  } else {
    console.log(`\n❌  ${failures.length} assertion(s) failed:\n`);
    for (const f of failures) { console.log(`   - ${f}`); }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Test crashed:', e.message);
  process.exit(2);
});
