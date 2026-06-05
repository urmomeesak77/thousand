'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/services/Game');
const GameHistory = require('../src/services/GameHistory');

describe('Game owns a fresh action history', () => {
  it('starts a new game with an empty action log', () => {
    const game = new Game({ gameId: 'g1', seatOrder: ['a', 'b', 'c'], dealerSeat: 0, playerCount: 3 });
    assert.ok(game.actionHistory instanceof GameHistory);
    assert.deepEqual(game.actionHistory.toView(), []);
  });

  it('each game gets its own independent log', () => {
    const g1 = new Game({ gameId: 'g1', seatOrder: ['a', 'b', 'c'], dealerSeat: 0, playerCount: 3 });
    g1.actionHistory.recordBid(0, 100, 1);
    const g2 = new Game({ gameId: 'g2', seatOrder: ['d', 'e', 'f'], dealerSeat: 0, playerCount: 3 });
    assert.deepEqual(g2.actionHistory.toView(), []);
    assert.equal(g1.actionHistory.toView().length, 1);
  });
});
