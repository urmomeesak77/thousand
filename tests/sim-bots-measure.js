/**
 * Headless bots-only MEASUREMENT harness. Runs full games of 3 server-side bots
 * (no human, no browser) through the real ThousandStore + BotTurnDriver path and
 * reports declarer make-rate + average declarer delta — the metric for "bots don't
 * go negative when they declare" (2026-06-05 bidding-realism work).
 *
 * Usage:  node tests/sim-bots-measure.js [targetRounds]   (default 300)
 */

'use strict';

// Collapse the bot turn timers so games run as fast as the event loop allows.
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, _delay, ...args) => realSetTimeout(fn, 0, ...args);

const ThousandStore = require('../src/services/ThousandStore');
const { VICTORY_THRESHOLD } = require('../src/services/GameRules');

const TARGET_ROUNDS = Number(process.argv[2]) || 300;
const BOT_NAMES = ['Robo-Ada', 'Robo-Max', 'Robo-Vera'];

function seatBots(store, gameId) {
  const players = new Set();
  for (const name of BOT_NAMES) {
    const { playerId } = store._registry.createBot(name);
    store.players.get(playerId).gameId = gameId;
    players.add(playerId);
  }
  store.games.set(gameId, {
    id: gameId, type: 'public', hostId: [...players][0],
    players, requiredPlayers: BOT_NAMES.length, status: 'waiting', inviteCode: null,
    createdAt: Date.now(), round: null, session: null,
  });
}

function playOneGame(store, gameId) {
  return new Promise((resolve) => {
    seatBots(store, gameId);
    store.startRound(gameId);
    const rows = [];
    let sessionRef = null; // held so history stays readable after victory cleanup removes the game
    let lastActivity = Date.now();
    const finish = () => { clearInterval(poll); store._botDriver.clearForGame(gameId); resolve(rows); };
    const poll = setInterval(() => {
      const game = store.games.get(gameId);
      if (game?.session) { sessionRef = game.session; }
      if (sessionRef) {
        while (rows.length < sessionRef.history.length) {
          rows.push(sessionRef.history[rows.length]);
          lastActivity = Date.now();
        }
        if (Math.max(0, ...Object.values(sessionRef.cumulativeScores)) >= VICTORY_THRESHOLD) { return finish(); }
      }
      if (!game && sessionRef) { return finish(); }       // cleaned up at victory
      if (Date.now() - lastActivity > 4000) { return finish(); } // genuine stall guard
    }, 5);
  });
}

async function main() {
  const store = new ThousandStore();
  // With bot turn timers collapsed to 0, a bot's consecutive actions (bid→startGame,
  // exchange passes) arrive inside the 250 ms per-player rate-limiter window and would
  // be silently dropped, deadlocking the round. The limiter is a network-abuse guard
  // irrelevant to measuring bot decisions, so disable it for the simulation only.
  store._botDriver._handler._rateLimiter.isAllowed = () => true;
  const all = [];
  let g = 0;
  while (all.length < TARGET_ROUNDS && g < 200) {
    all.push(...await playOneGame(store, `measure-${g}`));
    g++;
  }

  const decl = all.filter((r) => r.bid != null && r.declarerSeat != null);
  // Contract made ⇔ the declarer's captured round score reached the bid (penalty-independent).
  const roundTotal = (r) => r.perPlayer[r.declarerSeat].roundTotal;
  const made = decl.filter((r) => roundTotal(r) >= r.bid).length;
  const deltas = decl.map((r) => r.perPlayer[r.declarerSeat].delta);
  const negs = deltas.filter((d) => d < 0);
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const n = decl.length || 1;

  console.log('\n════ BOT DECLARER MEASUREMENT ════');
  console.log(`games played       : ${g}`);
  console.log(`declarer rounds    : ${decl.length}`);
  console.log(`made / missed      : ${made} / ${decl.length - made}`);
  console.log(`MAKE RATE          : ${(100 * made / n).toFixed(1)}%`);
  console.log(`avg declarer delta : ${(sum(deltas) / n).toFixed(1)}`);
  console.log(`avg winning bid    : ${(sum(decl.map((r) => r.bid)) / n).toFixed(1)}`);
  console.log(`negative rounds    : ${negs.length} (avg ${(sum(negs) / (negs.length || 1)).toFixed(0)})`);
  const buckets = { '100': 0, '105-115': 0, '120-145': 0, '150-195': 0, '200+': 0 };
  for (const r of decl) {
    if (r.bid <= 100) { buckets['100']++; }
    else if (r.bid <= 115) { buckets['105-115']++; }
    else if (r.bid <= 145) { buckets['120-145']++; }
    else if (r.bid <= 195) { buckets['150-195']++; }
    else { buckets['200+']++; }
  }
  console.log('bid distribution   :', Object.entries(buckets).map(([k, v]) => `${k}=${(100 * v / n).toFixed(0)}%`).join('  '));
  console.log('══════════════════════════════════\n');
  process.exit(0);
}

main();
