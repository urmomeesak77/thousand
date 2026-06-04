'use strict';

const BotStrategy = require('./BotStrategy');
const BotMemory = require('./BotMemory');

// Randomized 1–3 s turn delay (FR-009) so bot play feels human and never instant.
const MIN_DELAY_MS = 1000;
const DELAY_SPREAD_MS = 2000;

// Reacts to turn-changing broadcasts the way a human client reacts to phase_changed:
// whenever a bot has a pending obligation it schedules a delayed action, then on fire
// re-reads authoritative state and executes exactly one action through the same
// RoundActionHandler a human's WebSocket message would invoke (so legality and
// broadcast/scoring are enforced identically — FR-006/FR-007/FR-010).
class BotTurnDriver {
  constructor(store, actionHandler) {
    this._store = store;
    this._handler = actionHandler;
    this._timers = new Map(); // `${gameId}:${botId}` -> timeout handle (one pending per bot)
  }

  // Schedule each bot that currently owes an action and isn't already pending.
  onStateChanged(game) {
    if (!game || !game.round) { return; }
    // The game may have been torn down by the action that triggered this hook
    // (e.g. victory cleanup). Don't schedule bots for a game no longer in the store.
    if (this._store.games.get(game.id) !== game) { return; }
    for (const botId of this._botIds(game)) {
      const key = `${game.id}:${botId}`;
      if (this._timers.has(key)) { continue; }
      if (this._decisionFor(game.id, botId) === null) { continue; }
      const delay = MIN_DELAY_MS + Math.random() * DELAY_SPREAD_MS;
      const timer = setTimeout(() => this._fire(game.id, botId), delay);
      if (typeof timer.unref === 'function') { timer.unref(); }
      this._timers.set(key, timer);
    }
  }

  // Re-read state at fire time (robust to interleaved human actions) and execute once.
  _fire(gameId, botId) {
    this._timers.delete(`${gameId}:${botId}`);
    const decision = this._decisionFor(gameId, botId);
    if (decision) { this._execute(botId, decision); }
  }

  _decisionFor(gameId, botId) {
    const game = this._store.games.get(gameId);
    if (!game || !game.round) { return null; }
    const player = this._store.players.get(botId);
    if (!player?.isBot) { return null; }
    const seat = game.round.seatByPlayer.get(botId);
    if (seat === null || seat === undefined) { return null; }
    const knowledge = BotTurnDriver._knowledgeFor(game, player);
    return BotStrategy.decide(game.round, seat, player.aggressiveness, knowledge);
  }

  // Recalled-gone knowledge for the acting bot (feature 010), built fresh each decision
  // from the round's play log via the bot's own memory traits. Only meaningful during
  // trick-play; every other phase gets the empty default (identical to feature 009).
  // `game.history.length` salts the recall draw so each round forgets differently.
  static _knowledgeFor(game, player) {
    const round = game.round;
    if (round.phase !== 'trick-play') { return { goneCardIds: new Set() }; }
    const memory = new BotMemory(player.memorySkill, player.memorySeed);
    const roundKey = game.history ? game.history.length : 0;
    const goneCardIds = memory.recalledGoneCardIds(
      round.playedLog || [], round.trickNumber, roundKey,
    );
    return { goneCardIds };
  }

  _execute(botId, decision) {
    const h = this._handler;
    switch (decision.kind) {
      case 'bid': return h.handleBid(botId, decision.amount);
      case 'pass': return h.handlePass(botId);
      case 'startGame': return h.handleStartGame(botId);
      case 'sellPass': return h.handleSellPass(botId);
      case 'sellStart': return h.handleSellStart(botId);
      case 'sellSelect': return h.handleSellSelect(botId, decision.cardIds);
      case 'sellBid': return h.handleSellBid(botId, decision.amount);
      case 'exchangePass': return h.handleExchangePass(botId, decision.cardId, decision.toSeat);
      case 'playCard': return h.handlePlayCard(botId, decision.cardId, decision.declareMarriage === true);
      case 'crawlCommit': return h.handleCrawlCommit(botId, decision.cardId);
      case 'acknowledgeFourNines': return h.handleAcknowledgeFourNines(botId);
      case 'continueToNextRound': return h.handleContinueToNextRound(botId);
      default: return undefined;
    }
  }

  _botIds(game) {
    const ids = [];
    for (const pid of game.players) {
      if (this._store.players.get(pid)?.isBot) { ids.push(pid); }
    }
    return ids;
  }

  // Cancel any pending bot timers for a torn-down game (alongside the round/game).
  clearForGame(gameId) {
    const prefix = `${gameId}:`;
    for (const [key, timer] of this._timers) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this._timers.delete(key);
      }
    }
  }
}

module.exports = BotTurnDriver;
