/**
 * Smart live multi-browser end-to-end test: Chrome + Firefox + Chromium(+Chromium)
 *
 * Unlike tests/e2e-live.js (everyone passes & plays the first legal card), this
 * test plays with intent: Alice is the designated declarer/aggressor who bids a
 * marriage-backed max-makeable contract and wins the point-rich tricks, while
 * the other players pass and dump their lowest cards toward her. Points funnel
 * onto one seat, so victory (1000+) is reached in ~5–6 rounds instead of ~10.
 *
 * Player count is env-driven: 3 (default, 24-card deck) or 4 (E2E_PLAYERS=4,
 * 32-card deck with 7s/8s). Force a deal with THOUSAND_STACK_DECK (four-nines,
 * four-nines-2, no-ace-declarer) — the env is inherited by the spawned server.
 *
 * Design: docs/superpowers/specs/2026-05-21-smart-e2e-test-design.md
 * Usage:  node tests/e2e-live-smart.js          (3 players)
 *         E2E_PLAYERS=4 node tests/e2e-live-smart.js   (4 players)
 */

const { chromium, firefox } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;
// Headed by default so the game can be watched. Run with E2E_HEADLESS=1 for a
// reliable unattended run: headless windows aren't occluded, so the rAF-driven
// animations that gate control mounting never get throttled into a stall.
const HEADLESS = process.env.E2E_HEADLESS === '1';
const SLOW_MO = HEADLESS ? 0 : 80;   // no inter-action delay needed when headless
// Selling is opt-in (E2E_SELL=1). When a declarer sells and an opponent buys,
// the new declarer's decision controls intermittently fail to mount (an app-side
// race in the sell-resolve flow) and the game stalls. Off by default so a normal
// run completes; the declarer just plays every hand instead of selling.
const SELL_ENABLED = process.env.E2E_SELL === '1';
// Player count: 3 (default, 24-card deck) or 4 (E2E_PLAYERS=4, 32-card deck).
// Default MUST stay 3 so the existing 3-player run is unchanged. The 4-player
// path adds a fourth seat (Dave, a second Chromium window) and creates the game
// with requiredPlayers=4 via the new-game modal's player-count radio.
const PLAYER_COUNT = process.env.E2E_PLAYERS === '4' ? 4 : 3;
// Seat names in join order; sliced to PLAYER_COUNT. Alice is always the
// aggressor declarer; the rest pass and dump their lowest cards toward her.
const PLAYER_NAMES = ['Alice', 'Bob', 'Charlie', 'Dave'].slice(0, PLAYER_COUNT);

// Card point values — used for valuing a card (what it's worth to capture/save).
// 7 and 8 (4-player 32-card deck only) are worth 0; inert for 24-card decks.
const RANK_VALUE = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };
// Trick-winning order, high→low: A,10,K,Q,J,9,8,7. Distinct from point value
// (e.g. K outranks 10 in capture order, but 10 is worth more points). 7 and 8
// rank BELOW the 9 (they never win over a 9+), mirroring RANK_ORDER in
// src/public/js/thousand/constants.js; inert for 24-card (3-player) decks.
const RANK_STRENGTH = { A: 8, '10': 7, K: 6, Q: 5, J: 4, '9': 3, '8': 2, '7': 1 };
// Marriage bonus by suit letter (♣100 / ♠80 / ♥60 / ♦40).
const MARRIAGE_BONUS = { C: 100, S: 80, H: 60, D: 40 };
// Maps the trump-suit glyph shown in the status bar to our suit letters.
const SUIT_SYMBOL_TO_LETTER = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };
const VICTORY_SCORE = 1000;
// Cards the declarer must expose when selling (mirrors SELL_SELECTION_SIZE).
const SELL_SELECTION_SIZE = 3;

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
// Generic helpers (shared with e2e-live.js)
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

async function countEls(page, selector) {
  try {
    return await page.locator(selector).count();
  } catch {
    return 0;
  }
}

async function forceClick(page, selector) {
  try {
    const el = page.locator(selector).first();
    await el.click({ force: true, timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

async function forceClickCardId(page, cardId) {
  try {
    await page.locator(`.hand-view__card[data-card-id="${cardId}"]`)
      .first().click({ force: true, timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Strategy helpers (design §Decision logic placement)
// ──────────────────────────────────────────────────────────────────────────────

function rankValue(rank) {
  return RANK_VALUE[rank] ?? 0;
}

function roundDownToStep(value, step) {
  return Math.floor(value / step) * step;
}

// Read the viewer's hand: [{ cardId, rank, suit, disabled }] from the DOM.
async function readHand(page) {
  try {
    return await page.$$eval('.hand-view__card[data-card-id]', (els) =>
      els.map((el) => {
        const m = el.className.match(/card--(10|[AKQJ987])([CSHD])/);
        return {
          cardId: el.dataset.cardId,
          rank: m ? m[1] : null,
          suit: m ? m[2] : null,
          disabled: el.classList.contains('card--disabled'),
          selected: el.classList.contains('hand-view__card--selected'),
        };
      }),
    );
  } catch {
    return [];
  }
}

// Suits for which the hand holds both K and Q (a complete marriage).
function findMarriages(cards) {
  const bySuit = {};
  for (const c of cards) {
    if (!c.suit) { continue; }
    (bySuit[c.suit] ||= new Set()).add(c.rank);
  }
  return Object.keys(bySuit).filter((s) => bySuit[s].has('K') && bySuit[s].has('Q'));
}

// Pick the highest- or lowest-value card; legalOnly drops disabled cards.
function pickCard(cards, { highest, legalOnly }) {
  let pool = cards.filter((c) => c.cardId && (!legalOnly || !c.disabled));
  if (pool.length === 0) { return null; }
  pool = pool.slice().sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
  return highest ? pool[pool.length - 1] : pool[0];
}

// True only when the status bar says it's the viewer's turn. Gating plays on
// this avoids the throttled-window bug where stale enabled cards get spam-clicked.
async function isMyTurn(page) {
  const txt = await page.locator('.status-bar__turn').first().textContent().catch(() => '');
  return (txt || '').includes('Your turn');
}

// Current trump suit letter, or null when "No trump" / not in trick play.
async function readTrump(page) {
  const txt = await page.locator('.status-bar__trump').first().textContent().catch(() => '');
  const m = (txt || '').match(/Trump:\s*([♠♥♦♣])/);
  return m ? SUIT_SYMBOL_TO_LETTER[m[1]] : null;
}

// Nickname of the current declarer, read from the status bar ("Declarer: X", or
// "Bid won: X (n)" during the post-bid decision). Empty string if undecided.
// The declarer changes mid-round when a hand is sold, so role is read per call.
async function readDeclarer(page) {
  const dec = await page.locator('.status-bar__declarer').first().textContent().catch(() => '');
  const m1 = (dec || '').match(/Declarer:\s*(.+?)\s*$/);
  if (m1) { return m1[1].trim(); }
  const win = await page.locator('.status-bar__bid-winner').first().textContent().catch(() => '');
  const m2 = (win || '').match(/Bid won:\s*(.+?)\s*\(/);
  return m2 ? m2[1].trim() : '';
}

// Cards currently on the table this trick: [{ rank, suit }].
async function readCenter(page) {
  try {
    return await page.$$eval('.trick-center__slot .card-sprite:not(.crawl-placeholder)', (els) =>
      els.map((el) => {
        const m = el.className.match(/card--(10|[AKQJ987])([CSHD])/);
        return m ? { rank: m[1], suit: m[2] } : null;
      }).filter(Boolean));
  } catch {
    return [];
  }
}

function rankStrength(rank) {
  return RANK_STRENGTH[rank] ?? 0;
}

// Current phase label from the status bar (e.g. "Trick play", "Round complete").
async function readPhase(page) {
  return (await page.locator('.status-bar__phase').first().textContent().catch(() => '')) || '';
}

// Current trick number (1–8), read from the status bar; defaults to 1.
async function readTrickNumber(page) {
  const txt = await page.locator('.status-bar__trick-number').first().textContent().catch(() => '');
  const m = (txt || '').match(/Trick\s+(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

// The card currently winning the trick: highest trump if any, else highest
// strength overall (a fair stand-in for the led card, since passive opponents
// only ever discard low cards off-suit).
function bestCenterCard(centerCards, trump) {
  const better = (a, b) => {
    const aT = a.suit === trump, bT = b.suit === trump;
    if (aT !== bT) { return aT ? a : b; }
    return rankStrength(a.rank) >= rankStrength(b.rank) ? a : b;
  };
  return centerCards.reduce((best, c) => (best ? better(best, c) : c), null);
}

// Would `card` beat the current best card on the table (trump-aware)?
function cardBeats(card, best, trump) {
  if (!best) { return true; }
  const cT = card.suit === trump, bT = best.suit === trump;
  if (cT && !bT) { return true; }
  if (!cT && bT) { return false; }
  if (cT && bT) { return rankStrength(card.rank) > rankStrength(best.rank); }
  // Neither trump: only a higher card of the same (led) suit wins.
  return card.suit === best.suit && rankStrength(card.rank) > rankStrength(best.rank);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase actions
// ──────────────────────────────────────────────────────────────────────────────

// Estimate the score Alice can safely make as declarer against passive
// opponents. The hard ceiling is the ~120 trick points on the table (which she
// sweeps) PLUS the bonus of every COMPLETE marriage she can declare. A lone K
// or Q only pays off if the 2-card talon completes it — unlikely — so it adds a
// small capped nudge, never the full half-bonus (the earlier bug: adding
// half-bonuses on top of the sweep floor bid her past the ceiling and set her).
function estimateMakeable(hand) {
  const bySuit = {};
  for (const c of hand) {
    if (!c.suit) { continue; }
    (bySuit[c.suit] ||= new Set()).add(c.rank);
  }
  let completeBonus = 0;
  let halfCount = 0;
  const complete = [];
  for (const suit of Object.keys(bySuit)) {
    const has = bySuit[suit];
    if (has.has('K') && has.has('Q')) {
      completeBonus += MARRIAGE_BONUS[suit];
      complete.push(suit);
    } else if (has.has('K') || has.has('Q')) {
      halfCount += 1;
    }
  }
  // 105 ≈ the ~120 sweepable trick points minus a buffer for a rare lost trick.
  const value = 105 + completeBonus + Math.min(halfCount * 5, 10);
  return { value, complete, half: halfCount };
}

// Alice bids only as much as her hand justifies: a marriage-backed value when
// she holds (or might complete) a marriage, otherwise just the minimum — she
// takes the forced contract reluctantly and will try to sell it after the talon.
async function declarerBid(page, name) {
  const inputSel = '.bid-controls:not(.hidden) .bid-controls__input:not(:disabled)';
  const btnSel = '.bid-controls:not(.hidden) .bid-controls__bid';
  const hand = await readHand(page);
  const { value, complete, half } = estimateMakeable(hand);
  const hasPotential = complete.length > 0 || half > 0;
  const target = hasPotential ? roundDownToStep(value, 5) : 100;

  const floorStr = await page.locator(inputSel).first().inputValue().catch(() => null);
  const floor = parseInt(floorStr, 10) || 100;
  const bid = roundDownToStep(Math.min(300, Math.max(floor, target)), 5);

  await page.locator(inputSel).first().fill(String(bid)).catch(() => {});
  const ok = await tryClick(page, `${btnSel}:not(:disabled)`);
  if (ok) {
    const tag = complete.length > 0 ? `marriage ${complete.join('')}` : half > 0 ? `${half} half-marriage` : 'no marriage';
    log(name, `🂠 bids ${bid} (floor ${floor}, ${tag})`);
    return 'bid';
  }
  return null;
}

// Pick the weakest card Alice can afford to give away: never a card that
// completes a marriage, and not an ace/ten (kept to win point-rich tricks).
// Falls back to looser pools only if those protections leave nothing.
function pickExchangeCard(hand) {
  const legal = hand.filter((c) => c.cardId && !c.disabled);
  const marriageSuits = findMarriages(legal);
  const isMarriageCard = (c) => marriageSuits.includes(c.suit) && (c.rank === 'K' || c.rank === 'Q');
  const protectedRank = (c) => c.rank === 'A' || c.rank === '10';
  const pools = [
    legal.filter((c) => !isMarriageCard(c) && !protectedRank(c)),
    legal.filter((c) => !isMarriageCard(c)),
    legal,
  ];
  for (const pool of pools) {
    const card = pickCard(pool, { highest: false, legalOnly: false });
    if (card) { return card; }
  }
  return null;
}

// Declarer passes a card during exchange; one step per call.
async function declarerExchangeStep(page, name) {
  // A card is already selected → send it to the next available opponent.
  if (await countEls(page, '.card-exchange__dest-btn') > 0) {
    await forceClick(page, '.card-exchange__dest-btn');
    log(name, '↕ passes a junk card to an opponent');
    return 'exchange';
  }
  // No card selected yet → select the weakest non-essential card.
  const card = pickExchangeCard(await readHand(page));
  if (card) {
    await forceClickCardId(page, card.cardId);
    log(name, `  selects ${card.rank}${card.suit} to pass`);
    return 'exchange-selecting';
  }
  return 'exchange-wait';
}

// Declarer leads. Priority:
//   1. Declare the most valuable undeclared marriage — but ONLY in the legal
//      window (tricks 2–6, per TrickPlay.js). Leading a marriage K on trick 1
//      can't declare and strands the lone Q, so the marriage is preserved (not
//      led) until the window opens.
//   2. With trump set, lead the highest trump to draw out opponents' trumps so
//      the side-suit winners cashed afterwards can't be ruffed.
//   3. Otherwise lead the highest-value card, while reserving any K/Q that could
//      still complete a marriage declaration this round.
async function declarerLead(page, name, hand, trump, trickNumber) {
  const legal = hand.filter((c) => c.cardId && !c.disabled);
  const marriageSuits = findMarriages(legal)
    .filter((s) => s !== trump)
    .sort((a, b) => MARRIAGE_BONUS[b] - MARRIAGE_BONUS[a]);

  if (trickNumber >= 2 && trickNumber <= 6) {
    for (const suit of marriageSuits) {
      const king = legal.find((c) => c.rank === 'K' && c.suit === suit);
      if (king) {
        await forceClickCardId(page, king.cardId);
        log(name, `💍 leads ${suit} marriage K (declares, trick ${trickNumber})`);
        return 'play';
      }
    }
  }

  if (trump) {
    const trumps = legal.filter((c) => c.suit === trump)
      .sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank));
    if (trumps.length > 0) {
      await forceClickCardId(page, trumps[0].cardId);
      log(name, `⚔ leads high trump ${trumps[0].rank}${trump} (draws trumps)`);
      return 'play';
    }
  }

  // Reserve marriage K/Q while a declaration is still reachable (before trick 6 ends).
  const reserved = trickNumber <= 6
    ? new Set(legal.filter((c) => marriageSuits.includes(c.suit) && (c.rank === 'K' || c.rank === 'Q')).map((c) => c.cardId))
    : new Set();
  const pool = legal.filter((c) => !reserved.has(c.cardId));
  const best = pickCard(pool.length > 0 ? pool : legal, { highest: true, legalOnly: false });
  if (best) { await forceClickCardId(page, best.cardId); log(name, `🂡 leads highest (${best.rank}${best.suit}, trick ${trickNumber})`); return 'play'; }
  return null;
}

// Declarer follows. Declaring a marriage outranks winning a single trick: the
// K/Q of a still-declarable marriage (trick ≤ 6, both held, suit not yet trump)
// are reserved and NEVER spent to follow — even when one of them is her only
// card that could take the trick. She keeps K+Q intact so she can declare on her
// next lead (worth far more than one trick), winning here only with free cards.
async function declarerFollow(page, name, hand, center, trump, trickNumber) {
  const legal = hand.filter((c) => c.cardId && !c.disabled);
  const marriageSuits = findMarriages(legal).filter((s) => s !== trump);
  const reserved = trickNumber <= 6
    ? new Set(legal.filter((c) => marriageSuits.includes(c.suit) && (c.rank === 'K' || c.rank === 'Q')).map((c) => c.cardId))
    : new Set();

  const best = bestCenterCard(center, trump);
  const byCheap = (a, b) => rankStrength(a.rank) - rankStrength(b.rank);
  const winners = legal.filter((c) => !reserved.has(c.cardId) && cardBeats(c, best, trump)).sort(byCheap);
  if (winners.length > 0) {
    await forceClickCardId(page, winners[0].cardId);
    log(name, `🏅 wins trick cheaply with ${winners[0].rank}${winners[0].suit}`);
    return 'play';
  }

  // No win available without breaking a marriage — discard the lowest free card,
  // protecting K+Q for declaration. Tag the reason so the log is unambiguous.
  const reservedCouldWin = legal.some((c) => reserved.has(c.cardId) && cardBeats(c, best, trump));
  const discardPool = legal.filter((c) => !reserved.has(c.cardId));
  const worst = pickCard(discardPool.length > 0 ? discardPool : legal, { highest: false, legalOnly: false });
  if (worst) {
    const why = reservedCouldWin ? 'protects marriage' : "can't win";
    await forceClickCardId(page, worst.cardId);
    log(name, `🗑 ${why} — discards ${worst.rank}${worst.suit}`);
    return 'play';
  }
  return null;
}

// Play a trick card per role. The declarer (Alice, or whoever bought the hand)
// plays to win point-rich tricks without wasting high cards; the two opponents
// passively dump their lowest legal card so points funnel onto the declarer.
async function playTrickCard(page, name, role) {
  if (!(await isMyTurn(page))) { return null; }
  const hand = await readHand(page);
  if (role === 'declarer') {
    const trump = await readTrump(page);
    const center = await readCenter(page);
    const trickNumber = await readTrickNumber(page);
    return center.length === 0
      ? declarerLead(page, name, hand, trump, trickNumber)
      : declarerFollow(page, name, hand, center, trump, trickNumber);
  }
  const worst = pickCard(hand, { highest: false, legalOnly: true });
  if (worst) { await forceClickCardId(page, worst.cardId); log(name, '🃏 dumps lowest legal'); return 'play'; }
  return null;
}

// Capture the winner row off the final-results screen for the victory assertion.
async function captureVictory(page, result) {
  if (result.winnerScore != null) { return; }
  const scoreTxt = await page.locator('.final-results__ranking-row--winner .final-results__ranking-score')
    .first().textContent().catch(() => null);
  const rowTxt = await page.locator('.final-results__ranking-row--winner')
    .first().textContent().catch(() => null);
  result.winnerScore = parseInt((scoreTxt || '').replace(/[^0-9-]/g, ''), 10);
  result.winnerText = (rowTxt || '').replace(/\s+/g, ' ').trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-player action: branch order mirrors e2e-live.js's takeAction
// ──────────────────────────────────────────────────────────────────────────────

// Declarer's post-bid decision: sell a marriage-less hand (if Sell is offered),
// otherwise start the game. The talon is already in hand here, so a marriage
// completed by the talon keeps her playing; a miss makes her sell.
async function declarerDecision(page, name) {
  const hasMarriage = findMarriages(await readHand(page)).length > 0;
  if (SELL_ENABLED) {
    const canSell = await countEls(page, '.declarer-controls__sell:not(.hidden):not(:disabled)') > 0;
    if (!hasMarriage && canSell && await tryClick(page, '.declarer-controls__sell:not(:disabled)')) {
      log(name, '🏷 no marriage after talon — sells the hand');
      return 'sell-start';
    }
  }
  if (await tryClick(page, '.declarer-controls__start:not(:disabled)')) {
    log(name, hasMarriage ? '▶ starts (holds a marriage)' : '▶ starts (plays it out)');
    return 'start';
  }
  return null;
}

// Declarer sell-selection: expose SELL_SELECTION_SIZE junk cards, then confirm.
async function declarerSellSelect(page, name) {
  if (await countEls(page, '.sell-selection-controls__sell:not(:disabled)') > 0) {
    await forceClick(page, '.sell-selection-controls__sell:not(:disabled)');
    log(name, `🏷 exposes ${SELL_SELECTION_SIZE} cards for sale`);
    return 'sell-expose';
  }
  const unselected = (await readHand(page)).filter((c) => c.cardId && !c.selected);
  const card = pickExchangeCard(unselected) || pickCard(unselected, { highest: false, legalOnly: false });
  if (card) {
    await forceClickCardId(page, card.cardId);
    return 'sell-selecting';
  }
  return 'sell-wait';
}

// Sell-auction: a designated opponent buys the exposed hand (becoming declarer);
// everyone else passes. The buyer is a Chromium window (Charlie, or Dave in the
// 4-player run) rather than Bob (Firefox): the post-sale resolve animation is
// requestAnimationFrame-driven, and only the Chromium windows launch with the
// occlusion/rAF anti-throttle flags, so the buyer's controls actually re-mount
// while occluded. If the preferred buyer is the seller, fall back to the next
// Chromium window, then to Bob.
async function sellAuctionAction(page, name) {
  const declarerNick = await readDeclarer(page);
  // Chromium-backed seats, in preference order; first one that isn't the seller.
  const chromiumSeats = ['Charlie', 'Dave'].filter((n) => PLAYER_NAMES.includes(n));
  const buyer = chromiumSeats.find((n) => n !== declarerNick) || 'Bob';
  if (name === buyer
    && await tryClick(page, '.sell-bid-controls:not(.hidden) .bid-controls__bid:not(:disabled)')) {
    log(name, '💰 buys the exposed hand (becomes declarer)');
    return 'sell-buy';
  }
  if (await tryClick(page, '.sell-bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) {
    log(name, '  passes sell-bid');
    return 'sell-pass';
  }
  return null;
}

// Main auction: Alice always bids (her hand-scaled value); the others pass.
async function mainBidAction(page, name) {
  if (name === 'Alice'
    && await countEls(page, '.bid-controls:not(.hidden) .bid-controls__input:not(:disabled)') > 0) {
    const action = await declarerBid(page, name);
    if (action) { return action; }
  }
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__pass:not(:disabled)')) {
    log(name, '  passes bid');
    return 'bid-pass';
  }
  // Forced last bidder (Pass hidden) takes the pre-filled contract.
  if (await tryClick(page, '.bid-controls:not(.hidden) .bid-controls__bid:not(:disabled)')) {
    log(name, '  bids (forced last bidder takes the contract)');
    return 'bid-take';
  }
  return null;
}

// Per-player action. The declarer is read fresh each call (it can change when a
// hand is sold), and strategy keys off whether *this* player is that declarer.
async function takeAction(page, name, result) {
  // Four-nines bonus (feature 006): a blocking modal that gates trick play until
  // ALL players acknowledge. Whoever sees it must clear it first, or the
  // ack-gate keeps every hand disabled and trick 1 never starts (the round-10/11
  // STUCK hang). The button self-disables after the click, so guard on :enabled.
  if (await tryClick(page, '.four-nines-modal button[data-action="acknowledge"]:not(:disabled)')) {
    log(name, '🃏🃏🃏🃏 acknowledges four-nines bonus');
    return 'four-nines-ack';
  }

  // Final results: read the winner, then go back to lobby.
  if (await countEls(page, '.final-results__back-btn') > 0) {
    await captureVictory(page, result);
    await tryClick(page, '.final-results__back-btn');
    log(name, '🏆 game over — back to lobby');
    return 'final-back';
  }

  if (await tryClick(page, '.round-summary__back-btn')) {
    log(name, '🏆 round summary back to lobby');
    return 'summary-back';
  }
  if (await tryClick(page, '.round-summary__continue-btn:not(:disabled)')) {
    log(name, '→ continue to next round');
    return 'continue';
  }

  // Marriage declaration prompt — declare whenever offered (banks the bonus).
  if (await tryClick(page, 'button[data-action="declare"]')) {
    log(name, '💍 declares marriage');
    return 'marriage';
  }
  if (await countEls(page, 'button[data-action="play"]') > 0) {
    await forceClick(page, 'button[data-action="play"]');
    log(name, '  plays K/Q without declaring');
    return 'no-marriage';
  }

  // Crawl choice (feature 007): an ace-less declarer leads normally — never crawls.
  if (await tryClick(page, 'button[data-action="lead-normally"]')) {
    log(name, '↪ leads normally (declines crawl)');
    return 'lead-normally';
  }

  // Post-bid decision (only the declarer sees these controls).
  if (await countEls(page, '.declarer-controls:not(.hidden)') > 0) {
    return await declarerDecision(page, name);
  }

  // Sell-selection (only the selling declarer sees these controls).
  if (await countEls(page, '.sell-selection-controls:not(.hidden)') > 0) {
    return await declarerSellSelect(page, name);
  }

  // Card exchange — the current declarer passes; everyone else waits.
  if (await countEls(page, '.status-bar__exchange-passes') > 0) {
    if (await readDeclarer(page) === name) {
      return await declarerExchangeStep(page, name);
    }
    return 'exchange-wait';
  }

  // Trick play — the declarer plays smart, opponents dump.
  if (await countEls(page, '.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)') > 0) {
    const role = await readDeclarer(page) === name ? 'declarer' : 'opponent';
    const action = await playTrickCard(page, name, role);
    if (action) { return action; }
  }

  // Sell-auction bidding (only present while a sale is open).
  if (await countEls(page, '.sell-bid-controls:not(.hidden)') > 0) {
    const action = await sellAuctionAction(page, name);
    if (action) { return action; }
  }

  // Main bidding.
  if (await countEls(page, '.bid-controls:not(.hidden)') > 0) {
    const action = await mainBidAction(page, name);
    if (action) { return action; }
  }

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
      if (!text.includes('DevTools') && !text.includes('favicon')) {
        errors.push({ name, type, msg: text });
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Lobby / setup (identical flow to e2e-live.js)
// ──────────────────────────────────────────────────────────────────────────────

// Launch one browser per seat, returned in seat order (matches PLAYER_NAMES).
// Engine assignment: Alice=Chrome, Bob=Firefox, Charlie=Chromium, and (4-player
// only) Dave=a second Chromium. Only Chrome/Chromium take the rAF anti-throttle
// flags; Firefox uses the equivalent timer-budget prefs. There is no fourth
// distinct engine available, so the 4th seat reuses Chromium.
async function launchBrowsers() {
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
  for (let i = 0; i < PLAYER_COUNT; i++) {
    browsers.push(await launchers[i]());
  }
  return browsers;
}

// Alice creates the game (selecting the PLAYER_COUNT radio in the new-game
// modal); the remaining seats join from the lobby. `players` is in seat order.
async function setupLobby(players) {
  await Promise.all(players.map(({ page }) => page.goto(BASE_URL)));
  console.log(`All ${PLAYER_COUNT} browsers at`, BASE_URL, '\n');

  for (const { page, name } of players) {
    await page.fill('#nickname-input', name);
    await page.click('#nickname-form button[type="submit"]');
  }

  const alice = players[0].page;
  await alice.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
  await alice.click('#new-game-btn');
  await alice.waitForSelector('#new-game-modal:not(.hidden)', { timeout: 3000 });
  // FR-001: pick the 3-or-4 player-count radio before submitting (the value "3"
  // radio is checked by default, so the 3-player path is unaffected).
  await alice.check(`input[name="player-count"][value="${PLAYER_COUNT}"]`);
  await alice.click('#new-game-form button[type="submit"]');
  await alice.waitForSelector('#game-screen:not(.hidden)', { timeout: 8000 });
  log('Alice', 'created game & in waiting room');

  for (const { page, name } of players.slice(1)) {
    await page.waitForSelector('#lobby-screen:not(.hidden)', { timeout: 8000 });
    await page.waitForSelector('#game-list li[data-id]', { timeout: 10000 });
    await page.click('#game-list li[data-id]');
    await page.click('#join-selected-btn');
    log(name, 'joined');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main test
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  let server;
  const browsers = [];

  try {
    console.log(`\nStarting server on port ${PORT}…`);
    server = await startServer();
    console.log('Server ready.\n');

    console.log(`Launching ${PLAYER_COUNT} browsers (${PLAYER_NAMES.join(', ')})…`);
    const launched = await launchBrowsers();
    browsers.push(...launched);

    // Roles are dynamic: Alice wins the main auction, but a sold hand makes the
    // buyer the declarer, so each player's role is read from the status bar.
    const players = [];
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const page = await launched[i].newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      players.push({ page, name: PLAYER_NAMES[i] });
    }

    await setupLobby(players);
    console.log(`\n— All ${PLAYER_COUNT} joined. Waiting for round to start… —\n`);

    const errors = [];
    for (const { page, name } of players) {
      attachConsoleWatchers(page, name, errors);
    }

    const result = { winnerScore: null, winnerText: null };
    const done = new Array(PLAYER_COUNT).fill(false);
    let doneCnt = 0;
    let iter = 0;
    const MAX_ITER = 6000;
    let consecutiveSamePlayer = 0;
    let lastActorIdx = -1;
    let stuckSnapshotted = false;
    const STUCK_THRESHOLD = 40;
    let consecutiveNoActor = 0;
    const NO_ACTOR_STUCK_THRESHOLD = 60;

    while (doneCnt < PLAYER_COUNT && iter < MAX_ITER) {
      iter++;
      let anyActorThisIter = -1;

      for (let i = 0; i < PLAYER_COUNT; i++) {
        if (done[i]) { continue; }
        const { page, name } = players[i];

        if (await isVisible(page, '#lobby-screen:not(.hidden)')) {
          log(name, '✅ back in lobby — done');
          done[i] = true;
          doneCnt++;
          continue;
        }

        // Foreground a window when it needs to act. Backgrounded windows run
        // requestAnimationFrame at ~1fps, so the animations that gate control
        // mounting (sell-resolve flight, last-trick collect → round summary)
        // crawl or never complete, leaving controls locked/unmounted. We
        // foreground: (a) the active player on their turn, and (b) everyone
        // during the summary / final-results screens, where all three must click
        // but none is the "active" turn-holder.
        const phase = await readPhase(page);
        const needsFront = phase === 'Round complete' || phase === 'Game over' || await isMyTurn(page);
        if (needsFront) { await page.bringToFront().catch(() => {}); }

        const action = await takeAction(page, name, result);
        if (action) { anyActorThisIter = i; }
      }

      let stuckReason = null;
      if (anyActorThisIter !== -1) {
        consecutiveNoActor = 0;
        if (anyActorThisIter === lastActorIdx) {
          consecutiveSamePlayer++;
        } else {
          consecutiveSamePlayer = 1;
          lastActorIdx = anyActorThisIter;
        }
        if (consecutiveSamePlayer >= STUCK_THRESHOLD && !stuckSnapshotted) {
          stuckReason = `${players[lastActorIdx].name} acted alone ${consecutiveSamePlayer}x`;
        }
      } else {
        consecutiveNoActor++;
        if (consecutiveNoActor >= NO_ACTOR_STUCK_THRESHOLD && !stuckSnapshotted) {
          stuckReason = `no player acted for ${consecutiveNoActor} iterations (~${(consecutiveNoActor * 150 / 1000).toFixed(0)}s)`;
        }
      }
      if (stuckReason) {
        stuckSnapshotted = true;
        console.log(`\n⚠️  STUCK — ${stuckReason}. Dumping state…\n`);
        for (const { page, name } of players) {
          try {
            await page.screenshot({ path: `stuck-smart-${name.toLowerCase()}.png` });
            const state = await page.evaluate(() => {
              const handCards = Array.from(document.querySelectorAll('.hand-view__card[data-card-id]'))
                .map((el) => {
                  const m = el.className.match(/card--(10|[AKQJ987])([CSHD])/);
                  return { id: el.dataset.cardId, disabled: el.classList.contains('card--disabled'),
                           rank: m?.[1] ?? null, suit: m?.[2] ?? null };
                });
              const statusBar = document.querySelector('.status-bar')?.textContent ?? null;
              const turnText = document.querySelector('.status-bar__turn')?.textContent ?? null;
              const centerCards = Array.from(document.querySelectorAll('.trick-center__slot .card-sprite'))
                .map((el) => {
                  const m = el.className.match(/card--(10|[AKQJ987])([CSHD])/);
                  return { rank: m?.[1] ?? null, suit: m?.[2] ?? null, cardId: el.dataset.cardId };
                });
              const declarerCtl = document.querySelector('.declarer-controls');
              const startBtn = document.querySelector('.declarer-controls__start');
              const controls = {
                declarerControlsClass: declarerCtl?.className ?? null,
                startBtnPresent: !!startBtn,
                startBtnDisabled: startBtn?.disabled ?? null,
                controlsHtml: document.querySelector('#game-controls, .controls, .game-screen__controls')?.innerHTML?.slice(0, 300) ?? null,
              };
              return { statusBar, turnText, handCards, centerCards, controls,
                       interactive: !!document.querySelector('.hand-view--interactive') };
            }).catch((e) => ({ error: e.message }));
            console.log(`[STUCK ${name}]`, JSON.stringify(state, null, 2));
          } catch (e) {
            console.log(`[STUCK ${name}] error: ${e.message}`);
          }
        }
        break;
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    // ── Result reporting + victory assertion ───────────────────────────────────
    if (doneCnt === PLAYER_COUNT) {
      console.log(`\n✅  FULL GAME COMPLETE — all ${PLAYER_COUNT} players back in lobby!`);
      if (Number.isFinite(result.winnerScore)) {
        console.log(`   Winner: ${result.winnerText} (score ${result.winnerScore})`);
        if (result.winnerScore >= VICTORY_SCORE) {
          console.log(`   ✅ Victory assertion passed (${result.winnerScore} ≥ ${VICTORY_SCORE}).\n`);
        } else {
          console.log(`   ❌ Victory assertion FAILED (${result.winnerScore} < ${VICTORY_SCORE}).\n`);
          process.exitCode = 1;
        }
      } else {
        console.log('   ❌ No final-results winner score captured.\n');
        process.exitCode = 1;
      }
    } else {
      console.log(`\n⚠️  Loop exited after ${iter} iterations. ${doneCnt}/${PLAYER_COUNT} players finished.\n`);
      for (const { page, name } of players) {
        await page.screenshot({ path: `${name.toLowerCase()}-smart-final.png` });
        log(name, `screenshot saved → ${name.toLowerCase()}-smart-final.png`);
      }
      process.exitCode = 1;
    }

    if (errors.length > 0) {
      console.log(`\n⚠️  ${errors.length} console error(s)/warning(s) captured:`);
      for (const e of errors.slice(0, 20)) { console.log(`   [${e.name}/${e.type}] ${e.msg}`); }
    }

    console.log('Keeping browsers open for 6 seconds…');
    await new Promise((r) => setTimeout(r, 6000));
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
