/**
 * Live sound-effects verification (feature 011): ONE human host (Chrome) + TWO bots.
 *
 * Objectively exercises the success criteria that the unit tests cannot — that the
 * real app, in a real browser, actually invokes audio playback on game events and
 * that the mute toggle silences it and persists:
 *   SC-001  a card cue (playing-card.mp3) fires while cards are dealt/played
 *   SC-002  while muted, no further play() is invoked for any event
 *   SC-003  the .mute-btn reflects state via aria-pressed
 *   SC-004  the choice is written to localStorage['thousand_muted']
 *
 * play() is intercepted on the media-element prototype, so a browser blocking
 * autoplay (rejected promise) does not hide the fact that the cue was requested.
 *
 * Usage:  node tests/e2e-sound.js
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3098;
const BASE_URL = `http://localhost:${PORT}`;
const HEADLESS = true;
const MAX_ITER = 1500;

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['src/server.js'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => {
      if (d.toString().includes(String(PORT)) || d.toString().includes('running')) { resolve(proc); }
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[server err] ${d}`));
    proc.on('error', reject);
    setTimeout(() => resolve(proc), 2500);
  });
}

const log = (msg) => console.log(`  ${msg}`);
const assert = (cond, msg) => { if (!cond) { throw new Error(`ASSERT FAILED: ${msg}`); } log(`✅ ${msg}`); };

async function count(page, sel) { try { return await page.locator(sel).count(); } catch { return 0; } }
async function tryClick(page, sel) {
  try { const el = page.locator(sel).first(); if (await el.isVisible({ timeout: 80 })) { await el.click({ timeout: 2000 }); return true; } } catch {}
  return false;
}
async function forceClick(page, sel) {
  try { await page.locator(sel).first().click({ force: true, timeout: 1000 }); return true; } catch { return false; }
}
async function isVisible(page, sel) {
  try { return await page.locator(sel).first().isVisible({ timeout: 80 }); } catch { return false; }
}

// Mirror of the e2e-live-bots host policy: always pass the auction, otherwise advance.
async function hostAction(page) {
  if (await tryClick(page, '.final-results__back-btn')) { return 'final-back'; }
  if (await tryClick(page, '.round-summary__back-btn')) { return 'summary-back'; }
  if (await tryClick(page, '.round-summary__continue-btn:not(:disabled)')) { return 'continue'; }
  if (await tryClick(page, 'button[data-action="declare"]')) { return 'marriage'; }
  if (await count(page, 'button[data-action="play"]') > 0) { await forceClick(page, 'button[data-action="play"]'); return 'no-marriage'; }
  if (await count(page, '.status-bar__exchange-passes') > 0) {
    if (await count(page, '.card-exchange__dest-btn') > 0) { await forceClick(page, '.card-exchange__dest-btn'); return 'exchange'; }
    if (await count(page, '.hand-view__card[data-card-id]:not(.card--disabled)') > 0) { await forceClick(page, '.hand-view__card[data-card-id]:not(.card--disabled)'); return 'exchange-sel'; }
    return 'exchange-wait';
  }
  if (await count(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
    await forceClick(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)'); return 'play';
  }
  if (await tryClick(page, '.declarer-controls__start:not(:disabled)')) { return 'start'; }
  if (await tryClick(page, '.sell-bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) { return 'sell-pass'; }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) { return 'bid-pass'; }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__bid:not(:disabled)')) { return 'bid-take'; }
  return null;
}

async function main() {
  let server; let browser; const errors = [];
  try {
    log(`starting server on ${PORT}…`);
    server = await startServer();
    browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS,
      args: ['--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));

    // Intercept play() before any app code runs; record requested srcs.
    await page.addInitScript(() => {
      window.__plays = [];
      const proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
      if (proto) {
        const orig = proto.play;
        proto.play = function patchedPlay() {
          try { window.__plays.push(this.currentSrc || this.src || ''); } catch {}
          try { return orig.apply(this, arguments); } catch { return Promise.resolve(); }
        };
      }
    });

    await page.goto(BASE_URL);
    await page.fill('#nickname-input', 'Kashka');
    await page.click('#nickname-form button[type="submit"]');
    await page.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
    await page.click('#new-game-btn');
    await page.waitForSelector('#new-game-modal:not(.hidden)', { timeout: 3000 });
    await page.click('#new-game-form button[type="submit"]');
    await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 8000 });
    for (let i = 1; i <= 2; i++) {
      await page.waitForSelector('#add-bot-btn:not(.hidden)', { timeout: 8000 });
      await page.click('#add-bot-btn');
      await page.waitForTimeout(900);
    }
    log('table seated: 1 human + 2 bots; deal incoming…');

    // Drive a few rounds of play so cards are dealt and played.
    let iter = 0; let sawMuteCheck = false; let mutedPlaysBaseline = 0;
    while (iter < MAX_ITER) {
      iter++;
      // SC-001: once the deal has happened, a card cue must have fired.
      if (!sawMuteCheck && iter > 30) {
        const plays = await page.evaluate(() => window.__plays.slice());
        if (plays.length > 0) {
          assert(plays.some((s) => /playing-card\.mp3/.test(s)), 'SC-001 card cue (playing-card.mp3) fired during the deal');

          // SC-003 + SC-004: toggle mute, verify aria-pressed + localStorage.
          assert(await count(page, '.mute-btn') > 0, 'mute button is present next to the rules icon');
          await page.locator('.mute-btn').first().click({ force: true });
          const pressed = await page.locator('.mute-btn').first().getAttribute('aria-pressed');
          assert(pressed === 'true', 'SC-003 .mute-btn aria-pressed flips to "true" after click');
          const stored = await page.evaluate(() => window.localStorage.getItem('thousand_muted'));
          assert(stored === 'true', 'SC-004 localStorage["thousand_muted"] === "true" after mute');

          mutedPlaysBaseline = (await page.evaluate(() => window.__plays.length));
          sawMuteCheck = true;
        }
      }

      const inLobby = await isVisible(page, '#lobby-screen:not(.hidden)');
      const inGame = await isVisible(page, '#game-screen:not(.hidden)');
      if (inLobby && !inGame) { break; }
      // Stop once we have proven the muted-silence invariant over enough events.
      if (sawMuteCheck && iter > 120) { break; }

      const action = await hostAction(page);
      if (!action) { await page.waitForTimeout(120); }
    }

    // SC-002: after muting, no new play() should have been recorded despite ongoing play.
    if (sawMuteCheck) {
      const after = await page.evaluate(() => window.__plays.length);
      assert(after === mutedPlaysBaseline, `SC-002 no cue played while muted (plays stayed at ${mutedPlaysBaseline}, now ${after})`);
    } else {
      throw new Error('never reached the in-round mute check — deal did not produce audio');
    }

    assert(errors.length === 0, `no page errors (saw ${errors.length}: ${errors.join('; ')})`);
    console.log('\n✅ ALL SOUND-EFFECT SUCCESS CRITERIA VERIFIED IN A REAL BROWSER\n');
  } finally {
    if (browser) { await browser.close().catch(() => {}); }
    if (server) { server.kill('SIGKILL'); }
  }
}

main().catch((e) => { console.error('\n❌', e.message, '\n'); process.exit(1); });
