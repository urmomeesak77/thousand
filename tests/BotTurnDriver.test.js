'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const BotTurnDriver = require('../src/services/bots/BotTurnDriver');

// A stub RoundActionHandler that records the calls the driver makes.
function makeHandler() {
  const calls = [];
  const rec = (name) => (...args) => calls.push({ name, args });
  return {
    calls,
    handleStartGame: rec('handleStartGame'),
    handleContinueToNextRound: rec('handleContinueToNextRound'),
    handleBid: rec('handleBid'),
    handlePass: rec('handlePass'),
    handleSellPass: rec('handleSellPass'),
    handleSellStart: rec('handleSellStart'),
    handleSellSelect: rec('handleSellSelect'),
    handleSellBid: rec('handleSellBid'),
    handleExchangePass: rec('handleExchangePass'),
    handlePlayCard: rec('handlePlayCard'),
    handleCrawlCommit: rec('handleCrawlCommit'),
    handleAcknowledgeFourNines: rec('handleAcknowledgeFourNines'),
  };
}

// Minimal store with one game whose round we can mutate between schedule and fire.
function makeStore(round) {
  const botId = 'bot-1';
  const players = new Map([[botId, { id: botId, isBot: true, aggressiveness: 0.5 }]]);
  const game = { id: 'g1', players: new Set([botId]), round };
  const store = { games: new Map([['g1', game]]), players };
  return { store, game, botId };
}

// per FR-006, FR-009, FR-015
describe('BotTurnDriver', () => {
  it('schedules and fires one action for a bot with a pending obligation', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const round = { phase: 'post-bid-decision', declarerSeat: 0, currentHighBid: 100, attemptCount: 0, hands: { 0: [0] }, deck: [{ id: 0, rank: '9', suit: 'D' }], seatByPlayer: new Map([['bot-1', 0]]) };
    const { store, game } = makeStore(round);
    const handler = makeHandler();
    const driver = new BotTurnDriver(store, handler);

    driver.onStateChanged(game);
    assert.equal(handler.calls.length, 0, 'nothing fires before the delay elapses');
    t.mock.timers.tick(3000);
    assert.deepEqual(handler.calls.map((c) => c.name), ['handleStartGame']);
    assert.deepEqual(handler.calls[0].args, ['bot-1']);
  });

  it('does not schedule a bot with no current obligation', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    // The bot is seat 1, but seat 0 is the declarer → no obligation in post-bid-decision.
    const round = { phase: 'post-bid-decision', declarerSeat: 0, seatByPlayer: new Map([['bot-1', 1]]) };
    const { store, game } = makeStore(round);
    const handler = makeHandler();
    const driver = new BotTurnDriver(store, handler);

    driver.onStateChanged(game);
    t.mock.timers.tick(3000);
    assert.equal(handler.calls.length, 0);
  });

  it('re-reads state at fire time rather than trusting the scheduled state', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const round = { phase: 'post-bid-decision', declarerSeat: 0, currentHighBid: 100, attemptCount: 0, hands: { 0: [0] }, deck: [{ id: 0, rank: '9', suit: 'D' }], seatByPlayer: new Map([['bot-1', 0]]) };
    const { store, game } = makeStore(round);
    const driver = new BotTurnDriver(store, makeHandler());
    const handler = driver._handler;

    driver.onStateChanged(game); // scheduled while the obligation is "start game"
    // A human action lands first and the round moves on before the timer fires.
    round.phase = 'round-summary';
    round._game = { session: { continuePresses: new Set() } };
    t.mock.timers.tick(3000);
    assert.deepEqual(handler.calls.map((c) => c.name), ['handleContinueToNextRound']);
  });

  it('debounces double-schedules to a single pending timer', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const round = { phase: 'post-bid-decision', declarerSeat: 0, currentHighBid: 100, attemptCount: 0, hands: { 0: [0] }, deck: [{ id: 0, rank: '9', suit: 'D' }], seatByPlayer: new Map([['bot-1', 0]]) };
    const { store, game } = makeStore(round);
    const handler = makeHandler();
    const driver = new BotTurnDriver(store, handler);

    driver.onStateChanged(game);
    driver.onStateChanged(game); // ignored — a timer is already pending for this bot
    t.mock.timers.tick(3000);
    assert.equal(handler.calls.length, 1, 'exactly one action despite two schedule requests');
  });

  it('clears pending timers on game teardown', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const round = { phase: 'post-bid-decision', declarerSeat: 0, currentHighBid: 100, attemptCount: 0, hands: { 0: [0] }, deck: [{ id: 0, rank: '9', suit: 'D' }], seatByPlayer: new Map([['bot-1', 0]]) };
    const { store, game } = makeStore(round);
    const handler = makeHandler();
    const driver = new BotTurnDriver(store, handler);

    driver.onStateChanged(game);
    driver.clearForGame('g1');
    t.mock.timers.tick(3000);
    assert.equal(handler.calls.length, 0, 'a torn-down game fires no bot actions');
  });
});
