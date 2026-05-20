/**
 * Extended live verification — exercises manual-testing scenarios beyond the
 * deterministic happy path:
 *   • Pass to RIGHT first (regression: the buggy slice-based dest list assumed left→right).
 *   • Re-select a different card BEFORE clicking dest (selection swap, no double-pass).
 *   • Recipient sees the EXACT card identity that was passed (rank+suit, not just count).
 *   • Third player (non-recipient) does NOT see their hand grow on each pass.
 *   • Clicking the same dest button twice does NOT cause a double pass.
 *   • Opponent's HandView shows no `.hand-view__card--selected` when they click their hand.
 *   • Total cards across the table stay at 24 throughout.
 *
 * Exits 0 on full pass, 1 otherwise.
 */

const { chromium, firefox } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;

function startServer() {
  return new Promise((resolve) => {
    const proc = spawn('node', ['src/server.js'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => {
      if (d.toString().includes('running at')) resolve(proc);
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[server err] ${d}`));
    setTimeout(() => resolve(proc), 2000);
  });
}

const log = (n, m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${n.padEnd(7)}: ${m}`);
async function count(page, sel) { try { return await page.locator(sel).count(); } catch { return 0; } }
async function waitUntil(predicate, timeoutMs = 8000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (await predicate()) return true; await new Promise(r => setTimeout(r, intervalMs)); }
  return false;
}

const failures = [];
const assert = (cond, msg) => { if (!cond) { failures.push(msg); console.log(`❌ ${msg}`); } else { console.log(`✓ ${msg}`); } };

async function getHandCardIds(page) {
  return await page.evaluate(() => Array.from(document.querySelectorAll('.hand-view__card[data-card-id]')).map(el => Number(el.dataset.cardId)));
}

async function getHandCardClassChars(page) {
  // Returns array of "rankSuit" strings derived from the CSS class `card--{rank}{suitLetter}`.
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.hand-view__card[data-card-id]')).map(el => {
      const m = Array.from(el.classList).find(c => c.startsWith('card--') && c !== 'card--disabled');
      return m ? m.slice(6) : null;
    }).filter(Boolean);
  });
}

async function main() {
  console.log('Starting server…');
  const server = await startServer();
  const cb  = await chromium.launch({ channel: 'chrome', headless: true });
  const fb  = await firefox.launch({ headless: true });
  const cmb = await chromium.launch({ headless: true });
  const alice = await cb.newPage();
  const bob = await fb.newPage();
  const charlie = await cmb.newPage();

  // Track unexpected rejections via the toast text appearing in DOM.
  const rejections = { Alice: [], Bob: [], Charlie: [] };
  const pageByName = { Alice: alice, Bob: bob, Charlie: charlie };
  for (const [n, p] of Object.entries(pageByName)) {
    p.on('console', (m) => {
      const t = m.text();
      if (/declarer can pass|Already passed|Cannot pass to yourself|Card not in hand/i.test(t)) {
        rejections[n].push(t);
      }
    });
  }

  try {
    for (const p of [alice, bob, charlie]) { await p.setViewportSize({ width: 1280, height: 800 }); }
    await Promise.all([alice, bob, charlie].map(p => p.goto(BASE_URL)));

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
    await bob.waitForSelector('#game-list li[data-id]', { timeout: 10000 });
    await bob.click('#game-list li[data-id]');
    await bob.click('#join-selected-btn');
    await charlie.waitForSelector('#game-list li[data-id]', { timeout: 10000 });
    await charlie.click('#game-list li[data-id]');
    await charlie.click('#join-selected-btn');

    // Bidding: both opponents pass; dealer (Alice) auto-wins.
    await waitUntil(async () => await count(bob, '.bid-controls__pass:not(:disabled)') > 0, 15000);
    log('Bob', 'pass bid');
    await bob.locator('.bid-controls__pass:not(:disabled)').first().click({ timeout: 2000 });
    await waitUntil(async () => await count(charlie, '.bid-controls__pass:not(:disabled)') > 0, 8000);
    log('Charlie', 'pass bid');
    await charlie.locator('.bid-controls__pass:not(:disabled)').first().click({ timeout: 2000 });

    await waitUntil(async () => await count(alice, '.declarer-controls__start:not(:disabled)') > 0, 8000);
    await new Promise(r => setTimeout(r, 600));
    log('Alice', 'start game');
    await alice.locator('.declarer-controls__start:not(:disabled)').first().click({ timeout: 3000 });

    // Card-exchange phase entered.
    await waitUntil(async () => await count(alice, '.status-bar__exchange-passes') > 0, 8000);
    await waitUntil(async () => await count(alice, '.hand-view__card[data-card-id]') === 10, 5000);

    const aliceHand0 = await getHandCardIds(alice);
    const bobHand0 = await getHandCardIds(bob);
    const charlieHand0 = await getHandCardIds(charlie);
    assert(aliceHand0.length === 10, `Alice has 10 cards initially (got ${aliceHand0.length})`);
    assert(bobHand0.length === 7,    `Bob has 7 cards initially (got ${bobHand0.length})`);
    assert(charlieHand0.length === 7,`Charlie has 7 cards initially (got ${charlieHand0.length})`);
    const total0 = aliceHand0.length + bobHand0.length + charlieHand0.length;
    assert(total0 === 24, `Total cards on table = 24 (got ${total0})`);

    // ── Scenario A: opponent clicks own hand — must NOT cause a selection or dest button ──
    await bob.locator('.hand-view__card[data-card-id]').first().click({ timeout: 2000 });
    await new Promise(r => setTimeout(r, 200));
    const bobSelected = await count(bob, '.hand-view__card--selected');
    const bobDest     = await count(bob, '.card-exchange__dest-btn');
    assert(bobSelected === 0, `Bob (opponent) clicking own hand does NOT select a card (got ${bobSelected})`);
    assert(bobDest === 0,     `Bob (opponent) clicking own hand does NOT spawn dest buttons (got ${bobDest})`);

    // ── Scenario B: declarer selects card A, then picks card B instead (selection swap) ──
    const aliceCard1Id = aliceHand0[0];
    const aliceCard2Id = aliceHand0[1];
    await alice.locator(`.hand-view__card[data-card-id="${aliceCard1Id}"]`).click({ timeout: 2000 });
    await waitUntil(async () => await count(alice, '.card-exchange__dest-btn') === 2, 2000);
    let selectedIds = await alice.evaluate(() => Array.from(document.querySelectorAll('.hand-view__card--selected')).map(el => Number(el.dataset.cardId)));
    assert(selectedIds.length === 1 && selectedIds[0] === aliceCard1Id, `After clicking card ${aliceCard1Id}, it is highlighted-selected (got ${JSON.stringify(selectedIds)})`);

    await alice.locator(`.hand-view__card[data-card-id="${aliceCard2Id}"]`).click({ timeout: 2000 });
    await new Promise(r => setTimeout(r, 200));
    selectedIds = await alice.evaluate(() => Array.from(document.querySelectorAll('.hand-view__card--selected')).map(el => Number(el.dataset.cardId)));
    assert(selectedIds.length === 1 && selectedIds[0] === aliceCard2Id, `Clicking a different card swaps the selection (got ${JSON.stringify(selectedIds)})`);
    const destAfterSwap = await count(alice, '.card-exchange__dest-btn');
    assert(destAfterSwap === 2, `Two dest buttons still shown after selection swap (got ${destAfterSwap})`);

    // ── Scenario C: pass to the RIGHT seat first (regression: was broken by slice-based logic) ──
    // Dest buttons are labelled with player nickname. Right seat = Charlie.
    const charlieDestSelector = '.card-exchange__dest-btn[data-seat]'; // pick the one targeting seat for Charlie
    // We need to click the button whose data-seat corresponds to Alice's right (Charlie).
    // Alice is seat 0, Bob seat 1 (left), Charlie seat 2 (right). So data-seat="2".
    const charlieIdsBefore = await getHandCardIds(charlie);
    await alice.locator('.card-exchange__dest-btn[data-seat="2"]').click({ timeout: 3000 });

    // First pass settles
    await waitUntil(async () => await count(alice, '.hand-view__card[data-card-id]') === 9, 5000);
    const aliceHand1 = await getHandCardIds(alice);
    const bobHand1 = await getHandCardIds(bob);
    const charlieHand1 = await getHandCardIds(charlie);
    assert(aliceHand1.length === 9,   `Alice has 9 cards after first (right) pass (got ${aliceHand1.length})`);
    assert(bobHand1.length === 7,     `Bob (NOT recipient of first pass) still has 7 (got ${bobHand1.length})`);
    assert(charlieHand1.length === 8, `Charlie (recipient of first pass) has 8 (got ${charlieHand1.length})`);

    // Verify identity: Charlie's new card must be the one Alice passed (aliceCard2Id).
    assert(charlieHand1.includes(aliceCard2Id), `Charlie received the exact card Alice passed (id ${aliceCard2Id})`);
    assert(!aliceHand1.includes(aliceCard2Id),  `Alice's hand no longer contains the passed card (id ${aliceCard2Id})`);
    const newInCharlie = charlieHand1.filter((id) => !charlieIdsBefore.includes(id));
    assert(newInCharlie.length === 1 && newInCharlie[0] === aliceCard2Id, `Exactly one new card in Charlie's hand and it's id ${aliceCard2Id} (got ${JSON.stringify(newInCharlie)})`);

    // ── Scenario D: after first pass (to right), remaining dest must be LEFT (Bob) only ──
    const aliceCard3Id = aliceHand1[0];
    await alice.locator(`.hand-view__card[data-card-id="${aliceCard3Id}"]`).click({ timeout: 2000 });
    await waitUntil(async () => await count(alice, '.card-exchange__dest-btn') === 1, 2000);
    const remainingDests = await alice.evaluate(() => {
      return Array.from(document.querySelectorAll('.card-exchange__dest-btn')).map(b => ({ seat: b.dataset.seat, text: b.textContent }));
    });
    assert(remainingDests.length === 1 && remainingDests[0].seat === '1',
      `Only Bob (seat 1, left) remains as dest after passing to Charlie first (got ${JSON.stringify(remainingDests)})`);

    // ── Scenario E: clicking the same dest button twice does NOT double-pass ──
    const bobIdsBeforeSecond = await getHandCardIds(bob);
    const destBtnLocator = alice.locator('.card-exchange__dest-btn[data-seat="1"]');
    // Fire two clicks in quick succession.
    await Promise.all([
      destBtnLocator.click({ timeout: 2000 }).catch(() => {}),
      destBtnLocator.click({ timeout: 2000, force: true }).catch(() => {}),
    ]);

    // Second pass transitions to trick play.
    await waitUntil(async () => await count(alice, '.status-bar__exchange-passes') === 0, 6000);
    const aliceHand2 = await getHandCardIds(alice);
    const bobHand2 = await getHandCardIds(bob);
    const charlieHand2 = await getHandCardIds(charlie);
    assert(aliceHand2.length === 8,   `Alice has 8 cards after both passes (got ${aliceHand2.length})`);
    assert(bobHand2.length === 8,     `Bob has 8 cards after receiving second pass (got ${bobHand2.length})`);
    assert(charlieHand2.length === 8, `Charlie has 8 cards after exchange (got ${charlieHand2.length})`);
    assert(bobHand2.includes(aliceCard3Id), `Bob received the exact card Alice passed second (id ${aliceCard3Id})`);
    const newInBob = bobHand2.filter((id) => !bobIdsBeforeSecond.includes(id));
    assert(newInBob.length === 1, `Exactly one new card in Bob's hand after second pass (got ${newInBob.length}: ${JSON.stringify(newInBob)})`);

    const total2 = aliceHand2.length + bobHand2.length + charlieHand2.length;
    assert(total2 === 24, `Total cards on table still 24 after exchange (got ${total2})`);

    // Trick play is active for Alice (declarer leads first trick).
    const aliceInteractive = await count(alice, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    assert(aliceInteractive === 8, `Alice has 8 playable cards in trick play (got ${aliceInteractive})`);

    const bobInteractive = await count(bob, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    const charlieInteractive = await count(charlie, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    assert(bobInteractive === 0, `Bob has no playable cards (not his turn) (got ${bobInteractive})`);
    assert(charlieInteractive === 0, `Charlie has no playable cards (not his turn) (got ${charlieInteractive})`);

    // Rejection summary
    const total = rejections.Alice.length + rejections.Bob.length + rejections.Charlie.length;
    assert(total === 0, `No exchange-related rejection toasts during phase (got ${total}: ${JSON.stringify(rejections)})`);

    // Identity sanity: each player's hand has unique card IDs.
    const allIds = [...aliceHand2, ...bobHand2, ...charlieHand2];
    const uniq = new Set(allIds);
    assert(uniq.size === allIds.length, `All 24 card IDs across hands are unique (got ${uniq.size} unique of ${allIds.length})`);

  } finally {
    await cb.close().catch(()=>{});
    await fb.close().catch(()=>{});
    await cmb.close().catch(()=>{});
    server.kill('SIGTERM');
  }

  if (failures.length === 0) {
    console.log(`\n✅  Extended card-passing scenarios — all assertions passed.\n`);
    process.exit(0);
  } else {
    console.log(`\n❌  ${failures.length} assertion(s) failed.\n`);
    for (const f of failures) console.log(`   - ${f}`);
    process.exit(1);
  }
}

main().catch(e => { console.error('Test crashed:', e.message); process.exit(2); });
