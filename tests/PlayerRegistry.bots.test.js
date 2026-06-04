'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const PlayerRegistry = require('../src/services/PlayerRegistry');

// per FR-001, FR-012, FR-016 — a bot is a socketless, token-less player record
// carrying a persistent aggressiveness trait, and serializePlayers exposes isBot.
describe('PlayerRegistry.createBot', () => {
  it('creates a socketless, token-less player flagged isBot', () => {
    const registry = new PlayerRegistry();
    const { playerId } = registry.createBot('Robo-Ada');
    const bot = registry.players.get(playerId);
    assert.equal(bot.isBot, true);
    assert.equal(bot.nickname, 'Robo-Ada');
    assert.equal(bot.sessionToken, null);
    assert.ok(bot.sockets instanceof Set);
    assert.equal(bot.sockets.size, 0);
  });

  it('assigns a persistent aggressiveness in [0, 1]', () => {
    const registry = new PlayerRegistry();
    const { playerId } = registry.createBot('Robo-Max');
    const { aggressiveness } = registry.players.get(playerId);
    assert.equal(typeof aggressiveness, 'number');
    assert.ok(aggressiveness >= 0 && aggressiveness <= 1);
  });

  it('assigns a persistent memorySkill in [0, 1]', () => { // per FR-009
    const registry = new PlayerRegistry();
    const { playerId } = registry.createBot('Robo-Mem');
    const { memorySkill } = registry.players.get(playerId);
    assert.equal(typeof memorySkill, 'number');
    assert.ok(memorySkill >= 0 && memorySkill <= 1);
  });

  it('assigns an integer memorySeed for the deterministic recall draw', () => { // per FR-010
    const registry = new PlayerRegistry();
    const { playerId } = registry.createBot('Robo-Seed');
    const { memorySeed } = registry.players.get(playerId);
    assert.equal(typeof memorySeed, 'number');
    assert.ok(Number.isInteger(memorySeed));
  });

  it('gives independent traits to different bots (no shared memory state)', () => { // per FR-010, FR-011
    const registry = new PlayerRegistry();
    const a = registry.players.get(registry.createBot('Robo-A').playerId);
    const b = registry.players.get(registry.createBot('Robo-B').playerId);
    // Seeds are drawn from a wide range, so two successive bots must differ
    // (a collision would make their per-card recall draws identical).
    assert.notEqual(a.memorySeed, b.memorySeed);
  });

  it('is NOT registered in the session-token index', () => {
    const registry = new PlayerRegistry();
    const { playerId } = registry.createBot('Robo-Vera');
    const bot = registry.players.get(playerId);
    // A bot has a null token; the token index must never resolve to it.
    assert.equal(registry.findBySessionToken(bot.sessionToken), null);
    assert.equal(registry._tokenIndex.size, 0);
  });

  it('returns distinct ids for successive bots', () => {
    const registry = new PlayerRegistry();
    const a = registry.createBot('Robo-Ada');
    const b = registry.createBot('Robo-Max');
    assert.notEqual(a.playerId, b.playerId);
  });
});

describe('PlayerRegistry.serializePlayers — isBot', () => {
  it('includes isBot for both humans and bots', () => {
    const registry = new PlayerRegistry();
    const { playerId: human } = registry.create({}, '127.0.0.1');
    const { playerId: bot } = registry.createBot('Robo-Ada');
    registry.players.get(human).nickname = 'Kashka';
    const game = { players: new Set([human, bot]) };

    const view = registry.serializePlayers(game);
    assert.deepEqual(view[0], { nickname: 'Kashka', isBot: false });
    // The human entry exposes no id; the bot entry exposes its id for host removal.
    assert.equal(view[0].id, undefined);
    assert.equal(view[1].nickname, 'Robo-Ada');
    assert.equal(view[1].isBot, true);
    assert.equal(view[1].id, bot);
  });
});
