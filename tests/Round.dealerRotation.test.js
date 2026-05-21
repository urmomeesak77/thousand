'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');
const Game = require('../src/services/Game');

function makeRound(dealerSeat = 0) {
  const pids = ['p0', 'p1', 'p2'];
  const game = { players: new Set(pids) };
  game.session = new Game({ gameId: 'g', seatOrder: pids, dealerSeat });
  const store = {
    players: new Map([
      ['p0', { nickname: 'P0' }],
      ['p1', { nickname: 'P1' }],
      ['p2', { nickname: 'P2' }],
    ]),
  };
  const round = new Round({ game, store });
  round.start();
  round.advanceFromDealingToBidding();
  return round;
}

// per FR-016
describe('Round honors rotated dealerSeat from Game session', () => {
  it('round inherits dealerSeat=1 from session', () => {
    const round = makeRound(1);
    assert.equal(round.dealerSeat, 1);
  });

  it('round inherits dealerSeat=2 from session', () => {
    const round = makeRound(2);
    assert.equal(round.dealerSeat, 2);
  });

  it('bidding starts at seat (dealer+1)%3 when dealer is seat 1', () => {
    const round = makeRound(1);
    assert.equal(round.currentTurnSeat, 2);
  });

  it('bidding starts at seat (dealer+1)%3 when dealer is seat 2', () => {
    const round = makeRound(2);
    assert.equal(round.currentTurnSeat, 0);
  });

  it('forced last bidder on all-pass is the dealer (seat 1)', () => {
    const round = makeRound(1);
    round.submitPass(2);
    round.submitPass(0);
    assert.equal(round.phase, 'bidding');
    assert.equal(round.currentTurnSeat, 1, 'dealer (seat 1) is the forced last bidder');
    const r = round.submitBid(1, 100);
    assert.equal(r.resolved, true);
    assert.equal(round.declarerSeat, 1);
    assert.equal(round.currentHighBid, 100);
  });

  it('forced last bidder on all-pass is the dealer (seat 2)', () => {
    const round = makeRound(2);
    round.submitPass(0);
    round.submitPass(1);
    assert.equal(round.currentTurnSeat, 2);
    const r = round.submitBid(2, 100);
    assert.equal(r.resolved, true);
    assert.equal(round.declarerSeat, 2);
  });
});

describe('Round falls back to dealerSeat=0 when session is absent (test scaffold)', () => {
  it('uses dealerSeat=0 without a session on the game', () => {
    const game = { players: new Set(['p0', 'p1', 'p2']) };
    const store = { players: new Map([['p0', {}], ['p1', {}], ['p2', {}]]) };
    const round = new Round({ game, store });
    round.start();
    round.advanceFromDealingToBidding();
    assert.equal(round.dealerSeat, 0);
    assert.equal(round.currentTurnSeat, 1);
  });
});
