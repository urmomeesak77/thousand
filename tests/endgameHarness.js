'use strict';

/**
 * Shared live-browser harness for the end-game / barrel e2e tests
 * (tests/e2e-endgame.js for 3 players, tests/e2e-endgame-4p.js for 4).
 *
 * Both entrypoints seed cumulative scores via the THOUSAND_SEED_SCORES seam
 * (src/services/testScoreSeeding.js) so the victory and barrel paths are
 * reachable in a round or two instead of ~10 full rounds. Each scenario boots
 * its own server (the seed is fixed at spawn time), drives N browsers through a
 * full game with the same auto-play strategy as tests/e2e-live.js, and asserts:
 *
 *   • game ending  — the FinalResults screen renders and the winner is >= 1000.
 *   • barrel logic  — a seat seeded inside the [880, 1000) band shows the
 *                     "On barrel — round 1 of 3" status-bar marker, and any
 *                     "Barrel penalty: −120" round-summary line that surfaces
 *                     during play carries the correct amount.
 *
 * The −120 penalty FIRING (3 rounds on barrel without crossing 1000) is
 * inherently non-deterministic under random live play, so it is observed
 * opportunistically here; Game.barrel.test.js / Round.buildSummary.penalties
 * own the authoritative penalty-firing coverage.
 */

const { chromium, firefox } = require('playwright');
const { spawn } = require('child_process');
const { VICTORY_THRESHOLD } = require('../src/services/GameRules');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;
// Default to headless: end-game runs play several full rounds, and windowed
// background-tab throttling can stall the trick-flight animation lock. Override
// with E2E_HEADLESS=false to watch.
const HEADLESS = process.env.E2E_HEADLESS !== 'false';
const SLOW_MO = Number(process.env.E2E_SLOW_MO ?? 0);
const MAX_ITER = 8000;
// Per-scenario wall-clock budget; a healthy seeded game finishes in 1–4 min.
const SCENARIO_BUDGET_MS = Number(process.env.E2E_SCENARIO_BUDGET_MS ?? 360_000);

const PLAYER_NAMES = ['Alice', 'Bob', 'Charlie', 'Dave'];

// ──────────────────────────────────────────────────────────────────────────────
// Server lifecycle (one fresh server per scenario — the seed is fixed at spawn)
// ──────────────────────────────────────────────────────────────────────────────

function startServer(seedScores) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PORT: String(PORT) };
    if (seedScores) { env.THOUSAND_SEED_SCORES = seedScores; }
    const proc = spawn('node', ['src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
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

function stopServer(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed) { resolve(); return; }
    proc.on('exit', () => resolve());
    proc.kill('SIGTERM');
    // Don't hang teardown if the process is slow to exit.
    setTimeout(resolve, 3000);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Small DOM helpers (mirrors tests/e2e-live.js)
// ──────────────────────────────────────────────────────────────────────────────

function log(name, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${name.padEnd(7)}: ${msg}`);
}

async function isVisible(page, selector) {
  try { return await page.locator(selector).first().isVisible({ timeout: 80 }); } catch { return false; }
}

async function tryClick(page, selector) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 80 })) { await el.click({ timeout: 2000 }); return true; }
  } catch { /* not actionable this tick */ }
  return false;
}

async function countEls(page, selector) {
  try { return await page.locator(selector).count(); } catch { return 0; }
}

async function forceClick(page, selector) {
  try { await page.locator(selector).first().click({ force: true, timeout: 1000 }); return true; } catch { return false; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-player auto-play action (identical strategy to tests/e2e-live.js):
// pass every bid, take the forced contract, exchange the first card, play the
// first legal card, declare marriages for faster victory, continue each round.
// ──────────────────────────────────────────────────────────────────────────────

async function takeAction(page, name) {
  if (await tryClick(page, '.final-results__back-btn')) { log(name, '🏆 game over — back to lobby'); return 'final-back'; }
  if (await tryClick(page, '.round-summary__back-btn')) { log(name, '🏆 round summary back to lobby'); return 'summary-back'; }
  if (await tryClick(page, '.round-summary__continue-btn:not(:disabled)')) { return 'continue'; }
  if (await tryClick(page, 'button[data-action="declare"]')) { log(name, '💍 declares marriage'); return 'marriage'; }
  if (await countEls(page, 'button[data-action="play"]') > 0) { await forceClick(page, 'button[data-action="play"]'); return 'no-marriage'; }

  if (await countEls(page, '.status-bar__exchange-passes') > 0) {
    if (await countEls(page, '.card-exchange__dest-btn') > 0) { await forceClick(page, '.card-exchange__dest-btn'); return 'exchange'; }
    if (await countEls(page, '.hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
      await forceClick(page, '.hand-view__card[data-card-id]:not(.card--disabled)');
      return 'exchange-selecting';
    }
    return 'exchange-wait';
  }

  if (await countEls(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
    await forceClick(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)');
    return 'play';
  }

  if (await tryClick(page, '.declarer-controls__start:not(:disabled)')) { log(name, '▶ starts the game'); return 'start'; }
  if (await tryClick(page, '.sell-bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) { return 'sell-pass'; }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) { return 'bid-pass'; }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__bid:not(:disabled)')) { return 'bid-take'; }
  return null;
}

function attachConsoleWatchers(page, name, errors) {
  page.on('pageerror', (err) => {
    errors.push({ name, type: 'pageerror', msg: err.message });
    log(name, `❌ page error: ${err.message}`);
  });
  page.on('console', (m) => {
    const type = m.type();
    if (type === 'error' || type === 'warning') {
      const text = m.text();
      if (!text.includes('DevTools') && !text.includes('favicon')) { errors.push({ name, type, msg: text }); }
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Browser launch + game setup, generalized to N players
// ──────────────────────────────────────────────────────────────────────────────

async function launchBrowsers(playerCount) {
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
  const launchers = [
    () => chromium.launch({ channel: 'chrome', headless: HEADLESS, slowMo: SLOW_MO, args: chromiumArgs }),
    () => firefox.launch({ headless: HEADLESS, slowMo: SLOW_MO, firefoxUserPrefs: firefoxPrefs }),
    () => chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO, args: chromiumArgs }),
    () => chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO, args: chromiumArgs }),
  ];
  const browsers = [];
  const pages = [];
  for (let i = 0; i < playerCount; i++) {
    const browser = await launchers[i]();
    browsers.push(browser);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    pages.push(page);
  }
  return { browsers, pages };
}

async function setupGame(pages, playerCount) {
  await Promise.all(pages.map((p) => p.goto(BASE_URL)));

  for (let i = 0; i < playerCount; i++) {
    await pages[i].fill('#nickname-input', PLAYER_NAMES[i]);
    await pages[i].click('#nickname-form button[type="submit"]');
    log(PLAYER_NAMES[i], 'entered nickname');
  }

  const host = pages[0];
  await host.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
  await host.click('#new-game-btn');
  await host.waitForSelector('#new-game-modal:not(.hidden)', { timeout: 3000 });
  if (playerCount === 4) {
    await host.check('input[name="player-count"][value="4"]');
  }
  await host.click('#new-game-form button[type="submit"]');
  await host.waitForSelector('#game-screen:not(.hidden)', { timeout: 8000 });
  log(PLAYER_NAMES[0], `created ${playerCount}-player game`);

  for (let i = 1; i < playerCount; i++) {
    const page = pages[i];
    await page.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
    await page.waitForSelector('#game-list li[data-id]', { timeout: 10000 });
    await page.click('#game-list li[data-id]');
    await page.click('#join-selected-btn');
    log(PLAYER_NAMES[i], 'joined');
  }
}

// Read the barrel-marker text rendered in the status bar (global — same on every
// tab). Returns an array of strings like "On barrel — round 1 of 3".
async function readBarrelMarkers(page) {
  try {
    return await page.locator('.status-bar__barrel-marker').allTextContents();
  } catch { return []; }
}

// Read any penalty-row text shown on a round-summary screen.
async function readPenaltyRows(page) {
  try {
    return await page.locator('.round-summary__penalty-row').allTextContents();
  } catch { return []; }
}

// Read the FinalResults winner row → { nickname, score } or null.
async function readFinalWinner(page) {
  try {
    const winnerRow = page.locator('.final-results__ranking-row--winner').first();
    if (await winnerRow.count() === 0) { return null; }
    const nickname = (await winnerRow.locator('.final-results__ranking-nickname').textContent())?.trim();
    const scoreText = (await winnerRow.locator('.final-results__ranking-score').textContent())?.trim();
    return { nickname, score: Number.parseInt(scoreText, 10) };
  } catch { return null; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Scenario runner
// ──────────────────────────────────────────────────────────────────────────────

async function runScenario({ playerCount, seedScores, label, barrelSeatExpected }) {
  console.log(`\n${'═'.repeat(70)}\n▶ SCENARIO: ${label}  (players=${playerCount}, seed=${seedScores})\n${'═'.repeat(70)}\n`);

  const results = { label, failures: [], checks: [] };
  const check = (cond, msg) => {
    results.checks.push({ ok: !!cond, msg });
    console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${msg}`);
    if (!cond) { results.failures.push(msg); }
  };

  let server;
  let browsers = [];
  // Observations accumulated across the whole run.
  const barrelMarkerTexts = new Set();
  const penaltyTexts = new Set();
  let finalWinner = null;

  try {
    server = await startServer(seedScores);
    const launched = await launchBrowsers(playerCount);
    browsers = launched.browsers;
    const pages = launched.pages;

    const errors = [];
    pages.forEach((p, i) => attachConsoleWatchers(p, PLAYER_NAMES[i], errors));

    await setupGame(pages, playerCount);
    console.log(`\n— All ${playerCount} joined. Playing to victory… —\n`);

    const done = new Array(playerCount).fill(false);
    let doneCnt = 0;
    let iter = 0;
    let consecutiveNoActor = 0;
    // Wall-clock guard: each loop iteration runs many Playwright queries, so the
    // iteration cap alone is a poor time bound. Bail after SCENARIO_BUDGET_MS so
    // a non-converging game fails fast instead of running for hours.
    const startedAt = Date.now();

    while (doneCnt < playerCount && iter < MAX_ITER) {
      iter++;
      if (Date.now() - startedAt > SCENARIO_BUDGET_MS) {
        console.log(`\n⚠️  TIME BUDGET EXCEEDED (${(SCENARIO_BUDGET_MS / 1000) | 0}s) — bailing scenario.`);
        break;
      }

      // Sample barrel markers / penalty rows / winner each cycle. Scan every
      // tab for the winner row — whichever player has not yet clicked through
      // the FinalResults screen still shows it.
      for (const t of await readBarrelMarkers(pages[0])) { barrelMarkerTexts.add(t.trim()); }
      for (const t of await readPenaltyRows(pages[0])) { penaltyTexts.add(t.trim()); }
      if (!finalWinner) {
        for (let i = 0; i < playerCount && !finalWinner; i++) {
          if (!done[i]) { finalWinner = await readFinalWinner(pages[i]); }
        }
      }

      let anyActor = false;
      for (let i = 0; i < playerCount; i++) {
        if (done[i]) { continue; }
        const page = pages[i];
        if (await isVisible(page, '#lobby-screen:not(.hidden)')) {
          log(PLAYER_NAMES[i], '✅ back in lobby — done');
          done[i] = true; doneCnt++;
          continue;
        }
        const action = await takeAction(page, PLAYER_NAMES[i]);
        if (action) { anyActor = true; }
      }

      consecutiveNoActor = anyActor ? 0 : consecutiveNoActor + 1;
      if (consecutiveNoActor >= 80) {
        console.log(`\n⚠️  STUCK — no player acted for ${consecutiveNoActor} iterations. Dumping screenshots…`);
        for (let i = 0; i < playerCount; i++) {
          await pages[i].screenshot({ path: `endgame-stuck-${PLAYER_NAMES[i].toLowerCase()}.png` }).catch(() => {});
        }
        break;
      }
      await new Promise((r) => setTimeout(r, HEADLESS ? 80 : 150));
    }

    // ── Assertions ───────────────────────────────────────────────────────────
    check(doneCnt === playerCount, `all ${playerCount} players returned to the lobby (game completed)`);
    check(finalWinner != null, 'FinalResults screen rendered a winner row (game ending reached)');
    if (finalWinner) {
      check(Number.isInteger(finalWinner.score) && finalWinner.score >= VICTORY_THRESHOLD,
        `winner ${finalWinner.nickname} finished at ${finalWinner.score} (>= ${VICTORY_THRESHOLD})`);
    }

    if (barrelSeatExpected != null) {
      // The seeded barrel seat starts at "round 1 of 3" and holds it through round 1.
      const sawRoundOne = [...barrelMarkerTexts].some((t) => /On barrel — round 1 of 3/.test(t));
      check(sawRoundOne, `barrel marker "On barrel — round 1 of 3" shown for seeded seat (saw: ${JSON.stringify([...barrelMarkerTexts])})`);
    } else {
      console.log(`  ℹ barrel markers observed during play: ${JSON.stringify([...barrelMarkerTexts])}`);
    }

    // Opportunistic: any penalty line that surfaced must carry the −120 amount.
    if (penaltyTexts.size > 0) {
      const allMinus120 = [...penaltyTexts].every((t) => t.includes('−120') || t.includes('-120'));
      check(allMinus120, `every observed penalty line is −120 (saw: ${JSON.stringify([...penaltyTexts])})`);
    } else {
      console.log('  ℹ no barrel/zero penalty line surfaced this run (expected — penalty firing is non-deterministic in live play)');
    }

    const realErrors = errors.filter((e) => e.type === 'pageerror');
    check(realErrors.length === 0, `no uncaught page errors (saw ${realErrors.length})`);

  } catch (e) {
    check(false, `scenario threw: ${e.message}`);
    console.error(e.stack);
  } finally {
    for (const b of browsers) { await b.close().catch(() => {}); }
    await stopServer(server);
    // Give the OS a moment to release port 3099 before the next scenario.
    await new Promise((r) => setTimeout(r, 800));
  }

  return results;
}

async function runEndgameSuite(playerCount) {
  // Victory scenario: seed every seat just shy of 1000 so whichever seat takes
  // the round's contract can cross the line and the game reaches its natural
  // ending (FinalResults, winner >= 1000) in a round or two. A flat 700,700,700
  // seed is too slow: crossing 1000 requires winning a round AS DECLARER while
  // on the barrel, so an honest climb from 700 routinely blows the wall-clock
  // budget under random auto-play (it bailed at 360s — see git history).
  const victorySeed = new Array(playerCount).fill(985).join(',');
  // Barrel scenario: seat 0 trails inside the [880, 1000) band so the
  // "On barrel — round 1 of 3" marker is guaranteed at round 1, with the leader
  // (seat 1) just shy of victory so the game resolves in a round or two (a
  // leader seeded low on the barrel gets bid-floored and eventually penalized,
  // dragging the run out for many rounds — see git history of this file).
  const barrelSeed = [900, 990, 950, 930].slice(0, playerCount).join(',');

  const scenarios = [
    { playerCount, seedScores: victorySeed, label: `${playerCount}P — all near victory, play to game end`, barrelSeatExpected: null },
    { playerCount, seedScores: barrelSeed, label: `${playerCount}P — seat 0 on barrel, leader near victory`, barrelSeatExpected: 0 },
  ];

  const results = [];
  for (const sc of scenarios) {
    results.push(await runScenario(sc));
  }

  console.log(`\n${'═'.repeat(70)}\nSUMMARY (${playerCount} players)\n${'═'.repeat(70)}`);
  let totalFail = 0;
  for (const r of results) {
    const passed = r.checks.filter((c) => c.ok).length;
    console.log(`  ${r.failures.length === 0 ? '✅' : '❌'} ${r.label} — ${passed}/${r.checks.length} checks passed`);
    totalFail += r.failures.length;
  }
  if (totalFail === 0) {
    console.log(`\n✅  ALL END-GAME CHECKS PASSED (${playerCount} players)\n`);
  } else {
    console.log(`\n❌  ${totalFail} CHECK(S) FAILED (${playerCount} players)\n`);
    process.exitCode = 1;
  }
}

module.exports = { runEndgameSuite };
