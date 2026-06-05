/**
 * Bots-only foreground simulation: THREE server-side bots play a full game of
 * Thousand to a 1000-point victory with NO human and NO browser. Runs the real
 * ThousandStore + BotTurnDriver + RoundActionHandler — the exact server path a live
 * game uses — so it exercises feature 010 (card memory) end-to-end.
 *
 * The bot turn timers (normally 1–3 s) are clamped to a watchable pace so the whole
 * game streams to the console in a couple of minutes.
 *
 * Usage:  node tests/sim-bots-only.js
 */

'use strict';

// ── Clamp the bot turn delay so the game plays at a readable pace (must be set
//    before the store/driver schedule any timers). ────────────────────────────
const ACTION_MS = 180;
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, delay, ...args) => realSetTimeout(fn, Math.min(delay || 0, ACTION_MS), ...args);

const ThousandStore = require('../src/services/ThousandStore');
const { VICTORY_THRESHOLD } = require('../src/services/GameRules');

const BOT_NAMES = ['Robo-Ada', 'Robo-Max', 'Robo-Vera', 'Robo-Lev'];

function ts() { return new Date().toISOString().slice(11, 19); }
function line(who, msg) { console.log(`[${ts()}] ${String(who).padEnd(9)}: ${msg}`); }

function cardName(round, cardId) {
  const c = round && round.deck && round.deck[cardId];
  return c ? `${c.rank}${c.suit}` : `#${cardId}`;
}

// Render one bot decision for the transcript.
function describe(decision, round) {
  switch (decision.kind) {
    case 'bid': return `bids ${decision.amount}`;
    case 'pass': return 'passes';
    case 'startGame': return 'takes the contract, starts the game';
    case 'sellPass': return 'passes (sell)';
    case 'exchangePass': return `exchanges ${cardName(round, decision.cardId)} → seat ${decision.toSeat}`;
    case 'playCard': return `plays ${cardName(round, decision.cardId)}${decision.declareMarriage ? '  💍 + declares marriage' : ''}`;
    case 'crawlCommit': return `crawls ${cardName(round, decision.cardId)}`;
    case 'acknowledgeFourNines': return 'acknowledges four-nines';
    case 'continueToNextRound': return 'continues to next round';
    default: return decision.kind;
  }
}

function seatBots(store, count) {
  const gameId = 'sim-bots';
  const players = new Set();
  const skills = [];
  for (let i = 0; i < count; i++) {
    const { playerId } = store._registry.createBot(BOT_NAMES[i]);
    const bot = store.players.get(playerId);
    bot.gameId = gameId;
    players.add(playerId);
    skills.push({ name: bot.nickname, skill: bot.memorySkill, aggr: bot.aggressiveness });
  }
  store.games.set(gameId, {
    id: gameId, type: 'public', hostId: [...players][0],
    players, requiredPlayers: count, status: 'waiting', inviteCode: null,
    createdAt: Date.now(), round: null, session: null,
  });
  return { gameId, skills };
}

function main() {
  const store = new ThousandStore();
  const { gameId, skills } = seatBots(store, 3);

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  BOTS-ONLY GAME — 3 server-side bots, no human, no browser');
  console.log('════════════════════════════════════════════════════════════');
  for (const s of skills) {
    console.log(`  ${s.name.padEnd(9)} | memorySkill ${s.skill.toFixed(2)} | aggressiveness ${s.aggr.toFixed(2)}`);
  }
  console.log('════════════════════════════════════════════════════════════\n');

  // Wrap the driver's executor so every bot action is logged before it is applied.
  const driver = store._botDriver;
  const origExec = driver._execute.bind(driver);
  driver._execute = (botId, decision) => {
    const bot = store.players.get(botId);
    const game = store.games.get(bot && bot.gameId);
    line(bot ? bot.nickname : botId, describe(decision, game && game.round));
    return origExec(botId, decision);
  };

  store.startRound(gameId);

  // Poll the session: log each completed round + scores, and stop at victory.
  let lastRounds = 0;
  let lastActivity = Date.now();
  const startedAt = Date.now();
  const poll = setInterval(() => {
    const game = store.games.get(gameId);
    const session = game && game.session;
    if (!session) { return; }

    if (session.history.length > lastRounds) {
      lastActivity = Date.now();
      for (let h = lastRounds; h < session.history.length; h++) {
        const e = session.history[h];
        const scores = Object.keys(session.cumulativeScores)
          .map((seat) => `${BOT_NAMES[seat]}=${session.cumulativeScores[seat]}`).join('  ');
        console.log(`\n──── Round ${e.roundNumber} done — declarer seat ${e.declarerSeat} (${BOT_NAMES[e.declarerSeat]}) ────`);
        console.log(`     scores: ${scores}\n`);
      }
      lastRounds = session.history.length;
    }

    const top = Math.max(...Object.values(session.cumulativeScores));
    const stalled = Date.now() - lastActivity > 15000;
    const tooLong = Date.now() - startedAt > 480000;
    if (top >= VICTORY_THRESHOLD || stalled || tooLong) {
      clearInterval(poll);
      const entries = Object.keys(session.cumulativeScores)
        .map((seat) => ({ name: BOT_NAMES[seat], score: session.cumulativeScores[seat] }))
        .sort((a, b) => b.score - a.score);
      console.log('\n════════════════════════════════════════════════════════════');
      if (top >= VICTORY_THRESHOLD) {
        console.log(`  🏆 VICTORY — ${entries[0].name} reaches ${entries[0].score} (≥ ${VICTORY_THRESHOLD})`);
      } else if (stalled) {
        console.log('  ⚠️  stopped — no round progress for 15 s');
      } else {
        console.log('  ⚠️  stopped — wall-clock cap reached');
      }
      console.log('  FINAL STANDINGS');
      entries.forEach((e, i) => console.log(`   ${i + 1}. ${e.name.padEnd(9)} ${e.score}`));
      console.log(`  Rounds played: ${session.history.length}`);
      console.log('════════════════════════════════════════════════════════════\n');
      store._botDriver.clearForGame(gameId);
    }
  }, 120);
}

main();
